"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import { cartLineKey, gstIncluded, money } from "@/lib/domain";
import { useApp } from "./provider";
import { Empty, FoodPhoto, Stepper } from "./ui";
import type { CheckoutQuote } from "@/lib/types";
import { checkoutStart, finishCheckoutTiming } from "@/lib/checkout-timing";

export function Cart({ checkoutLink = true, quote }: { checkoutLink?: boolean; quote?: CheckoutQuote }) {
  const app = useApp(),
    count = app.cart.reduce((s, l) => s + l.quantity, 0);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (app.cartReady && !count) finishCheckoutTiming();
    if (!count || !panel.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { checkoutStart(); observer.disconnect(); }
    });
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, [count > 0, app.cartReady]);
  return (
    <section className="cart-panel" id="your-order" ref={panel}>
      <div className="cart-heading">
        <h2>
          Your order <span>{count}</span>
        </h2>
        <ShoppingBag size={20} />
      </div>
      <div className="cart-outlet">
        <span className="status-dot" />{" "}
        {app.menu.data?.outlet.name || "Your neighbourhood kitchen"}
      </div>
      {!count ? (
        <Empty title="A little hungry?">
          <p>
            Your next favourite meal
            <br />
            is a few taps away.
          </p>
        </Empty>
      ) : (
        <>
          <div className="cart-lines">
            {app.cart.map((line) => {
              const item = app.menu.data?.items.find(
                  (i) => i.id === line.itemId,
                ),
                key = cartLineKey(line),
                extras = line.addOnIds.map((id) =>
                  app.menu.data?.addOns.find((a) => a.id === id),
                );
              const price =
                ((line.portion === "family"
                  ? item?.familyPricePaise
                  : item?.pricePaise) || 0) +
                extras.reduce((s, a) => s + (a?.pricePaise || 0), 0);
              return (
                <div className="cart-line" key={key}>
                  <FoodPhoto
                    src={item?.photo || null}
                    name={item?.name || "Dish"}
                  />
                  <div className="cart-line-detail">
                    <strong>{item?.name || "Unavailable dish"}</strong>
                    <small>
                      {line.portion === "family"
                        ? "Family pack"
                        : item?.portion || "Regular"}
                      {extras.length
                        ? ` · ${extras.map((a) => a?.name || "Unavailable extra").join(", ")}`
                        : ""}
                    </small>
                    {!item?.available && (
                      <span className="unavailable-label">
                        Unavailable · remove to continue
                      </span>
                    )}
                    <div className="cart-line-bottom">
                      <b>{money(price * line.quantity)}</b>
                      <Stepper
                        label={item?.name || "dish"}
                        value={line.quantity}
                        disabled={!item?.available}
                        onChange={(value) => app.quantity(key, value)}
                      />
                      <button
                        className="remove-button"
                        aria-label={`Remove ${item?.name || "dish"}`}
                        onClick={() => app.quantity(key, 0)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="cart-summary">
            <div>
              <span>Item total</span>
              <span>{money(quote?.subtotalPaise ?? app.total)}</span>
            </div>
            {!!quote?.couponDiscountPaise && <div className="green"><span>{quote.couponCode}</span><span>−{money(quote.couponDiscountPaise)}</span></div>}
            {!!quote?.redeemedPoints && <div className="green"><span>{quote.redeemedPoints} loyalty points</span><span>−{money(quote.redeemedPoints * 100)}</span></div>}
            <div className="muted">
              <span>GST included (5%)</span>
              <span>{money(quote?.gstPaise ?? gstIncluded(app.total))}</span>
            </div>
            <div>
              <span>{quote?.fulfillment === "delivery" ? "Delivery fee" : "Pickup"}</span>
              <span>{quote?.deliveryFeePaise ? money(quote.deliveryFeePaise) : "Free"}</span>
            </div>
            <div className="grand-total">
              <strong>To pay</strong>
              <strong>{money(quote?.totalPaise ?? app.total)}</strong>
            </div>
          </div>
          {app.unavailable && (
            <p className="inline-error">
              An item or option is unavailable. Remove it to continue.
            </p>
          )}
          {checkoutLink &&
            (app.unavailable ? (
              <button className="button primary full" disabled>
                Review unavailable items
              </button>
            ) : (
              <Link href="/checkout" className="button primary full">
                Continue to checkout <ArrowRight size={17} />
              </Link>
            ))}
          <p className="cart-footnote">{quote?.fulfillment === "delivery" ? `Free delivery from ${money(quote.freeDeliveryAbovePaise)} before discounts.` : "Delivery fees and minimum are shown at checkout."}</p>
        </>
      )}
    </section>
  );
}
