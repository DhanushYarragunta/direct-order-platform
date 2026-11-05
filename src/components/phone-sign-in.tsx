"use client";
import Link from "next/link";
import { useState } from "react";
import { request } from "@/lib/client";
import { ErrorNotice } from "./ui";

export function PhoneSignIn({ complete }: { complete: (role: string) => Promise<void> }) {
  const [challenge, setChallenge] = useState<{ challengeId: string; demoCode: string } | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      if (!challenge) {
        setChallenge(await request("/api/auth/phone/request", "POST", {
          phone: form.get("phone"), name: form.get("name"), consent: form.get("consent") === "on",
          marketingOptIn: form.get("marketing") === "on",
        }));
      } else {
        const result = await request<{ role: string }>("/api/auth/phone/verify", "POST", {
          challengeId: challenge.challengeId, code: form.get("code"),
        });
        await complete(result.role);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <form className="form-stack phone-sign-in" onSubmit={submit}>
    <p className="privacy-callout">Demo phone sign-in uses a code shown on screen. No SMS is sent and this does not verify ownership of a real number.</p>
    {!challenge ? <>
      <label>Your name<input name="name" autoComplete="name" minLength={2} maxLength={70} required /></label>
      <label>Mobile number<input name="phone" type="tel" autoComplete="tel-national" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} required /></label>
      <label className="check-label"><input name="consent" type="checkbox" required /><span>I agree to using my details to fulfil orders and send order updates, as explained in the <Link href="/privacy">privacy notice</Link>.</span></label>
      <label className="check-label"><input name="marketing" type="checkbox" /><span>Send me offers and kitchen news. Optional for new accounts.</span></label>
    </> : <>
      <p role="status">Demo code: <strong>{challenge.demoCode}</strong>. Expires in five minutes; five attempts maximum.</p>
      <label>Six-digit code<input name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus /></label>
      <button type="button" className="text-button" disabled={busy} onClick={() => { setChallenge(null); setError(""); }}>Use another number or request a new code</button>
    </>}
    {error && <ErrorNotice message={error} />}
    <button className="button primary full" disabled={busy}>{busy ? "Please wait…" : challenge ? "Verify code and sign in" : "Get demo code"}</button>
  </form>;
}
