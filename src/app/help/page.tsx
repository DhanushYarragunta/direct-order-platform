import type { Metadata } from "next";
import Link from "next/link";
import "@/components/privacy.css";

export const metadata: Metadata = { title: "Help, payments & refunds — Deccan Kitchen" };

export default function HelpPage() {
  const support = process.env.SUPPORT_EMAIL?.trim();
  const validEmail = support && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support);
  return <article className="page privacy-page">
    <p className="eyebrow">HERE TO HELP</p>
    <h1>Your order, explained.</h1>
    <p className="privacy-lead">Get help with your account, find payment receipts and follow a refund.</p>
    <section id="account-access"><h2>Signing in and email codes</h2>
      <p>Already have an account? <Link href="/login">Sign in with your email or mobile number and password</Link>. You do not need an email code for ordinary sign-in.</p>
      <p>Creating an account or resetting a password requires a verification code. If the site says email verification is unavailable for your address, contact support to arrange access. Repeated requests will not resolve that restriction.</p>
      <p>If a code was sent, check your inbox and spam folder. Codes expire after five minutes; use the most recently requested code.</p>
    </section>
    <section><h2>Payments</h2>
      <p>Your final total includes the displayed GST, delivery charge and applied discounts. Available payment methods appear in the secure checkout window. The kitchen receives your order after the payment provider confirms payment.</p>
      <p>If a payment window closes after money is debited, open <Link href="/orders">your orders</Link> and wait for confirmation before paying again. Keep the payment reference for support. A payment arriving after checkout expires is refunded instead of creating a new kitchen order.</p>
    </section>
    <section><h2>Cancellations and refunds</h2>
      <p>You can cancel from your order page while the order is placed and the kitchen has not started preparation. Once preparation starts, contact the restaurant about your request.</p>
      <p>An eligible cancellation requests a full refund to the original payment method. Reserved loyalty points are returned. The order page distinguishes a pending refund from one confirmed by the payment provider. Your bank or payment app may take additional time to show the credit.</p>
      <p>If an item becomes unavailable before a successful payment is confirmed, the order is cancelled and the captured payment is refunded. No replacement is ordered automatically.</p>
    </section>
    <section><h2>Receipts and updates</h2>
      <p>Download a PDF payment receipt from a paid order’s page. It includes the items, discounts, GST, delivery fee and payment status. It is a payment receipt; contact the restaurant if you need a statutory tax invoice.</p>
      <p>Verify your email or mobile number in <Link href="/privacy">Privacy & account</Link> to receive order updates when those services are enabled. Your order page stays available if an email or SMS cannot be delivered. Marketing preferences are separate from essential order updates.</p>
    </section>
    <section><h2>Get in touch</h2>
      <p>Describe the issue and include your order number if you have one. Never share your password, one-time code, full card number or UPI PIN.</p>
      {validEmail ? <a className="button secondary" href={`mailto:${support}`}>Email order support</a>
        : <p>Find the fulfilling outlet and its address on your order. Online support contact details will appear here when the restaurant enables them.</p>}
      <p><Link href="/orders">Open my orders</Link> · <Link href="/privacy">Account and privacy help</Link></p>
    </section>
  </article>;
}
