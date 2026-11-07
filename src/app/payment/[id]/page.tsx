import { PaymentScreen } from "@/components/order-screens";
import { headers } from "next/headers";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const provider = process.env.PAYMENT_PROVIDER || (process.env.DEMO_MODE === "true" ? "demo" : "disabled");
  const configured = provider === "razorpay" && Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET)
    && !(process.env.DEMO_MODE === "true" && process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_"));
  return <PaymentScreen id={(await params).id} paymentProvider={provider}
    gatewayConfigured={configured} gatewayTestMode={!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_")}
    nonce={(await headers()).get("x-nonce") || ""} />;
}
