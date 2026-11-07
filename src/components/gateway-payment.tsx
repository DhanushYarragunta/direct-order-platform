"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { request } from "@/lib/client";
import { money } from "@/lib/domain";
import { ErrorNotice } from "./ui";

type GatewaySession = {
  provider: "razorpay";
  keyId: string;
  providerOrderId: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
};
type Confirmation = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type CheckoutInstance = {
  open: () => void;
  close: () => void;
  on: (event: "payment.failed", callback: () => void) => void;
};
type CheckoutConstructor = new (options: {
  key: string; order_id: string; amount: number; currency: string;
  name: string; description: string; theme: { color: string };
  handler: (result: Confirmation) => void;
  modal: { ondismiss: () => void; confirm_close: boolean };
}) => CheckoutInstance;

export function GatewayPayment({ orderId, totalPaise, nonce, testMode, onComplete }: {
  orderId: string; totalPaise: number; nonce: string; testMode: boolean;
  onComplete: () => Promise<unknown>;
}) {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const checkout = useRef<CheckoutInstance | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; checkout.current?.close(); };
  }, []);
  async function pay() {
    setBusy(true); setError(""); setNotice("");
    try {
      const session = await request<GatewaySession>(`/api/orders/${orderId}/gateway`, "POST", {});
      if (!mounted.current) return;
      const Razorpay = (window as unknown as { Razorpay?: CheckoutConstructor }).Razorpay;
      if (!Razorpay) throw new Error("The secure payment window could not load. Refresh this page and try again.");
      if (session.amount !== totalPaise || session.currency !== "INR")
        throw new Error("The payment total changed. Refresh your order before paying.");
      const instance = new Razorpay({
        key: session.keyId, order_id: session.providerOrderId, amount: session.amount,
        currency: session.currency, name: session.name, description: session.description,
        theme: { color: "#b86d16" },
        modal: { confirm_close: true, ondismiss: () => {
          if (!mounted.current) return;
          setBusy(false);
          setNotice("Payment window closed. If you paid, confirmation will appear here automatically.");
          void onComplete();
        } },
        handler: async (result) => {
          if (mounted.current) setNotice("Checking your payment with the gateway…");
          try {
            await request(`/api/orders/${orderId}/gateway/verify`, "POST", result);
            await onComplete();
            if (mounted.current) setNotice("Payment details received. This page updates when the gateway confirms your payment.");
          } catch (e) {
            if (mounted.current) setError(`${(e as Error).message} If money was debited, please wait for the order to update before trying again.`);
          } finally { if (mounted.current) setBusy(false); }
        },
      });
      instance.on("payment.failed", () => {
        if (mounted.current) setError("The gateway could not complete this attempt. You can retry in the payment window or close it to check your order.");
        void onComplete();
      });
      checkout.current = instance;
      instance.open();
    } catch (e) {
      if (mounted.current) { setError((e as Error).message); setBusy(false); }
    }
  }
  return <div className="gateway-payment">
    <Script src="https://checkout.razorpay.com/v1/checkout.js" nonce={nonce}
      strategy="afterInteractive" onReady={() => setReady(true)}
      onError={() => setError("The payment service could not load. Check your connection and refresh this page.")} />
    <div className="gateway-assurance"><ShieldCheck size={22} /><div>
      <strong>Secure checkout with Razorpay</strong>
      <p>Choose UPI, card or another available method in the payment window. Payment details go directly to Razorpay.</p>
    </div></div>
    {testMode && <p className="privacy-callout">Razorpay test mode. Use the gateway’s test payment details; no real payment is collected.</p>}
    {error && <ErrorNotice message={error} />}
    {notice && <p className="pending-notice" role="status">{notice}</p>}
    <button className="button primary full" onClick={pay} disabled={!ready || busy}>
      {busy ? "Confirming payment…" : !ready ? "Loading secure payment…" : `Pay ${money(totalPaise)}${testMode ? " · test mode" : " securely"}`}
      <ArrowRight size={17} />
    </button>
  </div>;
}
