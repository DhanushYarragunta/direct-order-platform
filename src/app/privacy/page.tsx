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
      <p>Your name, email and phone sign-in identifiers, hashed password, consent choices, order history, delivery address, contact number, instructions, party requests and loyalty entries. Payment records include the method, amount, gateway reference and refund status. Hosted Razorpay checkout collects payment credentials directly; this application does not store card numbers, CVVs or UPI PINs.</p>
      <p>Addresses you save to your profile include a Home, Work or Other label, recipient name and phone, house or building details, area, city, pincode and selected map coordinates. Your default address and its contact details can be filled in for later orders. You can review or change them before ordering.</p>
      <p>A necessary, HTTP-only session cookie keeps you signed in for 15 days from your most recent sign-in on this browser, including when you close and reopen it. Signing out, deleting your account or resetting your password ends that access sooner. Your browser stores the cart and checkout recovery identifiers locally. Checkout start and completion timestamps support aggregate checkout-time reporting. We do not add advertising trackers.</p>
    </section>
    <section><h2>Who can use your details</h2>
      <p>You can access your own orders. Assigned outlet staff can see the details needed to prepare and fulfil them, and administrators can manage outlet operations. Marketing uses your separate opt-in; withdrawing it here takes effect immediately. When enabled, Razorpay processes payments, Amazon SES or Resend sends email, and AWS End User Messaging or Twilio sends mobile codes and order updates. These providers receive the data needed for that service. Their processing and retention are also subject to their own terms. No advertising integration is connected.</p>
      <p>When you use address search, your search text goes through our server to Photon, which searches OpenStreetMap place data. We do not add your account name, email or phone number to that request. Search for an area, building or landmark, then add your flat and recipient details after choosing a suggestion. The application does not keep an address-search history; hosting and search providers may retain request information under their own policies.</p>
    </section>
    <section><h2>Retention and deletion</h2>
      <p>Account and order history remain until you request deletion; this version does not automatically remove old completed orders. Expired sign-in sessions and email/phone challenges are cleaned by the background worker. Verification and password-reset codes expire after five minutes and can be used only once.</p>
      <p>Saved addresses remain until you remove them from your profile or delete your account. Your account-data export includes these addresses. Removing a saved address does not change the address already recorded on a past order.</p>
      <p>Customer deletion removes saved addresses, contact details, free-text notes and messages from the active database and revokes all sessions. Anonymized financial and operational records remain. Orders in progress must be completed or cancelled first so essential fulfilment details are not lost. Copies you downloaded stay on your device until you remove them.</p>
      <p>Backup retention and any legally required business records must follow the operator’s published policy. A restored database must reapply completed deletion requests before reopening service.</p>
    </section>
    <section><h2>Help and corrections</h2>
      <p>Use your profile to update your name and phone number, manage saved addresses and choose a default. Changing your phone clears its verification; saving a number does not verify ownership or enable SMS recovery. Use the settings above to export data, withdraw marketing consent or delete a customer account. For an email correction or an active order issue, contact the outlet shown on your order.</p>
      <p>{contact ? `Privacy contact: ${contact}` : "A business privacy contact and approved retention schedule must be configured before this service accepts real customer data."}</p>
    </section>
  </article>;
}
