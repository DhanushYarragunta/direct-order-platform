"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChefHat,
  Clock3,
  CreditCard,
  MapPin,
  Printer,
  Smartphone,
} from "lucide-react";
import { request, useResource } from "@/lib/client";
import { money, STATUS_LABELS } from "@/lib/domain";
import type { Order } from "@/lib/types";
import { useApp } from "./provider";
import { Empty, ErrorNotice, FoodPhoto, Loading } from "./ui";
import { RewardsWallet } from "./rewards-wallet";
import { finishCheckoutTiming } from "@/lib/checkout-timing";

export const time = (value: string) =>
  new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
export function Status({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
function SignIn() {
  return (
    <Empty title="Your orders, all in one place">
      <p>Sign in to see your order history and live updates.</p>
      <Link href="/login?next=/orders" className="button primary">
        Sign in
      </Link>
    </Empty>
  );
}
export function OrdersScreen() {
  const app = useApp(),
    resource = useResource<{ orders: Order[] }>(
      app.user?.role === "CUSTOMER" ? "/api/orders" : null,
      app.user?.role === "CUSTOMER" ? "/api/events?scope=orders" : undefined,
    );
  return (
    <div className="page">
      <p className="eyebrow">FROM OUR KITCHEN TO YOU</p>
      <h1>Your orders.</h1>
      <p className="page-description">
        Follow the good food. Revisit the good memories.
      </p>
      {!app.authReady ? (
        <Loading />
      ) : !app.user ? (
        <SignIn />
      ) : app.user.role !== "CUSTOMER" ? (
        <Empty title="Restaurant orders are in your workspace">
          <Link href="/workspace" className="button primary">
            Open workspace
          </Link>
        </Empty>
      ) : (
        <>
          <RewardsWallet />
          {resource.error && (
            <ErrorNotice message={resource.error} retry={resource.refresh} />
          )}{" "}
          {resource.loading ? (
            <Loading />
          ) : resource.data?.orders.length ? (
            <div className="orders-list">
              {resource.data.orders.map((order) => (
                <Link
                  key={order.id}
                  className="order-summary-card"
                  href={
                    order.status === "PENDING_PAYMENT"
                      ? `/payment/${order.id}`
                      : `/orders/${order.id}`
                  }
                >
                  <div className="order-thumb">
                    <FoodPhoto
                      src={order.lines[0]?.photo || null}
                      name={order.lines[0]?.name || "Order"}
                    />
                  </div>
                  <div className="order-summary-info">
                    <div>
                      <strong>{order.number}</strong>
                      <Status status={order.status} />
                    </div>
                    <h3>
                      {order.lines
                        .map((l) => `${l.quantity} × ${l.name}`)
                        .join(", ")}
                    </h3>
                    <p>
                      {order.outlet.name} ·{" "}
                      {new Date(order.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      at {time(order.createdAt)}
                    </p>
                  </div>
                  <div className="order-summary-total">
                    <strong>{money(order.totalPaise)}</strong>
                    <span>
                      {order.status === "PENDING_PAYMENT"
                        ? "Complete payment"
                        : "View order"}
                      <ArrowRight size={16} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            !resource.error && (
              <Empty title="Your first order is waiting">
                <p>Something delicious is just around the corner.</p>
                <Link href="/" className="button primary">
                  Explore our menu
                </Link>
              </Empty>
            )
          )}
        </>
      )}
    </div>
  );
}

export function PaymentScreen({ id }: { id: string }) {
  const app = useApp(),
    router = useRouter(),
    {
      data: order,
      error,
      loading,
      refresh,
    } = useResource<Order>(`/api/orders/${id}`, "/api/events?scope=orders"),
    [method, setMethod] = useState("UPI"),
    [outcome, setOutcome] = useState("success"),
    [busy, setBusy] = useState(false),
    [paymentError, setPaymentError] = useState("");
  useEffect(() => {
    if (order?.paymentStatus !== "PAID" || !app.cartReady) return;
    finishCheckoutTiming();
    let active = true;
    void app.consumeCheckout(id).then((consumed) => {
      if (!active) return;
      if (!consumed) app.setToast("Payment confirmed. Please review your saved cart before ordering again.");
      router.replace(`/orders/${id}`);
    });
    return () => { active = false; };
  }, [order?.paymentStatus, app.cartReady, id, router]);
  const pending = order?.payments.some((p) => p.status === "PENDING");
  async function pay() {
    setBusy(true);
    setPaymentError("");
    try {
      await request(`/api/orders/${id}/payment`, "POST", {
        attemptKey: crypto.randomUUID(),
        method,
        outcome,
      });
      await refresh();
    } catch (e) {
      setPaymentError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error || !order)
    return (
      <div className="page">
        <ErrorNotice message={error || "Order not found"} retry={refresh} />
        <Link className="back-link" href="/login">
          Sign in to your account
        </Link>
      </div>
    );
  return (
    <div className="page payment-page">
      <Link className="back-link" href="/orders">
        <ArrowLeft size={17} /> Your orders
      </Link>
      <section className="payment-card">
        <span className="payment-icon">
          <CreditCard size={30} />
        </span>
        <p className="eyebrow">SIMULATED PAYMENT</p>
        <h1>One last step.</h1>
        <p>
          {order.number} · {order.outlet.name}
        </p>
        <div className="payment-amount">{money(order.totalPaise)}</div>
        <span className="muted">Includes {money(order.gstPaise)} GST</span>
        {order.estimateMinutes && <p className="pending-notice"><Clock3 size={20} /> Estimated preparation: {order.estimateMinutes} min. This estimate includes the kitchen load at checkout; it is confirmed when payment succeeds. Travel time is additional.</p>}
        {order.fulfillment === "delivery" && <p>Delivery fee: {order.deliveryFeePaise ? money(order.deliveryFeePaise) : "Free"} · included in your total.</p>}
        {order.status === "CANCELLED" ? (
          <ErrorNotice
            message={
              order.paymentStatus === "REFUNDED"
                ? order.messages.find((message) => message.kind === "REFUND")?.body || "Your simulated payment was refunded. Return to the menu to start again."
                : "This checkout has expired. Start a new order from the menu."
            }
          />
        ) : (
          <>
            {order.redeemedPoints > 0 && <p className="reward-success">{order.redeemedPoints} loyalty points are reserved for this order until payment or expiry. Failed attempts can be retried.</p>}
            <div className="payment-methods">
              {[
                { name: "UPI", icon: Smartphone },
                { name: "CARD", icon: CreditCard },
              ].map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  className={`choice ${method === name ? "chosen" : ""}`}
                  disabled={busy || pending}
                  onClick={() => setMethod(name)}
                >
                  <Icon size={22} />
                  {name === "CARD" ? "Card" : name}
                  {method === name && <Check size={17} />}
                </button>
              ))}
            </div>
            <div className="test-gateway">
              <strong>Test gateway</strong>
              <p>No card details or UPI ID needed. No money moves.</p>
              <label>
                Payment result
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  disabled={busy || pending}
                >
                  <option value="success">Successful payment</option>
                  <option value="failed">Failed payment · retry allowed</option>
                  <option value="pending">
                    Pending · completes after ~8 seconds
                  </option>
                </select>
              </label>
            </div>
            {paymentError && <ErrorNotice message={paymentError} />}{" "}
            {order.paymentStatus === "FAILED" && (
              <ErrorNotice message="The test payment failed. Try again with another result or method." />
            )}
            {pending && (
              <div className="pending-notice" role="status">
                <Clock3 size={20} /> Payment is processing. This page updates
                automatically.
              </div>
            )}
            <button
              className="button primary full"
              onClick={pay}
              disabled={busy || pending || !app.demoMode}
            >
              {busy
                ? "Processing…"
                : pending
                  ? "Waiting for payment"
                  : `Pay ${money(order.totalPaise)} · test mode`}
              <ArrowRight size={17} />
            </button>
            <small>
              Checkout expires at {time(order.expiresAt)}. Stock is checked
              again before confirmation.
            </small>
          </>
        )}
        {order.status === "CANCELLED" && (
          <Link href="/" className="button primary">
            Back to menu
          </Link>
        )}
      </section>
    </div>
  );
}

export function OrderScreen({ id }: { id: string }) {
  const {
      data: order,
      error,
      loading,
      refresh,
    } = useResource<Order>(`/api/orders/${id}`, "/api/events?scope=orders"),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  if (loading) return <Loading />;
  if (error || !order)
    return (
      <div className="page">
        <ErrorNotice message={error || "Order not found"} retry={refresh} />
        <Link href="/login" className="back-link">
          Sign in to view your order
        </Link>
      </div>
    );
  const stages = order.fulfillment === "delivery"
      ? ["PLACED", "PREPARING", "READY", "HANDED_OFF", "OUT_FOR_DELIVERY", "DELIVERED"]
      : ["PLACED", "PREPARING", "READY", "HANDED_OFF"],
    stage = stages.indexOf(order.status),
    late = order.messages.some((m) => m.kind === "LATE");
  return (
    <div className="page narrow-page order-detail">
      <div className="receipt-top">
        <Link className="back-link" href="/orders">
          <ArrowLeft size={17} /> All orders
        </Link>
        <button
          className="button secondary no-print"
          onClick={() => window.print()}
        >
          <Printer size={16} /> Print receipt
        </button>
      </div>
      <div className="order-detail-heading">
        <div>
          <p className="eyebrow">{order.outlet.name.toUpperCase()}</p>
          <h1>
            {(order.status === "HANDED_OFF" && order.fulfillment === "pickup") || order.status === "DELIVERED"
              ? "Enjoy every bite."
              : order.status === "CANCELLED"
                ? "Order cancelled."
                : "Good food is on its way."}
          </h1>
          <p>
            {order.number} · {time(order.createdAt)}
          </p>
        </div>
        <Status status={order.status} />
      </div>
      <div className="tracking-layout">
        <div>
          <section className="panel tracking-panel">
            {order.promisedAt && (
              <div className="promise">
                <div className="promise-icon">
                  <ChefHat size={30} />
                </div>
                <div>
                  <span>
                    {["READY", "HANDED_OFF", "OUT_FOR_DELIVERY", "DELIVERED"].includes(order.status)
                      ? "READY AT"
                      : "ESTIMATED READY TIME"}
                  </span>
                  <h2>{time(order.readyAt || order.promisedAt)}</h2>
                  <p>
                    {order.estimateFallback
                      ? "Kitchen minimum used as a safe fallback."
                      : "Based on your dishes and current kitchen load."}
                  </p>
                </div>
              </div>
            )}
            {order.status !== "CANCELLED" &&
              order.status !== "PENDING_PAYMENT" && (
                <ol className="tracking-stages">
                  {stages.map((s, i) => (
                    <li key={s} className={i <= stage ? "complete" : ""}>
                      <span>{i < stage ? <Check size={16} /> : i + 1}</span>
                      <div>
                        <strong>{STATUS_LABELS[s]}</strong>
                        <small>
                          {
                            [
                              "Your order is with the kitchen",
                              "Freshly preparing your meal",
                              order.fulfillment === "delivery"
                                ? "Waiting for delivery handover"
                                : "Come by the counter",
                              order.fulfillment === "delivery" ? "Handed to the delivery team" : "Shared with a smile",
                              "Delivery team has left the outlet",
                              "Delivery confirmed by the outlet",
                            ][i]
                          }
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            {order.status === "PENDING_PAYMENT" && (
              <Link className="button primary" href={`/payment/${id}`}>
                Complete payment
              </Link>
            )}
            {order.status === "CANCELLED" && (
              <p>
                {order.paymentStatus === "REFUNDED"
                  ? "Your simulated payment has been refunded."
                  : "No successful payment was recorded."}
              </p>
            )}
            {late &&
              !["READY", "HANDED_OFF", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(order.status) && (
                <ErrorNotice message="We’re running behind. The outlet manager has been alerted; updates will appear below." />
              )}
          </section>
          <section className="panel">
            <h2>From the kitchen</h2>
            <div className="message-list">
              {order.messages.map((message) => (
                <div className="message" key={message.id}>
                  <CheckCircle2 size={16} />
                  <div>
                    <p>{message.body}</p>
                    <small>
                      {time(message.createdAt)} · Simulated order message
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>
              <MapPin size={20} />{" "}
              {order.fulfillment === "delivery"
                ? "Delivery details"
                : "Pickup details"}
            </h2>
            <strong>{order.outlet.name}</strong>
            <p>
              {order.fulfillment === "delivery"
                ? order.address
                : order.outlet.address}
            </p>
            <small>{order.outlet.fssaiVerified ? "FSSAI licence" : "DEMO FSSAI number · not a verified licence"}: {order.outlet.fssai}</small>
            {order.fulfillment === "delivery" && <p>Delivery stages are recorded manually by the outlet in this demo.</p>}
            {order.deliveredAt && <p>Delivered at {time(order.deliveredAt)}</p>}
            {order.note && (
              <p className="order-note">Kitchen note: {order.note}</p>
            )}
          </section>
        </div>
        <section className="panel receipt">
          <h2>Your meal</h2>
          {order.lines.map((line) => (
            <div className="receipt-line" key={line.id}>
              <FoodPhoto src={line.photo} name={line.name} />
              <div>
                <strong>
                  {line.quantity} × {line.name}
                </strong>
                <small>
                  {line.portion}
                  {line.addOns.length
                    ? ` · ${line.addOns.map((a) => a.name).join(", ")}`
                    : ""}
                </small>
              </div>
              <b>{money(line.unitPaise * line.quantity)}</b>
            </div>
          ))}
          <div className="cart-summary">
            <div>
              <span>Item total</span>
              <span>{money(order.subtotalPaise || order.totalPaise)}</span>
            </div>
            {order.couponDiscountPaise > 0 && <div className="green"><span>{order.couponCode}</span><span>−{money(order.couponDiscountPaise)}</span></div>}
            {order.redeemedPoints > 0 && <div className="green"><span>{order.redeemedPoints} loyalty points</span><span>−{money(order.redeemedPoints * 100)}</span></div>}
            {order.fulfillment === "delivery" && <div><span>Delivery fee</span><span>{order.deliveryFeePaise ? money(order.deliveryFeePaise) : "Free"}</span></div>}
            <div>
              <span>GST included (5%)</span>
              <span>{money(order.gstPaise)}</span>
            </div>
            <div className="grand-total">
              <strong>Total</strong>
              <strong>{money(order.totalPaise)}</strong>
            </div>
          </div>
          <p className="payment-receipt">
            {order.paymentStatus} ·{" "}
            {order.payments.find(
              (p) => p.status === "PAID" || p.status === "REFUNDED",
            )?.method || "Test gateway"}
          </p>
          {((order.status === "HANDED_OFF" && order.fulfillment === "pickup") || order.status === "DELIVERED") && <p className="reward-success">You earned {Math.floor((order.totalPaise - order.deliveryFeePaise) / 10000)} loyalty points. Thank you for ordering direct.</p>}
          {order.status === "CANCELLED" && order.redeemedPoints > 0 && <p className="reward-success">Your {order.redeemedPoints} reserved points have been returned.</p>}
          {order.status === "PLACED" && (
            <>
              <button
                className="button secondary full no-print"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request(`/api/orders/${id}`, "PATCH", {
                      status: "CANCELLED",
                      version: order.version,
                    });
                    await refresh();
                  } catch (e) {
                    setActionError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Cancelling…" : "Cancel order & refund test payment"}
              </button>
              <small className="no-print">
                Available until the kitchen starts preparation.
              </small>
            </>
          )}
          {actionError && <ErrorNotice message={actionError} />}
        </section>
      </div>
    </div>
  );
}
