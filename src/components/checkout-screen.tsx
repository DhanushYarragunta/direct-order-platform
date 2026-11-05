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
import type { CheckoutQuote } from "@/lib/types";
import { DELIVERY_LOCALITIES, deliveryOutlet } from "@/lib/delivery";
import { checkoutStart } from "@/lib/checkout-timing";
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
  const [localityId, setLocalityId] = useState("");
  const [localityConfirmed, setLocalityConfirmed] = useState(false);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const startedAt = useRef<string | null>(null);
  const [quoteResult, setQuoteResult] = useState<{ signature: string; value: CheckoutQuote } | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoteRetry, setQuoteRetry] = useState(0);
  const location = localityId ? { localityId } : position || {};
  const hasLocation = !!localityId || !!position;
  const quoteInput = JSON.stringify({ outletId: app.outletId, lines: app.cart, couponCode, useLoyalty, fulfillment,
    ...(fulfillment === "delivery" ? location : {}) });
  const quoteSignature = `${quoteInput}:${app.total}:${app.unavailable}:${app.user?.id}`;
  const quote = quoteResult?.signature === quoteSignature ? quoteResult.value : null;
  useEffect(() => {
    if (app.cartReady && app.cart.length && !startedAt.current) startedAt.current = checkoutStart();
  }, [app.cartReady, app.cart.length > 0]);
  useEffect(() => {
    if (!app.cart.length || busy) return;
    const timer = setInterval(() => setQuoteRetry((value) => value + 1), 30000);
    return () => clearInterval(timer);
  }, [app.cart.length > 0, busy]);
  useEffect(() => {
    if (app.user?.role !== "CUSTOMER" || !app.cart.length || !app.menu.data || (fulfillment === "delivery" && !hasLocation)) return;
    let active = true;
    setQuoteError("");
    setQuoteResult(null);
    request<CheckoutQuote>("/api/checkout/quote", "POST", JSON.parse(quoteInput))
      .then((value) => {
        if (!active) return;
        if (value.outletId !== app.outletId) {
          app.setOutletId(value.outletId);
          app.setToast(`Delivery routed to ${value.outletName}. Review availability and the updated total.`);
          return;
        }
        setQuoteResult({ signature: quoteSignature, value });
      })
      .catch((error: Error) => { if (active) setQuoteError(error.message); });
    return () => { active = false; };
  }, [quoteSignature, quoteRetry, !!app.menu.data]);
  if (!app.authReady || app.menu.loading) return <Loading />;
  if (!app.menu.data)
    return (
      <div className="page narrow-page">
        <ErrorNotice message={app.menu.error || "The menu could not be loaded. Your cart is saved."} retry={app.menu.refresh} />
        <Link className="back-link" href="/">Back to menu</Link>
      </div>
    );
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
    const values = {
      outletId: app.outletId,
      lines: app.cart,
      fulfillment,
      address: fulfillment === "delivery" ? address : "",
      phone,
      note,
      couponCode: quote.couponCode || undefined,
      redeemedPoints: quote.redeemedPoints,
      checkoutStartedAt: startedAt.current || checkoutStart(),
      expectedTotalPaise: quote.totalPaise,
      ...(fulfillment === "delivery" ? { ...location, localityConfirmed } : {}),
    };
    const submittedCart = { outletId: values.outletId, cart: values.lines, generation: app.cartGeneration };
    const signature = JSON.stringify({ values, cartGeneration: submittedCart.generation });
    if (attempt.current.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    try {
      const order = await request<{ id: string }>("/api/orders", "POST", {
        ...values,
        checkoutKey: attempt.current.key,
      });
      app.rememberCheckout(order.id, submittedCart);
      router.push(`/payment/${order.id}`);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && [400, 409].includes(e.status)) setQuoteRetry((value) => value + 1);
      void app.menu.refresh();
    } finally {
      setBusy(false);
    }
  }
  function selectDeliveryLocation(value: { latitude: number; longitude: number } | { localityId: string }) {
    setError("");
    try {
      const selected = deliveryOutlet(app.menu.data?.outlets || [], value);
      if (selected.id !== app.outletId) {
        app.setOutletId(selected.id);
        app.setToast(`Delivery routed to ${selected.name}. Review the updated menu and total.`);
      }
    } catch (e) { setError((e as Error).message); }
  }
  function locate() {
    setLocating(true);
    if (!navigator.geolocation) {
      setError("Your browser does not support location. Choose a listed locality or pickup.");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const point = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        };
        setLocalityId(""); setLocalityConfirmed(false); setPosition(point);
        selectDeliveryLocation(point);
        setLocating(false);
      },
      () => {
        setError(
          "Location could not be read. Choose a listed locality or pickup instead.",
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
      {app.menu.error && <ErrorNotice message={app.menu.error} retry={app.menu.refresh} />}
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
                  detail: "Choose your locality · demo",
                  icon: Truck,
                },
              ].map(({ value, label, detail, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  className={`choice ${value === fulfillment ? "chosen" : ""}`}
                  onClick={() => { setFulfillment(value); setError(""); setQuoteError(""); }}
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
                <p role="status"><strong>{quote ? `Estimated preparation: ${quote.estimateMinutes} min` : fulfillment === "delivery" && !hasLocation ? "Choose your delivery locality to see the wait." : "Checking the kitchen wait…"}</strong></p>
                {quote && <small>Based on your dishes and current kitchen load · minimum {quote.minimumMinutes} min. Refreshed every 30 seconds; confirmed on payment. Preparation excludes travel time.</small>}
                {fulfillment === "delivery" && <p>Delivery minimum {money(app.menu.data.outlet.minDeliveryPaise)}. Fee {money(app.menu.data.outlet.deliveryFeePaise)}; free from {money(app.menu.data.outlet.freeDeliveryAbovePaise)} before discounts. Demo policy.</p>}
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
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
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
                  Delivery locality / pincode
                  <select value={localityId} onChange={(event) => {
                    const value = event.target.value;
                    setLocalityId(value); setLocalityConfirmed(false); setPosition(null);
                    if (value) selectDeliveryLocation({ localityId: value });
                  }}>
                    <option value="">Choose a locality or use GPS below</option>
                    {DELIVERY_LOCALITIES.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.pincode}</option>)}
                  </select>
                  <small>These are curated demo service areas. A pincode can cover a larger area; this does not geocode your street address.</small>
                </label>
                {localityId && <label className="reward-toggle"><input type="checkbox" checked={localityConfirmed} required onChange={(event) => setLocalityConfirmed(event.target.checked)} /><span>My delivery address is in the selected locality. I understand coverage uses its centre point in this demo.</span></label>}
                <label>
                  Delivery address
                  <textarea
                    name="address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
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
                  GPS uses your current position. Use it only when you are at the delivery address.
                </small>
              </>
            )}
            <label>
              A note for the kitchen <span className="muted">(optional)</span>
              <textarea
                name="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
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
            <small>1 point = ₹1. Use points for up to 20% after coupons. Earn 1 point per ₹100 of food paid on pickup or confirmed delivery; delivery fees earn no points.</small>
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
                (fulfillment === "delivery" && (!hasLocation || (!!localityId && !localityConfirmed)))
              }
            >
              {busy
                ? "Preparing checkout…"
                : fulfillment === "delivery" && !hasLocation ? "Choose delivery locality" : !quote ? "Checking your total…" : `Continue to payment · ${money(quote.totalPaise)}`}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
        <Cart checkoutLink={false} quote={quote || undefined} />
      </div>
    </div>
  );
}
