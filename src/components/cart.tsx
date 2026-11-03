"use client";
import Link from "next/link";
import { ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import { cartLineKey, gstIncluded, money } from "@/lib/domain";
import { useApp } from "./provider";
import { Empty, FoodPhoto, Stepper } from "./ui";

export function Cart({ checkoutLink = true }: { checkoutLink?: boolean }) {
  const app = useApp(),
    count = app.cart.reduce((s, l) => s + l.quantity, 0);
  return (
    <section className="cart-panel" id="your-order">
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
              <span>{money(app.total)}</span>
            </div>
            <div className="muted">
              <span>GST included (5%)</span>
              <span>{money(gstIncluded(app.total))}</span>
            </div>
            <div>
              <span>Pickup / demo delivery</span>
              <span className="green">Free</span>
            </div>
            <div className="grand-total">
              <strong>To pay</strong>
              <strong>{money(app.total)}</strong>
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
          <p className="cart-footnote">Freshly made. Thoughtfully packed.</p>
        </>
      )}
    </section>
  );
}
