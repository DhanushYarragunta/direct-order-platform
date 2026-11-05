"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { request } from "@/lib/client";
import { useApp } from "./provider";
import { ErrorNotice } from "./ui";

type Preferences = { name: string; email: string; phone: string | null; marketingOptIn: boolean; consentAt: string | null };

export function PrivacyControls() {
  const app = useApp();
  const [data, setData] = useState<Preferences | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
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
