import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrRecoverRazorpayOrder, gatewayVerifySchema, paymentProvider,
  razorpayConfigured, readRazorpayWebhook, refundRazorpayPayment, validRazorpaySignature,
} from "../src/lib/razorpay";

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("PAYMENT_PROVIDER", "razorpay");
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_localfixture");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "test-secret");
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "test-webhook-secret");
  vi.stubEnv("RAZORPAY_PREVIOUS_WEBHOOK_SECRET", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Razorpay protocol and configuration", () => {
  it("keeps mock payments explicit and prevents live charging through demo accounts", () => {
    expect(paymentProvider()).toBe("razorpay");
    vi.stubEnv("PAYMENT_PROVIDER", "demo");
    expect(paymentProvider()).toBe("disabled");
    vi.stubEnv("PAYMENT_PROVIDER", "");
    expect(paymentProvider()).toBe("disabled");
    vi.stubEnv("DEMO_MODE", "true");
    expect(paymentProvider()).toBe("demo");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_unsafeindemo");
    expect(razorpayConfigured()).toBe(false);
    vi.stubEnv("DEMO_MODE", "false");
    expect(razorpayConfigured()).toBe(true);
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    expect(razorpayConfigured()).toBe(false);
  });

  it("verifies exact signed bytes and rejects malformed signatures", () => {
    const payload = "order_123|pay_456";
    const signature = createHmac("sha256", "secret").update(payload).digest("hex");
    expect(validRazorpaySignature(payload, signature, "secret")).toBe(true);
    expect(validRazorpaySignature(`${payload} `, signature, "secret")).toBe(false);
    expect(validRazorpaySignature(payload, signature.slice(1), "secret")).toBe(false);
    expect(validRazorpaySignature(payload, "g".repeat(64), "secret")).toBe(false);
    expect(validRazorpaySignature(payload, signature, "")).toBe(false);
    expect(gatewayVerifySchema.safeParse({ razorpay_order_id: "../../payments", razorpay_payment_id: "pay_456", razorpay_signature: signature }).success).toBe(false);
  });

  it("requires a signed bounded raw webhook and supports secret rotation", async () => {
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_123" } } } });
    const signature = createHmac("sha256", "test-webhook-secret").update(raw).digest("hex");
    const request = (body: string, sig = signature) => new Request("https://shop.example/api/payments/razorpay/webhook", {
      method: "POST", body, headers: { "x-razorpay-signature": sig },
    });
    await expect(readRazorpayWebhook(request(raw))).resolves.toMatchObject({ event: "payment.captured" });
    await expect(readRazorpayWebhook(request(`${raw} `))).rejects.toThrow("signature");
    await expect(readRazorpayWebhook(request("a".repeat(131073)))).rejects.toThrow("too large");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "new-secret");
    vi.stubEnv("RAZORPAY_PREVIOUS_WEBHOOK_SECRET", "test-webhook-secret");
    await expect(readRazorpayWebhook(request(raw))).resolves.toMatchObject({ event: "payment.captured" });
  });

  it("recovers an existing remote order by exact durable receipt without creating another", async () => {
    const remote = { id: "order_123", amount: 32000, currency: "INR", receipt: "web_local", status: "created" };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [remote] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(createOrRecoverRazorpayOrder("web_local", 32000)).resolves.toEqual(remote);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/orders?receipt=web_local&count=100");
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
  });

  it("rejects receipt matches with a different amount or currency", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ items: [
      { id: "order_123", amount: 30000, currency: "INR", receipt: "web_local", status: "created" },
    ] })));
    await expect(createOrRecoverRazorpayOrder("web_local", 32000)).rejects.toThrow("does not match");
  });

  it("creates only server-priced INR orders with partial payment disabled", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ items: [] })).mockResolvedValueOnce(Response.json({
      id: "order_123", amount: 32000, currency: "INR", receipt: "web_local", status: "created",
    }));
    vi.stubGlobal("fetch", fetcher);
    await createOrRecoverRazorpayOrder("web_local", 32000);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ amount: 32000, currency: "INR", receipt: "web_local", partial_payment: false });
    expect(fetcher.mock.calls[1][1].redirect).toBe("error");
  });

  it("retries a refund with an unchanged body and provider idempotency key", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({
      id: "rfnd_123", payment_id: "pay_123", amount: 32000, currency: "INR", status: "pending",
    }));
    vi.stubGlobal("fetch", fetcher);
    await refundRazorpayPayment("pay_123", 32000, "localpayment123");
    await refundRazorpayPayment("pay_123", 32000, "localpayment123");
    for (const [, options] of fetcher.mock.calls) {
      expect(options.headers["X-Refund-Idempotency"]).toBe("refund-localpayment123");
      expect(JSON.parse(options.body)).toEqual({ amount: 32000, speed: "normal" });
    }
  });
});
