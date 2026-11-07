"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { request } from "@/lib/client";
import { useApp } from "./provider";
import { ErrorNotice } from "./ui";
import { CodeSignIn, type CommunicationMethods } from "./code-sign-in";

type Preferences = { name: string; email: string; phone: string | null; emailVerifiedAt: string | null; phoneVerifiedAt: string | null; marketingOptIn: boolean; consentAt: string | null };

export function PrivacyControls() {
  const app = useApp();
  const [data, setData] = useState<Preferences | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [methods, setMethods] = useState<CommunicationMethods | null>(null);
  useEffect(() => {
    let active = true;
    void request<CommunicationMethods>("/api/auth/methods").then(value => { if (active) setMethods(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  async function contactVerified() {
    await app.refreshUser();
    setData(await request<Preferences>("/api/account"));
    setMessage(app.demoMode ? "Demo contact saved. Live ownership has not been verified." : "Contact verified. Future order updates can use this contact when delivery is enabled.");
  }
  useEffect(() => {
    let cancelled = false;
    if (app.user) void request<Preferences>("/api/account").then((value) => { if (!cancelled) setData(value); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    else setData(null);
    return () => { cancelled = true; };
  }, [app.user?.id]);
  async function marketing(value: boolean) {
    if (!data || busy) return;
    const previous = data.marketingOptIn;
    // Controlled inputs must adopt the click immediately, even on a slow network.
    setData((current) => current ? { ...current, marketingOptIn: value } : current);
    setBusy(true); setError(""); setMessage("");
    try {
      await request("/api/account", "PATCH", { marketingOptIn: value });
      setMessage(value ? "You opted in to offers. You can withdraw at any time." : "Marketing consent withdrawn. Essential order updates continue.");
    } catch (e) {
      setData((current) => current ? { ...current, marketingOptIn: previous } : current);
      setError((e as Error).message);
    }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError(""); setMessage("");
    try {
      const payload = await request("/api/account/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "deccan-account-data.json"; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Your account export has been downloaded.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmation = new FormData(event.currentTarget).get("confirmation");
    setBusy(true); setError(""); setMessage("");
    try {
      await request("/api/account", "DELETE", { confirmation });
      await app.refreshUser();
      setData(null); setMessage("Your account has been deleted and all sessions revoked. Contact details were removed from the active database.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="privacy-controls" aria-labelledby="privacy-settings-title" aria-busy={busy}>
    <h2 id="privacy-settings-title">Your privacy settings</h2>
    {message && <p className="privacy-success" role="status">{message}</p>}
    {error && <ErrorNotice message={error} />}
    {!app.authReady ? <p>Loading your account…</p> : !app.user ? <p><Link href="/login?next=/privacy">Sign in</Link> to export your data, change marketing consent or delete your customer account.</p> : !data ? <p>Loading preferences…</p> : <>
      <p>Signed in as <strong>{data.name}</strong>{data.phone ? ` · ${data.phone}` : ` · ${data.email}`}.</p>
      <label className="check-label"><input type="checkbox" checked={data.marketingOptIn} disabled={busy} onChange={(e) => void marketing(e.target.checked)} /><span>Send me offers and kitchen news. Optional; switch off to withdraw consent immediately.</span></label>
      <p>Order confirmations and preparation updates are needed to fulfil your orders and are separate from marketing.</p>
      {app.user.role === "CUSTOMER" && <div className="contact-verification">
        <h3>Verified contacts for order updates</h3>
        <p>Email: {data.email.endsWith(".invalid") ? "not added" : data.email} · {data.emailVerifiedAt ? "Verified" : "Not verified"}<br />Phone: {data.phone || "not added"} · {data.phoneVerifiedAt ? "Verified" : "Not verified"}</p>
        <p>Live updates use these verified contacts. A delivery phone number entered at checkout does not verify ownership.</p>
        {(app.demoMode || methods?.emailCode) && <details><summary>Add or verify email</summary><CodeSignIn channel="email" demoMode={app.demoMode} complete={contactVerified} purpose="verify_contact" name={data.name} value={data.email} /></details>}
        {(app.demoMode || methods?.phoneCode) && <details><summary>Add or verify mobile number</summary><CodeSignIn channel="phone" demoMode={app.demoMode} complete={contactVerified} purpose="verify_contact" name={data.name} value={data.phone || ""} /></details>}
        {!app.demoMode && methods && !methods.emailCode && !methods.phoneCode && <p>Contact verification is not enabled yet.</p>}
      </div>}
      <button type="button" className="button" disabled={busy} onClick={() => void download()}>Download my account data</button>
      {app.user.role === "CUSTOMER" && <details className="privacy-delete">
        <summary>Delete my customer account</summary>
        <p>Deletion signs you out of every device and removes your name, email, phone, addresses, order notes, messages and loyalty balance. Anonymized order amounts, items, timestamps and audit records remain for accounting and aggregate reporting. This cannot be undone.</p>
        <p>Complete or cancel active orders and party requests first. A confirmed future event needs help from the outlet. Download your data before deleting if you want a copy.</p>
        <form onSubmit={remove} className="form-stack">
          <label>Type DELETE to confirm<input name="confirmation" required pattern="DELETE" autoComplete="off" placeholder="DELETE" /></label>
          <button className="button danger" disabled={busy}>{busy ? "Please wait…" : "Permanently delete my account"}</button>
        </form>
      </details>}
    </>}
  </section>;
}
