"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ChefHat, Eye, EyeOff, ShieldCheck, UserRound } from "lucide-react";
import { request } from "@/lib/client";
import { useApp } from "./provider";
import { ErrorNotice } from "./ui";
import Link from "next/link";
import { EmailRegistration } from "./email-registration";
import "./privacy.css";
import "./auth.css";

type AuthView = "login" | "register" | "forgot";
type RecoveryMethods = { passwordResetEmail: boolean; passwordResetPhone: boolean };
type ResetChallenge = { challengeId: string; expiresAt: string; delivery: "email" | "sms" };

function PasswordField({ label, name = "password", fresh = false }: { label: string; name?: string; fresh?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-password-field">
    <label htmlFor={`auth-${name}`}>{label}</label>
    <div className="auth-password-control">
      <input id={`auth-${name}`} name={name} type={visible ? "text" : "password"} autoComplete={fresh ? "new-password" : "current-password"}
        minLength={fresh ? 10 : 1} maxLength={128} required placeholder={fresh ? "At least 10 characters" : "Enter your password"} />
      <button type="button" className="auth-password-toggle" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}
        onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div>
  </div>;
}

export function AuthScreen() {
  const app = useApp(),
    [view, setView] = useState<AuthView>("login"),
    [identifier, setIdentifier] = useState(""),
    [challenge, setChallenge] = useState<ResetChallenge | null>(null),
    [methods, setMethods] = useState<RecoveryMethods | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void request<RecoveryMethods>("/api/auth/methods").then(value => { if (active) setMethods(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const register = view === "register", forgot = view === "forgot";
  const recoveryUnavailable = methods && ((!methods.passwordResetEmail && !methods.passwordResetPhone)
    || (identifier.includes("@") ? methods.passwordResetEmail === false : /^[+\d\s()-]+$/.test(identifier) ? methods.passwordResetPhone === false : false));
  function navigate(next: AuthView) {
    setView(next); setChallenge(null); setError(""); setMessage("");
  }
  async function complete(role: string) {
    const next = new URLSearchParams(location.search).get("next");
    let safeNext: string | null = null;
    if (next?.startsWith("/")) {
      try {
        const target = new URL(next, location.origin);
        if (target.origin === location.origin) safeNext = `${target.pathname}${target.search}${target.hash}`;
      } catch { /* Malformed return paths use the role's default page. */ }
    }
    // Start a fresh document so a prefetched signed-out redirect cannot survive login.
    window.location.replace(
      safeNext
        ? safeNext
        : role === "CUSTOMER"
          ? "/"
          : "/workspace",
    );
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<{ role: string }>(
        `/api/auth/${register ? "register" : "login"}`,
        "POST",
        register ? {
                email: form.get("email"), password: form.get("password"),
                ...(String(form.get("phone") || "").trim() ? { phone: String(form.get("phone")).trim() } : {}),
                name: form.get("name"),
                consent: form.get("consent") === "on",
                marketingOptIn: form.get("marketing") === "on",
              } : { identifier: identifier.trim(), password: form.get("password") },
      );
      await complete(result.role);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      if (!challenge) {
        setChallenge(await request<ResetChallenge>("/api/auth/password/request", "POST", { identifier: identifier.trim() }));
      } else {
        await request("/api/auth/password/verify", "POST", { challengeId: challenge.challengeId, code: form.get("code"), password: form.get("password") });
        await app.refreshUser();
        setChallenge(null); setView("login");
        setMessage("Password updated. Sign in with your new password.");
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function demo(account: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ role: string }>("/api/auth/demo", "POST", {
        account,
      });
      await complete(result.role);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page auth-page">
      <div className="auth-story">
        <p className="eyebrow">YOUR TABLE IS WAITING</p>
        <h1>
          A familiar flavour.
          <br />A warmer welcome.
        </h1>
        <p>
          Your favourite meals and every order update,
          <br />
          all in one place.
        </p>
        <img
          src="/food/chicken-biryani.jpg"
          alt="A bowl of Hyderabadi chicken dum biryani"
        />
        <span>Made with time. Shared with love.</span>
      </div>
      <section className="auth-card">
        <p className="eyebrow">DECCAN KITCHEN & CO.</p>
        <h2>{register ? "Make yourself at home." : forgot ? challenge ? "Choose a new password." : "Forgot your password?" : "Welcome back."}</h2>
        <p className="muted">
          {register
            ? "Create your account to order directly."
            : forgot ? "Get a verification code by email or SMS to reset your password." : "Sign in with your email or mobile number and password."}
        </p>
        {message && <p className="privacy-success auth-notice" role="status">{message}</p>}
        {forgot ? <form key={challenge ? "reset-verify" : "reset-request"} className="form-stack" onSubmit={resetPassword} aria-busy={busy}>
          {!challenge ? <>
            <label>Email or mobile number<input name="identifier" autoComplete="username" required maxLength={150} value={identifier}
              onChange={event => setIdentifier(event.target.value)} placeholder="you@example.com or 9876543210" autoFocus /></label>
            <p className="auth-help">Use a contact already verified on your account. An email address receives an email; a mobile number receives an SMS.</p>
            {methods?.passwordResetEmail === false && methods?.passwordResetPhone === false
              ? <p className="auth-help">Password recovery is temporarily unavailable. <Link href="/help">Contact support</Link> for help.</p>
              : methods?.passwordResetPhone === false ? <p className="auth-help">SMS recovery is not available yet. Use your verified email address.</p>
              : methods?.passwordResetEmail === false ? <p className="auth-help">Email recovery is not available yet. Use your verified mobile number.</p> : null}
          </> : <>
            <p className="auth-help" role="status">If a matching verified account exists, a code was sent {challenge.delivery === "sms" ? "by SMS" : "to your email"}. {challenge.delivery === "email" && "Check your inbox and spam folder. "}Codes expire in five minutes.</p>
            <label>Six-digit code<input name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus /></label>
            <PasswordField label="New password" fresh />
            <button className="text-button auth-retry" type="button" disabled={busy} onClick={() => { setChallenge(null); setError(""); }}>Use another contact or request a new code</button>
          </>}
          {error && <ErrorNotice message={error} />}
          <button className="button primary full" disabled={busy || (!challenge && Boolean(recoveryUnavailable))}>{busy ? "Please wait…" : challenge ? "Reset password" : "Send reset code"}<ArrowRight size={18} /></button>
        </form> : register && !app.demoMode ? <EmailRegistration complete={complete} /> : <form key={register ? "register" : "login"} onSubmit={submit} className="form-stack" aria-busy={busy}>
          {register && (
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={70}
                placeholder="How should we call you?"
              />
            </label>
          )}
          {register ? <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={150}
              placeholder="you@example.com"
            />
          </label> : <label>Email or mobile number<input name="identifier" autoComplete="username" required maxLength={150} value={identifier}
            onChange={event => setIdentifier(event.target.value)} placeholder="you@example.com or 9876543210" /></label>}
          {register && <label>Mobile number (optional)<input name="phone" type="tel" autoComplete="tel-national" maxLength={20} placeholder="9876543210" /></label>}
          <PasswordField label="Password" fresh={register} />
          {!register && <button type="button" className="text-button auth-forgot" disabled={busy} onClick={() => navigate("forgot")}>Forgot password?</button>}
          {register && (
            <>
              <label className="check-label">
                <input type="checkbox" name="consent" required />
                <span>
                  I agree to the use of my details to fulfil my orders and send
                  order updates, as explained in the <Link href="/privacy">privacy notice</Link>.
                </span>
              </label>
              <label className="check-label">
                <input type="checkbox" name="marketing" />
                <span>Send me offers and kitchen news. Optional.</span>
              </label>
            </>
          )}
          {error && <ErrorNotice message={error} />}
          <button className="button primary full" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            <ArrowRight size={18} />
          </button>
        </form>}
        <p className="auth-switch">
          {register ? "Already have an account?" : forgot ? "Remember your password?" : "New to our kitchen?"}{" "}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => navigate(register || forgot ? "login" : "register")}
          >
            {register || forgot ? "Sign in" : "Create an account"}
          </button>
        </p>
        {app.demoMode && !forgot && (
          <div className="demo-accounts">
            <span className="divider-label">EXPLORE THE DEMO</span>
            <div className="demo-account-grid">
              <button disabled={busy} onClick={() => demo("customer")}>
                <UserRound size={19} />
                Customer
              </button>
              <button disabled={busy} onClick={() => demo("admin")}>
                <ShieldCheck size={19} />
                Admin
              </button>
              <button disabled={busy} onClick={() => demo("manager")}>
                <ChefHat size={19} />
                Manager
              </button>
            </div>
            <label className="demo-kitchen-label">
              Kitchen staff
              <select
                defaultValue=""
                disabled={busy}
                aria-label="Sign in as kitchen staff"
                onChange={(e) => {
                  if (e.target.value) void demo(e.target.value);
                }}
              >
                <option value="" disabled>
                  Choose a kitchen to sign in
                </option>
                <option value="kitchen-kondapur">Kondapur</option>
                <option value="kitchen-gachibowli">Gachibowli</option>
                <option value="kitchen-kukatpally">Kukatpally</option>
              </select>
            </label>
            <small>Sample accounts · simulated payments · no real orders</small>
          </div>
        )}
      </section>
    </div>
  );
}
