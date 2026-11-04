"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  LocateFixed,
  MapPin,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { ApiError, request } from "@/lib/client";
import { money } from "@/lib/domain";
import { useApp } from "./provider";
import { Cart } from "./cart";
import { Empty, ErrorNotice, Loading } from "./ui";
import type { RewardQuote } from "@/lib/reward-policy";
import "./rewards.css";

export function CheckoutScreen() {
  const app = useApp(),
    router = useRouter(),
    [fulfillment, setFulfillment] = useState("pickup"),
    [position, setPosition] = useState<{
      latitude: number;
      longitude: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef({ signature: "", key: "" });
  const [couponDraft, setCouponDraft] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [quoteResult, setQuoteResult] = useState<{ signature: string; value: RewardQuote } | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoteRetry, setQuoteRetry] = useState(0);
  const quoteInput = JSON.stringify({ outletId: app.outletId, lines: app.cart, couponCode, useLoyalty });
  const quoteSignature = `${quoteInput}:${app.total}:${app.unavailable}:${app.user?.id}`;
  const quote = quoteResult?.signature === quoteSignature ? quoteResult.value : null;
  useEffect(() => {
    if (app.user?.role !== "CUSTOMER" || !app.cart.length || !app.menu.data) return;
    let active = true;
    setQuoteError("");
    setQuoteResult(null);
    request<RewardQuote>("/api/checkout/quote", "POST", JSON.parse(quoteInput))
      .then((value) => { if (active) setQuoteResult({ signature: quoteSignature, value }); })
      .catch((error: Error) => { if (active) setQuoteError(error.message); });
    return () => { active = false; };
  }, [quoteSignature, quoteRetry, !!app.menu.data]);
  if (!app.authReady || app.menu.loading) return <Loading />;
  if (!app.user)
    return (
      <div className="page">
        <Empty title="Sign in to finish your order">
          <p>Your cart is saved and will be waiting for you.</p>
          <Link className="button primary" href="/login?next=/checkout">
            Continue to sign in <ArrowRight size={17} />
          </Link>
        </Empty>
      </div>
    );
  if (app.user.role !== "CUSTOMER")
    return (
      <div className="page">
        <Empty title="Use a customer account to order">
          <p>You are signed in to the restaurant workspace.</p>
          <Link href="/login?next=/checkout" className="button primary">
            Switch account
          </Link>
        </Empty>
      </div>
    );
  if (!app.cart.length)
    return (
      <div className="page">
        <Empty title="Your order starts with something delicious">
          <Link href="/" className="button primary">
            Explore the menu
          </Link>
        </Empty>
      </div>
    );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const values = {
      outletId: app.outletId,
      lines: app.cart,
      fulfillment,
      address: String(form.get("address") || ""),
      phone: String(form.get("phone") || ""),
      note: String(form.get("note") || ""),
      couponCode: quote.couponCode || undefined,
      redeemedPoints: quote.redeemedPoints,
      ...(fulfillment === "delivery" && position ? position : {}),
    };
    const signature = JSON.stringify(values);
    if (attempt.current.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    try {
      const order = await request<{ id: string }>("/api/orders", "POST", {
        ...values,
        checkoutKey: attempt.current.key,
      });
      router.push(`/payment/${order.id}`);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && [400, 409].includes(e.status)) setQuoteRetry((value) => value + 1);
      void app.menu.refresh();
    } finally {
      setBusy(false);
    }
  }
  function locate() {
    setLocating(true);
    if (!navigator.geolocation) {
      setError("Your browser does not support location. Choose pickup.");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setError(
          "Location permission is needed to check the delivery radius. You can choose pickup instead.",
        );
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }
  return (
    <div className="page narrow-page">
      <Link className="back-link" href="/">
        <ArrowLeft size={17} /> Back to menu
      </Link>
      <p className="eyebrow">ONE STEP CLOSER</p>
      <h1>Let’s make it yours.</h1>
      <p className="page-description">A few details, and we’ll get cooking.</p>
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={submit}>
          <section className="panel">
            <h2>
              <span className="step-number">01</span> How would you like your
              order?
            </h2>
            <div className="fulfillment-options">
              {[
                {
                  value: "pickup",
                  label: "Pick it up",
                  detail: "Fresh from the counter",
                  icon: ShoppingBag,
                },
                {
                  value: "delivery",
                  label: "Delivery",
                  detail: "Within 5 km · demo",
                  icon: Truck,
                },
              ].map(({ value, label, detail, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  className={`choice ${value === fulfillment ? "chosen" : ""}`}
                  onClick={() => setFulfillment(value)}
                >
                  <Icon size={22} />
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="pickup-address">
              <MapPin size={20} />
              <div>
                <strong>{app.menu.data?.outlet.name}</strong>
                <p>{app.menu.data?.outlet.address}</p>
                <small>
                  Estimated preparation: at least{" "}
                  {app.menu.data?.outlet.minPrepMinutes} min. Updated after
                  payment based on kitchen load.
                </small>
              </div>
            </div>
          </section>
          <section className="panel form-stack">
            <h2>
              <span className="step-number">02</span> Your details
            </h2>
            <label>
              Mobile number
              <input
                name="phone"
                type="tel"
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                required
                placeholder="10-digit Indian mobile number"
              />
              <small>
                For this order only. Messages are simulated in the demo.
              </small>
            </label>
            {fulfillment === "delivery" && (
              <>
                <label>
                  Delivery address
                  <textarea
                    name="address"
                    required
                    minLength={8}
                    maxLength={300}
                    placeholder="Flat, building, street and landmark"
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  onClick={locate}
                  disabled={locating}
                >
                  <LocateFixed size={17} />
                  {locating
                    ? "Finding your location…"
                    : position
                      ? "Location captured · update"
                      : "Use my location to check delivery"}
                </button>
                <small>
                  Be at the delivery address when sharing your location.
                </small>
              </>
            )}
            <label>
              A note for the kitchen <span className="muted">(optional)</span>
              <textarea
                name="note"
                maxLength={250}
                placeholder="Anything you’d like us to know?"
              />
            </label>
          </section>
          <section className="panel form-stack rewards-checkout">
            <h2><span className="step-number">03</span> A little extra for ordering direct</h2>
            <label htmlFor="coupon-code">Coupon code</label>
            <div className="coupon-entry">
              <input id="coupon-code" value={couponDraft} maxLength={30}
                placeholder="Try BIRYANI10" autoCapitalize="characters"
                onChange={(event) => setCouponDraft(event.target.value.toUpperCase())} />
              <button type="button" className="button secondary"
                onClick={() => setCouponCode(couponDraft.trim().toUpperCase())}>Apply</button>
              {couponCode && <button type="button" className="button text"
                onClick={() => { setCouponCode(""); setCouponDraft(""); }}>Remove</button>}
            </div>
            <small>BIRYANI10: 10% off orders from ₹399, up to ₹150. WELCOME100: ₹100 off your first paid order from ₹499.</small>
            {quote?.couponCode && <p className="reward-success" role="status">{quote.couponCode} applied · you save {money(quote.couponDiscountPaise)}</p>}
            <label className="reward-toggle">
              <input type="checkbox" checked={useLoyalty}
                onChange={(event) => setUseLoyalty(event.target.checked)} />
              <span><strong>Use my loyalty points</strong>
                <small>{quote ? `${quote.availablePoints} available · use up to ${quote.maxRedeemablePoints} on this order` : "Your available points are checked at checkout"}</small>
              </span>
            </label>
            <small>1 point = ₹1. Use points for up to 20% of the amount after coupons. Earn 1 point per ₹100 paid when your food is handed over.</small>
            {quote && <p className="reward-success">You’ll earn {quote.pointsToEarn} points on this meal.</p>}
            {quoteError && <ErrorNotice message={quoteError} retry={() => setQuoteRetry((value) => value + 1)} />}
          </section>
          {error && <ErrorNotice message={error} />}
          <div className="checkout-final">
            <p>
              Prices include 5% GST. This is a test checkout; no money will be
              charged.
            </p>
            <button
              className="button primary"
              disabled={
                busy ||
                !quote ||
                app.unavailable ||
                !!app.menu.error ||
                (fulfillment === "delivery" && !position)
              }
            >
              {busy
                ? "Preparing checkout…"
                : !quote ? "Checking your total…" : `Continue to payment · ${money(quote.totalPaise)}`}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
        <Cart checkoutLink={false} quote={quote || undefined} />
      </div>
    </div>
  );
}
