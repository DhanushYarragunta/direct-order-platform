import type { Metadata } from "next";
import { PrivacyControls } from "@/components/privacy-controls";
import "@/components/privacy.css";

export const metadata: Metadata = { title: "Privacy & account — Deccan Kitchen" };
export default function PrivacyPage() {
  const demo = process.env.DEMO_MODE === "true";
  const contact = process.env.PRIVACY_CONTACT;
  return <article className="page privacy-page">
    <p className="eyebrow">YOUR DETAILS, YOUR CHOICES</p>
    <h1>Privacy & account</h1>
    <p className="privacy-lead">We use your account and order details to prepare your food, support your order and show its progress. Marketing is optional.</p>
    {demo && <p className="privacy-callout">This is a concept restaurant demo with simulated payments, messages and phone codes. Use sample details. Do not enter real card information.</p>}
    <PrivacyControls />
    <section><h2>What the application stores</h2>
      <p>Your name, email or phone sign-in identifier, hashed password when you use email sign-in, consent choices, order history, delivery address, contact number, instructions, party requests and loyalty entries. The test payment gateway stores an outcome and method; it does not collect card numbers or UPI credentials.</p>
      <p>A necessary, HTTP-only session cookie keeps you signed in for up to seven days. Your browser stores the cart and checkout recovery identifiers locally. Checkout start and completion timestamps support aggregate checkout-time reporting. We do not add advertising trackers.</p>
    </section>
    <section><h2>Who can use your details</h2>
      <p>You can access your own orders. Assigned outlet staff can see the details needed to prepare and fulfil them, and administrators can manage outlet operations. Marketing uses your separate opt-in; withdrawing it here takes effect immediately. No delivery-app or advertising integration is connected.</p>
    </section>
    <section><h2>Retention and deletion</h2>
      <p>Account and order history remain until you request deletion; this version does not automatically remove old completed orders. Expired sign-in sessions and phone challenges are cleaned by the background worker. Phone codes expire after five minutes and can be used only once.</p>
      <p>Customer deletion removes contact details, free-text notes and messages from the active database and revokes all sessions. Anonymized financial and operational records remain. Orders in progress must be completed or cancelled first so essential fulfilment details are not lost. Copies you downloaded stay on your device until you remove them.</p>
      <p>Backup retention and any legally required business records must follow the operator’s published policy. A restored database must reapply completed deletion requests before reopening service.</p>
    </section>
    <section><h2>Help and corrections</h2>
      <p>Use the settings above to export data, withdraw marketing consent or delete a customer account. For a correction or an active order issue, contact the outlet shown on your order.</p>
      <p>{contact ? `Privacy contact: ${contact}` : "A business privacy contact and approved retention schedule must be configured before this service accepts real customer data."}</p>
    </section>
  </article>;
}
