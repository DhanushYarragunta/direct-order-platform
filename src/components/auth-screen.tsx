"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChefHat, ShieldCheck, UserRound } from "lucide-react";
import { request } from "@/lib/client";
import { useApp } from "./provider";
import { ErrorNotice } from "./ui";
import Link from "next/link";
import { PhoneSignIn } from "./phone-sign-in";
import "./privacy.css";

export function AuthScreen() {
  const app = useApp(),
    router = useRouter(),
    [register, setRegister] = useState(false),
    [phoneSignIn, setPhoneSignIn] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function complete(role: string) {
    await app.refreshUser();
    const next = new URLSearchParams(location.search).get("next");
    let safeNext: string | null = null;
    if (next?.startsWith("/")) {
      try {
        const target = new URL(next, location.origin);
        if (target.origin === location.origin) safeNext = `${target.pathname}${target.search}${target.hash}`;
      } catch { /* Malformed return paths use the role's default page. */ }
    }
    router.push(
      safeNext
        ? safeNext
        : role === "CUSTOMER"
          ? "/"
          : "/workspace",
    );
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<{ role: string }>(
        `/api/auth/${register ? "register" : "login"}`,
        "POST",
        {
          email: form.get("email"),
          password: form.get("password"),
          ...(register
            ? {
                name: form.get("name"),
                consent: form.get("consent") === "on",
                marketingOptIn: form.get("marketing") === "on",
              }
            : {}),
        },
      );
      await complete(result.role);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
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
        <h2>{register ? "Make yourself at home." : "Welcome back."}</h2>
        <p className="muted">
          {register
            ? "Create your account to order directly."
            : "Sign in for good food, without the fuss."}
        </p>
        {app.demoMode && <div className="auth-methods" aria-label="Sign-in method">
          <button type="button" className={`button ${!phoneSignIn ? "primary" : ""}`} aria-pressed={!phoneSignIn} onClick={() => setPhoneSignIn(false)}>Email</button>
          <button type="button" className={`button ${phoneSignIn ? "primary" : ""}`} aria-pressed={phoneSignIn} onClick={() => setPhoneSignIn(true)}>Phone code · demo</button>
        </div>}
        {phoneSignIn ? <PhoneSignIn complete={complete} /> : <form onSubmit={submit} className="form-stack">
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
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={150}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={register ? 10 : 1}
              maxLength={128}
              required
              placeholder={
                register ? "At least 10 characters" : "Your password"
              }
            />
          </label>
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
          {register ? "Already have an account?" : "New to our kitchen?"}{" "}
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setPhoneSignIn(false);
              setError("");
            }}
          >
            {register ? "Sign in" : "Create an account"}
          </button>
        </p>
        {app.demoMode && (
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
