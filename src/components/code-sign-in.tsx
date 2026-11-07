"use client";
import Link from "next/link";
import { useState } from "react";
import { request } from "@/lib/client";
import { ErrorNotice } from "./ui";

export type CommunicationMethods = { demoMode: boolean; emailCode: boolean; phoneCode: boolean };
type Props = { channel: "phone" | "email"; demoMode: boolean; complete: (role: string) => Promise<void>; purpose?: "sign_in" | "verify_contact"; name?: string; value?: string };
export function CodeSignIn({ channel, demoMode, complete, purpose = "sign_in", name = "", value = "" }: Props) {
  const [challenge, setChallenge] = useState<{ challengeId: string; demoCode?: string; delivery: string } | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const linking = purpose === "verify_contact";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      if (!challenge) {
        setChallenge(await request(`/api/auth/${channel}/request`, "POST", {
          [channel]: form.get(channel), name: form.get("name"), consent: form.get("consent") === "on",
          marketingOptIn: form.get("marketing") === "on", purpose,
        }));
      } else {
        const result = await request<{ role: string }>(`/api/auth/${channel}/verify`, "POST", { challengeId: challenge.challengeId, code: form.get("code") });
        await complete(result.role);
        if (linking) setChallenge(null);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <form key={challenge ? "verification" : "details"} className="form-stack phone-sign-in" onSubmit={submit} aria-busy={busy}>
    {demoMode ? <p className="privacy-callout">Demo {channel} verification shows a code here. It does not send a message or verify ownership for live order updates.</p>
      : <p>{linking ? "Verify this contact to receive order updates and sign in with a code." : channel === "email" ? "Use an email code to sign in or recover access without your password. First-time verification secures the account for email-code sign-in." : "Receive a sign-in code by SMS."}</p>}
    {!challenge ? <>
      <label>Your name<input name="name" autoComplete="name" minLength={2} maxLength={70} required defaultValue={name} /></label>
      {channel === "phone" ? <label>Mobile number<input name="phone" type="tel" autoComplete="tel-national" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} required defaultValue={value} /></label>
        : <label>Email address<input name="email" type="email" autoComplete="email" maxLength={150} required defaultValue={value.endsWith(".invalid") ? "" : value} /></label>}
      <label className="check-label"><input name="consent" type="checkbox" required /><span>I agree to using my details to fulfil orders and send order updates, as explained in the <Link href="/privacy">privacy notice</Link>.</span></label>
      {!linking && <label className="check-label"><input name="marketing" type="checkbox" /><span>Send me offers and kitchen news. Optional for new accounts.</span></label>}
    </> : <>
      <p role="status">{demoMode && challenge.demoCode ? <>Demo code: <strong>{challenge.demoCode}</strong>.</> : <>Check your {channel === "phone" ? "SMS messages" : "email inbox and spam folder"} for the code.</>} Expires in five minutes; five attempts maximum.</p>
      <label>Six-digit code<input name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus /></label>
      <button type="button" className="text-button" disabled={busy} onClick={() => { setChallenge(null); setError(""); }}>Use another {channel === "phone" ? "number" : "email"} or request a new code</button>
    </>}
    {error && <ErrorNotice message={error} />}
    <button className="button primary full" disabled={busy}>{busy ? "Please wait…" : challenge ? linking ? "Verify contact" : "Verify code and sign in" : demoMode ? "Get demo code" : channel === "phone" ? "Send SMS code" : "Send email code"}</button>
  </form>;
}
