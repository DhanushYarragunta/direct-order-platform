import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "./auth";

// Only the public key is returned to Checkout. Secrets stay in this module's
// server callers; no customer card, UPI credential or provider payload is stored.
export function paymentProvider(): "demo" | "razorpay" | "disabled" {
  const provider = process.env.PAYMENT_PROVIDER || (process.env.DEMO_MODE === "true" ? "demo" : "disabled");
  if (provider === "razorpay") return "razorpay";
  return provider === "demo" && process.env.DEMO_MODE === "true" ? "demo" : "disabled";
}

export function razorpayConfigured() {
  return Boolean(/^rzp_(test|live)_[A-Za-z0-9_]+$/.test(process.env.RAZORPAY_KEY_ID || "") && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET)
    && !(process.env.DEMO_MODE === "true" && process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_"));
}

export function razorpayTestMode() {
  return razorpayKeys().keyId.startsWith("rzp_test_");
}

export function razorpayKeys() {
  if (!razorpayConfigured()) throw new AppError(503, "Online payments are not configured yet. Please contact the restaurant.");
  return { keyId: process.env.RAZORPAY_KEY_ID!, keySecret: process.env.RAZORPAY_KEY_SECRET! };
}

export function validRazorpaySignature(payload: string | Uint8Array, signature: string, secret: string) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

const identifier = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`)).max(100);
export const gatewayVerifySchema = z.object({
  razorpay_order_id: identifier("order"),
  razorpay_payment_id: identifier("pay"),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const remoteOrderSchema = z.object({
  id: identifier("order"), amount, currency: z.string(), receipt: z.string(), status: z.string(),
});
const remotePaymentSchema = z.object({
  id: identifier("pay"), order_id: identifier("order").nullable(), amount,
  currency: z.string(), status: z.string(), captured: z.boolean(),
  amount_refunded: amount.default(0), method: z.string().max(50),
});
const remoteRefundSchema = z.object({
  id: identifier("rfnd"), payment_id: identifier("pay"), amount,
  currency: z.string(), status: z.enum(["pending", "processed", "failed"]),
});
export type RazorpayOrder = z.infer<typeof remoteOrderSchema>;
export type RazorpayPayment = z.infer<typeof remotePaymentSchema>;
export type RazorpayRefund = z.infer<typeof remoteRefundSchema>;

class ProviderError extends AppError {
  constructor(public providerStatus: number) {
    super(503, "The payment service is temporarily unavailable. Please retry; any completed payment will be reconciled automatically.");
  }
}

// Fixed operator-facing messages only: gateway response bodies can contain
// customer data, so never persist them in the audit log or Services dashboard.
export function refundFailureDetail(error: unknown) {
  if (!(error instanceof ProviderError)) return "Refund confirmation needs retry or operator review.";
  if (error.providerStatus === 400)
    return "Razorpay rejected the refund (HTTP 400). Check refund balance and payment eligibility in the Razorpay Dashboard; the full refund remains pending.";
  if (error.providerStatus === 401 || error.providerStatus === 403)
    return `Razorpay rejected refund access (HTTP ${error.providerStatus}). Check the matching account credentials and refund permissions.`;
  if (error.providerStatus === 409)
    return "Razorpay is processing an existing refund request (HTTP 409). The same request will be retried safely.";
  return "Razorpay refund confirmation is unavailable. The same request will be retried safely.";
}

async function providerRequest(path: string, method = "GET", data?: unknown, headers: Record<string, string> = {}) {
  const { keyId, keySecret } = razorpayKeys();
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json", ...headers },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  } catch { throw new ProviderError(0); }
  if (!response.ok) throw new ProviderError(response.status);
  try { return await response.json() as unknown; }
  catch { throw new ProviderError(502); }
}

export function assertGatewayOrder(remote: RazorpayOrder, receipt: string, amountPaise: number) {
  if (remote.receipt !== receipt || remote.amount !== amountPaise || remote.currency !== "INR")
    throw new AppError(409, "The payment order does not match this checkout. Contact the restaurant.");
  return remote;
}

export async function fetchRazorpayOrder(id: string) {
  identifier("order").parse(id);
  return remoteOrderSchema.parse(await providerRequest(`orders/${id}`));
}

export async function findRazorpayOrderByReceipt(receipt: string) {
  const result = z.object({ items: z.array(remoteOrderSchema) }).parse(
    await providerRequest(`orders?receipt=${encodeURIComponent(receipt)}&count=100`));
  return result.items.find((order) => order.receipt === receipt);
}

export async function createOrRecoverRazorpayOrder(receipt: string, amountPaise: number) {
  // Razorpay receipts are unique. Looking up the durable receipt before a retry
  // recovers a successful create whose response/database write was interrupted.
  const previous = await findRazorpayOrderByReceipt(receipt);
  if (previous) return assertGatewayOrder(previous, receipt, amountPaise);
  try {
    const remote = remoteOrderSchema.parse(await providerRequest("orders", "POST", {
      amount: amountPaise, currency: "INR", receipt, partial_payment: false,
    }));
    return assertGatewayOrder(remote, receipt, amountPaise);
  } catch (error) {
    if (error instanceof ProviderError && error.providerStatus === 400) {
      const recovered = await findRazorpayOrderByReceipt(receipt);
      if (recovered) return assertGatewayOrder(recovered, receipt, amountPaise);
    }
    throw error;
  }
}

export async function fetchRazorpayPayment(id: string) {
  identifier("pay").parse(id);
  return remotePaymentSchema.parse(await providerRequest(`payments/${id}`));
}

export async function fetchRazorpayOrderPayments(id: string) {
  identifier("order").parse(id);
  return z.object({ items: z.array(remotePaymentSchema) }).parse(await providerRequest(`orders/${id}/payments`)).items;
}

export async function refundRazorpayPayment(paymentId: string, amountPaise: number, recordId: string) {
  identifier("pay").parse(paymentId);
  return remoteRefundSchema.parse(await providerRequest(`payments/${paymentId}/refund`, "POST", {
    amount: amountPaise, speed: "normal",
  }, { "X-Refund-Idempotency": `refund-${recordId}` }));
}

export async function fetchRazorpayRefund(id: string) {
  identifier("rfnd").parse(id);
  return remoteRefundSchema.parse(await providerRequest(`refunds/${id}`));
}

export async function fetchRazorpayPaymentRefunds(paymentId: string) {
  identifier("pay").parse(paymentId);
  const refunds: RazorpayRefund[] = [];
  // The application creates full refunds only. A bounded page count also
  // accommodates external partial refunds without an unbounded worker scan.
  for (let skip = 0; skip < 1000; skip += 100) {
    const page = z.object({ items: z.array(remoteRefundSchema) }).parse(
      await providerRequest(`payments/${paymentId}/refunds?count=100&skip=${skip}`));
    refunds.push(...page.items);
    if (page.items.length < 100) return refunds;
  }
  throw new AppError(409, "Too many external refunds to reconcile automatically; operator review is required");
}

export async function readRazorpayWebhook(request: Request) {
  const signature = request.headers.get("x-razorpay-signature") || "";
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 131072) { await reader.cancel(); throw new AppError(413, "Webhook is too large"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const raw = Buffer.concat(chunks);
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (!secret) throw new AppError(503, "Payment webhooks are not configured");
  const previous = process.env.RAZORPAY_PREVIOUS_WEBHOOK_SECRET;
  if (!validRazorpaySignature(raw, signature, secret) && !(previous && validRazorpaySignature(raw, signature, previous)))
    throw new AppError(400, "Invalid payment webhook signature");
  try {
    return z.object({ event: z.string(), payload: z.object({
      payment: z.object({ entity: z.object({ id: identifier("pay") }) }).optional(),
      refund: z.object({ entity: z.object({ id: identifier("rfnd"), payment_id: identifier("pay") }) }).optional(),
    }) }).parse(JSON.parse(raw.toString("utf8")));
  } catch { throw new AppError(400, "Invalid payment webhook"); }
}
