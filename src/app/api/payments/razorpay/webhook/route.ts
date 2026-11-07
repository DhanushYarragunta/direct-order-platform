import { api } from "@/lib/http";
import { readRazorpayWebhook } from "@/lib/razorpay";
import { enqueueGatewayWebhook } from "@/lib/gateway-webhooks";

export const runtime = "nodejs";
export async function POST(request: Request) {
  // A provider webhook has no browser session/origin. Its raw-body HMAC is the
  // authority; no route accepts a browser assertion that a payment succeeded.
  // Acknowledge durable receipt promptly. Provider lookups and settlement run
  // from the worker, keeping slow gateway responses outside its five-second deadline.
  return api(async () => enqueueGatewayWebhook(await readRazorpayWebhook(request)));
}
