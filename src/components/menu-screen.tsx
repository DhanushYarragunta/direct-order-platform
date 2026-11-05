"use client";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Clock3,
  Flame,
  LocateFixed,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import { CATEGORIES, chooseOutlet, money } from "@/lib/domain";
import type { MenuItem } from "@/lib/types";
import { useApp } from "./provider";
import { Cart } from "./cart";
import "./menu-depth.css";
import "./customer-quality.css";
import {
  Diet,
  Empty,
  ErrorNotice,
  FoodPhoto,
  Loading,
  Modal,
  Stepper,
} from "./ui";

export function MenuScreen() {
  const app = useApp(),
    { data, error, loading, refresh } = app.menu;
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All dishes"),
    [veg, setVeg] = useState(false),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [portion, setPortion] = useState<"regular" | "family">("regular"),
    [extras, setExtras] = useState<string[]>([]),
    [quantity, setQuantity] = useState(1),
    [locating, setLocating] = useState(false);
  const items =
    data?.items.filter(
      (i) =>
        (category === "All dishes" || i.category === category) &&
        (!veg || i.vegetarian) &&
        `${i.name} ${i.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) || [];
  function customise(item: MenuItem) {
    setSelectedId(item.id);
    setPortion("regular");
    setExtras([]);
    setQuantity(1);
  }
  function locate() {
    if (!navigator.geolocation) {
      app.setToast("Location is unavailable. Choose your kitchen manually.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const outlet = chooseOutlet(data?.outlets || [], position.coords);
        if (outlet) {
          app.setOutletId(outlet.id);
          app.setToast(
            `Your nearest kitchen is ${outlet.name}. Cart availability has been updated.`,
          );
        } else
          app.setToast(
            "You're outside our delivery area. You can still order for pickup.",
          );
        setLocating(false);
      },
      () => {
        setLocating(false);
        app.setToast(
          "We couldn't access your location. Choose a kitchen below.",
        );
      },
      { timeout: 10000 },
    );
  }
  const selected = data?.items.find((item) => item.id === selectedId) || null;
  const selectedAvailable = selected?.available && (portion !== "family" || selected.familyPricePaise !== null) && extras.every((id) => data?.addOns.some((extra) => extra.id === id));
  const suggestions = app.user?.role === "CUSTOMER" ? (data?.suggestedItemIds || []).flatMap((id) => {
    const item = data?.items.find((dish) => dish.id === id && dish.available);
    return item ? [item] : [];
  }) : [];
  return (
    <div className="page menu-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">FROM HYDERABAD, WITH LOVE</p>
          <h1>Something delicious awaits.</h1>
          <p>Slow-cooked traditions. Fresh from your neighbourhood kitchen.</p>
        </div>
        <div className="kitchen-picker">
          <MapPin size={19} />
          <div>
            <label htmlFor="outlet">ORDERING FROM</label>
            <select
              id="outlet"
              value={app.outletId}
              onChange={(e) => {
                app.setOutletId(e.target.value);
                app.setToast(
                  "Kitchen changed. Your cart will be checked for availability.",
                );
              }}
            >
              {(data?.outlets || [{ id: app.outletId, name: "Kondapur" }]).map(
                (o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ),
              )}
            </select>
          </div>
          <button
            className="icon-button"
            aria-label="Find nearest kitchen"
            disabled={locating}
            onClick={locate}
          >
            <LocateFixed size={18} className={locating ? "spin" : ""} />
          </button>
        </div>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <span /> THE HOUSE SPECIAL
          </span>
          <h2>
            A little dum.
            <br />A lot of <em>Hyderabad.</em>
          </h2>
          <p>
            Fragrant basmati. Tender chicken. The kind of biryani that brings
            everyone to the table.
          </p>
          <a href="#menu" className="button hero-button">
            Find your favourite <ArrowDown size={17} />
          </a>
          <div className="hero-detail">
            <span>
              <Clock3 size={15} /> Cooked to order
            </span>
            <i />
            <span>Authentic Hyderabadi flavours</span>
          </div>
        </div>
        <div className="hero-image">
          <FoodPhoto
            src="/food/chicken-biryani.jpg"
            name="Chicken dum biryani, prepared and served in a traditional bowl"
          />
          <div className="hero-image-overlay" />
          <div className="hero-caption">
            <span>SIGNATURE CHICKEN DUM BIRYANI</span>
            <strong>
              Worth slowing down for. <ArrowUpRight size={22} />
            </strong>
          </div>
        </div>
      </section>
      <div className="menu-layout">
        <section className="menu-content" id="menu">
          {!!suggestions.length && <section className="reorder-section" aria-label="Order again suggestions">
            <div className="section-heading"><div><h2>Your usual, made fresh.</h2><p>Favourites from your recent orders at {data?.outlet.name}. Choose a dish to review portions and extras.</p></div></div>
            <div className="reorder-items">
              {suggestions.map((item) => <div className="reorder-item" key={item.id}>
                <strong><Diet veg={item.vegetarian} /> {item.name}</strong><span>{money(item.pricePaise)}</span>
                <button className="add-button" aria-label={`Choose ${item.name} again`} onClick={() => customise(item)}>Choose <Plus size={15} /></button>
              </div>)}
            </div>
          </section>}
          <div className="section-heading">
            <div>
              <p className="eyebrow">MADE FRESH, EVERY DAY</p>
              <h2>
                Explore our menu{" "}
                <span className="count-label">
                  {data?.items.length || 0} dishes
                </span>
              </h2>
            </div>
            <span className="inclusive-note">All prices include 5% GST</span>
          </div>
          <div className="menu-controls">
            <div className="search-field">
              <Search size={18} />
              <input
                aria-label="Search dishes"
                placeholder="Find your craving…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  ×
                </button>
              )}
            </div>
            <label className="veg-toggle">
              <input
                type="checkbox"
                checked={veg}
                onChange={(e) => setVeg(e.target.checked)}
              />
              <Diet veg /> Veg only
            </label>
          </div>
          <div className="category-tabs" aria-label="Menu categories">
            {["All dishes", ...CATEGORIES].map((c) => (
              <button
                aria-pressed={category === c}
                className={category === c ? "selected" : ""}
                key={c}
                onClick={() => setCategory(c)}
              >
                {c === "All dishes" && <UtensilsCrossed size={15} />} {c}
              </button>
            ))}
          </div>
          {error && <ErrorNotice message={error} retry={refresh} />}{" "}
          {loading ? (
            <Loading />
          ) : items.length ? (
            <div className="menu-grid">
              {items.map((item) => (
                <article
                  className={`dish-card ${!item.available ? "sold-out" : ""}`}
                  key={item.id}
                >
                  <div className="dish-image">
                    <FoodPhoto src={item.photo} name={item.name} />
                    {item.featured && (
                      <span className="dish-badge">
                        <Flame size={12} /> House favourite
                      </span>
                    )}
                    {!item.available && (
                      <span className="sold-out-badge">{item.unavailableReason || "Sold out for now"}</span>
                    )}
                  </div>
                  <div className="dish-copy">
                    <div className="dish-meta">
                      <Diet veg={item.vegetarian} />
                      <span>
                        {item.vegetarian ? "VEGETARIAN" : "NON-VEGETARIAN"}
                      </span>
                      <span className="spice">{item.spice}</span>
                    </div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <div className="allergens">
                      {item.allergens.length
                        ? `Contains ${item.allergens.join(", ")}`
                        : "No declared allergens"}
                    </div>
                    {item.scheduleLabel && <div className="dish-schedule"><Clock3 size={13} />{item.scheduleLabel}</div>}
                    <div className="dish-bottom">
                      <div>
                        <strong>{money(item.pricePaise)}</strong>
                        <small>{item.portion}</small>
                      </div>
                      <button
                        className="add-button"
                        disabled={!item.available}
                        onClick={() => customise(item)}
                        aria-label={`Add ${item.name}`}
                      >
                        {item.available ? "Add" : "Unavailable"}
                        {item.available && <Plus size={16} />}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            !error && (
              <Empty title="No dishes found">
                <p>Try another search or category.</p>
                <button
                  className="button secondary"
                  onClick={() => {
                    setQuery("");
                    setCategory("All dishes");
                    setVeg(false);
                  }}
                >
                  Show all dishes
                </button>
              </Empty>
            )
          )}
          <div className="kitchen-info">
            <MapPin size={19} />
            <div>
              <strong>{data?.outlet.name || "Your kitchen"}</strong>
              <p>{data?.outlet.address}</p>
              <small>
                Delivery within {data?.outlet.radiusKm || 5} km · {data?.outlet.fssaiVerified ? "FSSAI licence:" : "Demo FSSAI number (not a licence):"}{" "}
                {data?.outlet.fssai || "Loading"}
              </small>
              <small><a href="/photo-credits">Photo credits · sample presentation</a></small>
            </div>
          </div>
        </section>
        <aside className="cart-aside">
          <Cart />
        </aside>
      </div>
      {app.cart.length > 0 && (
        <a className="mobile-cart-bar" href="#your-order">
          <ShoppingBag size={18} />
          {app.cart.reduce((s, l) => s + l.quantity, 0)} items{" "}
          <strong>{money(app.total)}</strong>
          <span>View order →</span>
        </a>
      )}
      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.name || "Make it yours"}
        description="Your meal, just how you like it."
      >
        {selected && (
          <>
            <FoodPhoto
              className="modal-food"
              src={selected.photo}
              name={selected.name}
            />
            <div className="modal-dish-info">
              <Diet veg={selected.vegetarian} />
              <p>{selected.description}</p>
            </div>
            <p className="allergens">
              Contains:{" "}
              {selected.allergens.join(", ") || "no declared allergens"}. Please
              tell us about allergies before ordering.
            </p>
            <h3 className="field-heading">Choose your portion</h3>
            <div className="option-grid">
              {(
                [
                  "regular",
                  ...(selected.familyPricePaise ? ["family"] : []),
                ] as const
              ).map((p) => (
                <button
                  key={p}
                  className={`choice ${portion === p ? "chosen" : ""}`}
                  onClick={() => setPortion(p as "regular" | "family")}
                >
                  <span>
                    {p === "family"
                      ? "Family pack · serves 3–4"
                      : selected.portion}
                  </span>
                  <strong>
                    {money(
                      p === "family"
                        ? selected.familyPricePaise!
                        : selected.pricePaise,
                    )}
                  </strong>
                  {portion === p && <Check size={17} />}
                </button>
              ))}
            </div>
            {data?.addOns.length ? (
              <>
                <h3 className="field-heading">
                  A little extra <span>Optional</span>
                </h3>
                {data.addOns.map((a) => (
                  <label className="addon-row" key={a.id}>
                    <input
                      type="checkbox"
                      checked={extras.includes(a.id)}
                      onChange={(e) =>
                        setExtras((ids) =>
                          e.target.checked
                            ? [...ids, a.id]
                            : ids.filter((id) => id !== a.id),
                        )
                      }
                    />
                    <span>
                      {a.name}
                      <small>
                        {a.allergens.length
                          ? `Contains ${a.allergens.join(", ")}`
                          : ""}
                      </small>
                    </span>
                    <b>+{money(a.pricePaise)}</b>
                  </label>
                ))}
              </>
            ) : null}
            <div className="modal-actions">
              <Stepper
                value={quantity}
                label={selected.name}
                onChange={(v) => setQuantity(Math.max(1, v))}
              />
              <button
                className="button primary"
                disabled={!selectedAvailable}
                onClick={() => {
                  app.add({
                    itemId: selected.id,
                    quantity,
                    portion,
                    addOnIds: extras,
                  });
                  setSelectedId(null);
                }}
              >
                {selectedAvailable
                  ? `Add to order · ${money(((portion === "family" ? selected.familyPricePaise! : selected.pricePaise) + extras.reduce((s, id) => s + (data?.addOns.find((a) => a.id === id)?.pricePaise || 0), 0)) * quantity)}`
                  : "Currently unavailable"}{" "}
                <Plus size={16} />
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
