"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
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
import { fullDeliveryAddress } from "@/lib/profile-types";
import { checkoutStart } from "@/lib/checkout-timing";
import { preparationExplanation } from "@/lib/preparation-explanation";
import "./rewards.css";

export function CheckoutScreen() {
  const app = useApp(),
    router = useRouter(),
    [fulfillment, setFulfillment] = useState("pickup"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef({ signature: "", key: "" });
  const [couponDraft, setCouponDraft] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [localityConfirmed, setLocalityConfirmed] = useState(false);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const phoneEdited = useRef(false), fulfillmentEdited = useRef(false);
  const detailsOwner = useRef<string | null>(null), appliedLocation = useRef("");
  const selectedLocation = app.deliveryLocation;
  const localityId = selectedLocation?.localityId;
  const position = selectedLocation ? { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude } : null;
  const selectionKey = selectedLocation ? JSON.stringify(selectedLocation) : "";
  useEffect(() => {
    const owner = app.user?.id || null;
    if (detailsOwner.current === owner) return;
    detailsOwner.current = owner; appliedLocation.current = "";
    phoneEdited.current = false; fulfillmentEdited.current = false;
    setPhone(""); setAddress(""); setNote(""); setLocalityConfirmed(false);
    setFulfillment("pickup");
  }, [app.user?.id]);
  useEffect(() => {
    if (!phoneEdited.current && !selectedLocation?.phone && app.profile.data)
      setPhone(app.profile.data.phone || "");
  }, [app.profile.data?.phone, selectedLocation?.phone, app.user?.id]);
  useEffect(() => {
    if (selectionKey === appliedLocation.current) return;
    appliedLocation.current = selectionKey;
    setError(""); setQuoteError("");
    if (!selectedLocation) { setAddress(""); setLocalityConfirmed(false); return; }
    setLocalityConfirmed(!!selectedLocation.addressId);
    setAddress(selectedLocation.addressLine ? fullDeliveryAddress({ ...selectedLocation, addressLine: selectedLocation.addressLine }) : "");
    if (selectedLocation.phone) { setPhone(selectedLocation.phone); phoneEdited.current = false; }
    if (!fulfillmentEdited.current) setFulfillment("delivery");
  }, [selectionKey, app.user?.id]);
  const startedAt = useRef<string | null>(null);
  const [quoteResult, setQuoteResult] = useState<{ signature: string; value: CheckoutQuote } | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoteRetry, setQuoteRetry] = useState(0);
  const location = localityId ? { localityId } : position || {};
  const hasLocation = !!localityId || !!position;
  const quoteInput = JSON.stringify({ outletId: app.outletId, lines: app.cart, couponCode, useLoyalty, fulfillment,
    ...(fulfillment === "delivery" ? location : {}) });
  // A location change invalidates the previous quote before the form's autofill effect runs.
  const quoteSignature = `${quoteInput}:${app.total}:${app.unavailable}:${app.user?.id}:${fulfillment === "delivery" ? selectionKey : ""}`;
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
      address: fulfillment === "delivery" ? (selectedLocation && !selectedLocation.addressId
        ? fullDeliveryAddress({ addressLine: address, area: selectedLocation.area, city: selectedLocation.city, pincode: selectedLocation.pincode }) : address) : "",
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
                  detail: "To your doorstep",
                  icon: Truck,
                },
              ].map(({ value, label, detail, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  className={`choice ${value === fulfillment ? "chosen" : ""}`}
                  onClick={() => { fulfillmentEdited.current = true; setFulfillment(value); setError(""); setQuoteError(""); }}
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
                <p role="status"><strong>{quote ? `Estimated preparation: ${quote.estimateMinutes} min` : fulfillment === "delivery" && !hasLocation ? "Choose your delivery address to see the wait." : "Checking the kitchen wait…"}</strong></p>
                {quote && <small>{preparationExplanation(quote)} Minimum {quote.minimumMinutes} min. Refreshed every 30 seconds; confirmed on payment. Travel time is additional.</small>}
                {fulfillment === "delivery" && <p>Delivery minimum {money(app.menu.data.outlet.minDeliveryPaise)}. Fee {money(app.menu.data.outlet.deliveryFeePaise)}; free from {money(app.menu.data.outlet.freeDeliveryAbovePaise)} before discounts. Demo policy.</p>}
              </div>
            </div>
          </section>
          <section className="panel form-stack">
            <h2>
              <span className="step-number">02</span> Your details
            </h2>
            <div className="checkout-detail-field">
              <label htmlFor="checkout-phone">Mobile number</label>
              <input
                id="checkout-phone"
                aria-describedby="checkout-phone-help"
                name="phone"
                value={phone}
                onChange={(event) => { phoneEdited.current = true; setPhone(event.target.value); }}
                type="tel"
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                required
                placeholder="10-digit Indian mobile number"
              />
              <small id="checkout-phone-help">
                {app.profile.data?.phone ? "Your saved number. Changes here apply to this order only." : <Link href="/profile">Save your phone in your profile for next time.</Link>}
              </small>
            </div>
            {fulfillment === "delivery" && (
              <>
                {selectedLocation ? <div className="checkout-saved-address"><MapPin size={22} /><div>
                  <strong>{selectedLocation.addressId ? `${selectedLocation.label} · Saved address` : selectedLocation.label}</strong>
                  <p>{selectedLocation.area}</p>
                  {selectedLocation.kind === "area" && <small>Delivery coverage uses this area's centre point.</small>}
                </div></div> : <p>Search your area or choose a saved address to check delivery.</p>}
                <button type="button" className="button secondary checkout-location-action" onClick={() => app.setLocationOpen(true)}>
                  <MapPin size={18} />{selectedLocation ? "Change delivery address" : "Choose delivery address"}<ArrowRight size={17} />
                </button>
                {selectedLocation && <>
                  <div className="checkout-detail-field">
                    <label htmlFor="checkout-address">Delivery address</label>
                    <textarea id="checkout-address" aria-describedby="checkout-address-help" name="address" value={address} onChange={event => setAddress(event.target.value)} required minLength={8}
                      maxLength={selectedLocation.addressId ? 300 : 120} autoComplete="street-address"
                      placeholder="Flat / house, building, street and landmark" />
                    <small id="checkout-address-help">{selectedLocation.addressId ? "Changes here apply to this order only. Change the location above for another area." : "Add your flat, building and street. We'll include the selected area."}</small>
                  </div>
                  {selectedLocation.kind === "area" && !selectedLocation.addressId && <label className="profile-checkbox">
                    <input type="checkbox" checked={localityConfirmed} required onChange={event => setLocalityConfirmed(event.target.checked)} />
                    <span>My delivery address is in this area. I understand coverage uses its centre point.</span>
                  </label>}
                </>}
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
                (fulfillment === "delivery" && (!hasLocation || ((!!localityId || (selectedLocation?.kind === "area" && !selectedLocation.addressId)) && !localityConfirmed)))
              }
            >
              {busy
                ? "Preparing checkout…"
                : fulfillment === "delivery" && !hasLocation ? "Choose delivery address" : !quote ? "Checking your total…" : `Continue to payment · ${money(quote.totalPaise)}`}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
        <Cart checkoutLink={false} quote={quote || undefined} />
      </div>
    </div>
  );
}
