"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  LocateFixed,
  MapPin,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { request } from "@/lib/client";
import { money } from "@/lib/domain";
import { useApp } from "./provider";
import { Cart } from "./cart";
import { Empty, ErrorNotice, Loading } from "./ui";

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
                app.unavailable ||
                !!app.menu.error ||
                (fulfillment === "delivery" && !position)
              }
            >
              {busy
                ? "Preparing checkout…"
                : `Continue to payment · ${money(app.total)}`}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
        <Cart checkoutLink={false} />
      </div>
    </div>
  );
}
