"use client";
import Link from "next/link";
import { useState } from "react";
import { request } from "@/lib/client";
import { ErrorNotice } from "./ui";

type Props = { complete: (role: string) => Promise<void> };
type RegistrationChallenge = { challengeId: string; verificationRequired: true; delivery: "email"; expiresAt: string };

export function EmailRegistration({ complete }: Props) {
  const [challenge, setChallenge] = useState<RegistrationChallenge | null>(null);
  const [details, setDetails] = useState({ name: "", email: "", consent: false, marketingOptIn: false });
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      if (!challenge) {
        const input = { name: String(form.get("name") || ""), email: String(form.get("email") || ""),
          consent: form.get("consent") === "on", marketingOptIn: form.get("marketing") === "on" };
        setDetails(input);
        setChallenge(await request<RegistrationChallenge>("/api/auth/register", "POST", input));
      } else {
        const result = await request<{ role: string }>("/api/auth/register/verify", "POST", {
          challengeId: challenge.challengeId, code: form.get("code"), password: form.get("password"),
        });
        await complete(result.role);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  // Remount the inputs between steps: uncontrolled fields must never reuse a
  // password/OTP DOM node as a name or email field when requesting another code.
  return <form key={challenge ? "verification" : "details"} className="form-stack phone-sign-in" onSubmit={submit} aria-busy={busy}>
    {!challenge ? <>
      <p>First, verify your email. We’ll send a code before creating your account.</p>
      <label>Your name<input name="name" autoComplete="name" minLength={2} maxLength={70} required defaultValue={details.name} /></label>
      <label>Email address<input name="email" type="email" autoComplete="email" maxLength={150} required defaultValue={details.email} /></label>
      <label className="check-label"><input name="consent" type="checkbox" required defaultChecked={details.consent} /><span>I agree to using my details to fulfil orders and send order updates, as explained in the <Link href="/privacy">privacy notice</Link>.</span></label>
      <label className="check-label"><input name="marketing" type="checkbox" defaultChecked={details.marketingOptIn} /><span>Send me offers and kitchen news. Optional.</span></label>
    </> : <>
      <p role="status">We sent a verification code to <strong>{details.email}</strong>. Check your inbox and spam folder. It expires in five minutes; five attempts maximum.</p>
      <label>Six-digit code<input name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus /></label>
      <label>Create password<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required placeholder="At least 10 characters" /></label>
      <button type="button" className="text-button" disabled={busy} onClick={() => { setChallenge(null); setError(""); }}>Use another email or request a new code</button>
    </>}
    {error && <ErrorNotice message={error} />}
    <button className="button primary full" disabled={busy}>{busy ? "Please wait…" : challenge ? "Verify email and create account" : "Send verification code"}</button>
  </form>;
}
