"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChefHat,
  Clock3,
  Maximize2,
  RefreshCw,
  Settings2,
  TriangleAlert,
  Volume2,
  Monitor,
} from "lucide-react";
import { request, useResource } from "@/lib/client";
import { money } from "@/lib/domain";
import type { MenuData, Order, Outlet } from "@/lib/types";
import { useApp } from "./provider";
import { Diet, Empty, ErrorNotice, Loading, Modal } from "./ui";
import { time } from "./order-screens";
import { AnalyticsScreen } from "./analytics-screen";
import { useKitchenTablet } from "./kitchen-tablet";
import { kitchenUrgency } from "@/lib/kitchen-display";
import "./kitchen-quality.css";
import "./customer-completion.css";

type StaffData = { outlet: Outlet; outlets: Outlet[]; orders: Order[] };
export function StaffGate({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const app = useApp();
  if (!app.authReady) return <Loading />;
  if (!app.user)
    return (
      <div className="page">
        <Empty title="Welcome to the restaurant workspace">
          <p>Sign in with a staff account to continue.</p>
          <Link href="/login?next=/workspace" className="button primary">
            Staff sign in
          </Link>
        </Empty>
      </div>
    );
  if (app.user.role === "CUSTOMER" || (admin && app.user.role !== "ADMIN"))
    return (
      <div className="page">
        <Empty title="This area needs staff access">
          <p>
            {admin
              ? "The central admin manages the menu."
              : "Use a kitchen, manager or admin account."}
          </p>
          <Link href="/login?next=/workspace" className="button primary">
            Switch account
          </Link>
        </Empty>
      </div>
    );
  return children;
}
function useStaff() {
  const app = useApp(),
    [selected, setSelected] = useState("kondapur"),
    outletId = app.user?.outletId || selected;
  const resource = useResource<StaffData>(
    app.user && app.user.role !== "CUSTOMER"
      ? `/api/staff/orders?outlet=${outletId}`
      : null,
    app.user && app.user.role !== "CUSTOMER"
      ? `/api/events?scope=kitchen&outlet=${outletId}`
      : undefined,
  );
  return { ...resource, outletId, setSelected };
}
function OutletSelect({
  data,
  value,
  onChange,
}: {
  data: StaffData | null;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="staff-outlet-select"
      aria-label="Workspace outlet"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {(data?.outlets || [{ id: value, name: value }]).map((o) => (
        <option value={o.id} key={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
export function WorkspaceScreen() {
  return (
    <StaffGate>
      <AnalyticsScreen />
    </StaffGate>
  );
}

export function KitchenScreen() {
  return (
    <StaffGate>
      <Kitchen />
    </StaffGate>
  );
}
function Kitchen() {
  const app = useApp(),
    r = useStaff(),
    [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [stockOpen, setStockOpen] = useState(false),
    [query, setQuery] = useState(""),
    [lateOnly, setLateOnly] = useState(false),
    [stockQuery, setStockQuery] = useState(""),
    [override, setOverride] = useState<Order | null>(null);
  const tablet = useKitchenTablet(r.outletId, r.data?.outlet.id === r.outletId ? r.data.orders : undefined);
  const stock = useResource<MenuData>(
    stockOpen ? `/api/menu?outlet=${r.outletId}` : null,
    stockOpen ? `/api/events?scope=menu&outlet=${r.outletId}` : undefined,
  );
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  async function advance(order: Order, status: string) {
    setBusy(order.id);
    setError("");
    try {
      await request(`/api/orders/${order.id}`, "PATCH", {
        status,
        version: order.version,
      });
      await r.refresh();
    } catch (e) {
      setError((e as Error).message);
      await r.refresh();
    } finally {
      setBusy(null);
    }
  }
  const columns = [
      {
        status: "PLACED",
        label: "New orders",
        next: "PREPARING",
        action: "Start preparing",
      },
      {
        status: "PREPARING",
        label: "Preparing",
        next: "READY",
        action: "Mark ready",
      },
      {
        status: "READY",
        label: "Ready for handoff",
        next: "HANDED_OFF",
        action: "Confirm handoff",
      },
      { status: "HANDED_OFF", label: "Awaiting dispatch", next: "OUT_FOR_DELIVERY", action: "Mark out for delivery" },
      { status: "OUT_FOR_DELIVERY", label: "Out for delivery", next: "DELIVERED", action: "Confirm delivered" },
    ],
    allOrders = (r.data?.outlet.id === r.outletId ? r.data.orders : []).filter(order => columns.some(column => column.status === order.status) && !(order.status === "HANDED_OFF" && order.fulfillment === "pickup")),
    orders = allOrders.filter(order => (!lateOnly || kitchenUrgency(order.status, order.promisedAt, now).tone === "late")
      && `${order.number} ${order.note} ${order.lines.map(line => line.name).join(" ")}`.toLowerCase().includes(query.toLowerCase().trim())),
    visibleColumns = columns.filter((column) => !["HANDED_OFF", "OUT_FOR_DELIVERY"].includes(column.status)
      || allOrders.some((order) => order.fulfillment === "delivery" && order.status === column.status));
  return (
    <div className="page kitchen-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">KITCHEN DISPLAY</p>
          <h1>Every order. In good hands.</h1>
          <div className="kitchen-connection">
            <span className={`connection-chip connection-${r.connection}`} role="status" aria-live="polite">
              <span aria-hidden="true" />
              {r.connection === "live" ? "Live" : r.connection === "offline" ? "Offline" : r.connection === "connecting" ? "Connecting" : "Reconnecting"}
            </span>
            <span>Last synced {r.lastSynced ? new Date(r.lastSynced).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
          </div>
        </div>
        <div className="kitchen-toolbar">
          <OutletSelect
            data={r.data}
            value={r.outletId}
            onChange={r.setSelected}
          />
          <button className="button secondary" aria-pressed={tablet.sound === "on"} onClick={tablet.toggleSound}>
            <Volume2 size={20} /> {tablet.sound === "on" ? "Sound on" : "Enable sound"}
          </button>
          <button className="button secondary" aria-pressed={tablet.wakeEnabled} onClick={tablet.toggleWake}>
            <Monitor size={20} /> {tablet.awake ? "Screen awake" : tablet.wakeEnabled ? "Wake requested" : "Keep screen awake"}
          </button>
          <button
            className="button secondary"
            onClick={() => setStockOpen(true)}
          >
            <Settings2 size={17} /> Availability
          </button>
          <button
            className="icon-button"
            aria-label="Refresh orders"
            onClick={r.refresh}
          >
            <RefreshCw size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Toggle fullscreen"
            onClick={() => {
              const action = document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen?.();
              void action?.catch(() =>
                app.setToast("Fullscreen isn't available in this browser."),
              );
            }}
          >
            <Maximize2 size={18} />
          </button>
        </div>
      </div>
      {tablet.notice && <p className="tablet-notice" role="status">{tablet.notice}</p>}
      {r.connection !== "live" && !r.loading && (
        <div className="kitchen-sync-warning" role="status">
          <TriangleAlert size={24} /> {r.connection === "offline" ? "Offline — showing the last saved tickets. Actions are paused until the connection returns." : "Reconnecting — tickets may be out of date. Check the last synced time before taking action."}
        </div>
      )}
      <div className="kitchen-search-row"><label>Find a kitchen ticket<input type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Order number, dish or note" /></label>
        <button className="button secondary" aria-pressed={lateOnly} onClick={() => setLateOnly(value => !value)}>Overdue only ({allOrders.filter(order => kitchenUrgency(order.status, order.promisedAt, now).tone === "late").length})</button>
        {(query || lateOnly) && <button className="button secondary" onClick={() => { setQuery(""); setLateOnly(false); }}>Show all tickets</button>}
      </div>
      {(query || lateOnly) && <p className="kitchen-filter-note" role="status">Filtered view · Showing {orders.length} of {allOrders.length} active tickets. Clear filters to see every order.</p>}
      <p className="kitchen-legend"><span>Green · On time</span><span>Amber · Due within 5 minutes</span><span>Red · Overdue</span></p>
      {(r.error || error) && (
        <ErrorNotice message={error || r.error} retry={r.refresh} />
      )}{" "}
      {r.loading ? (
        <Loading />
      ) : (
        <div className="kitchen-board">
          {visibleColumns.map((column) => {
            const list = orders
              .filter((o) => o.status === column.status && (column.status !== "HANDED_OFF" || o.fulfillment === "delivery"))
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return (
              <section
                className={`kitchen-column column-${column.status.toLowerCase()}`}
                key={column.status}
              >
                <div className="column-title">
                  <span className="column-dot" />
                  <h2>{column.label}</h2>
                  <span className="column-count">{list.length}</span>
                </div>
                <div className="ticket-list">
                  {list.length ? (
                    list.map((order) => {
                      const urgency = kitchenUrgency(order.status, order.promisedAt, now),
                        remaining = urgency.remaining,
                        late = urgency.tone === "late",
                        prepared = ["READY", "HANDED_OFF", "OUT_FOR_DELIVERY"].includes(column.status),
                        alert = order.messages.some((m) => m.kind === "LATE");
                      return (
                        <article
                          className={`kitchen-ticket ticket-${urgency.tone}`}
                          key={order.id}
                        >
                          <div className="ticket-band"><strong>{urgency.label}</strong></div>
                          <div className="ticket-heading">
                            <strong>{order.number}</strong>
                            <span>
                              {order.fulfillment === "delivery"
                                ? "DELIVERY"
                                : "PICKUP"}
                            </span>
                          </div>
                          <div className={`ticket-timer ${late ? "late" : ""}`}>
                            <Clock3 size={18} />
                            {prepared
                              ? column.status === "OUT_FOR_DELIVERY" ? "Delivery in progress" : `Ready ${order.readyAt ? time(order.readyAt) : "now"}`
                              : remaining === null ? "Check promised time"
                                : late ? `${Math.abs(remaining)} min overdue` : `${remaining} min to promise`}
                            <small>Placed {time(order.createdAt)}</small>
                          </div>
                          {alert && !prepared && (
                            <div className="manager-alert">
                              <TriangleAlert size={15} /> Manager alert · 10+
                              min past promise
                            </div>
                          )}
                          <div className="ticket-items">
                            {order.lines.map((line) => (
                              <div key={line.id}>
                                <b>{line.quantity}×</b>
                                <span>
                                  <strong>{line.name}</strong>
                                  <small>
                                    {line.portion}
                                    {line.addOns.length
                                      ? ` · ${line.addOns.map((a) => a.name).join(", ")}`
                                      : ""}
                                  </small>
                                </span>
                              </div>
                            ))}
                          </div>
                          {order.note && (
                            <div className="ticket-note">
                              Note: {order.note}
                            </div>
                          )}
                          {order.fulfillment === "delivery" && (
                            <div className="ticket-delivery"><strong>Delivery address</strong><p>{order.address}</p><p>{order.phone}</p></div>
                          )}
                          <div className="ticket-total">
                            <span>
                              {order.lines.reduce((s, l) => s + l.quantity, 0)}{" "}
                              items · {order.paymentStatus.toLowerCase()}
                            </span>
                            <strong>{money(order.totalPaise)}</strong>
                          </div>
                          <button
                            className="button primary full"
                            disabled={busy === order.id || r.connection === "offline"}
                            onClick={() => advance(order, column.next)}
                          >
                            {busy === order.id ? "Updating…" : column.action}
                            {column.status === "READY" ? (
                              <Check size={18} />
                            ) : (
                              <ArrowRight size={18} />
                            )}
                          </button>
                          {["ADMIN", "MANAGER"].includes(
                            app.user?.role || "",
                          ) &&
                            !prepared && (
                              <button
                                className="text-button promise-button"
                                disabled={r.connection === "offline"}
                                onClick={() => setOverride(order)}
                              >
                                Update promised time
                              </button>
                            )}
                        </article>
                      );
                    })
                  ) : (
                    <div className="empty-column">
                      <CheckCircle />
                      <h3>
                        {query || lateOnly ? "No matching tickets" : column.status === "PLACED"
                          ? "All caught up"
                          : "No orders here yet"}
                      </h3>
                      <p>
                        {query || lateOnly ? "Clear filters to see all tickets in this stage." : column.status === "PLACED"
                          ? "New paid orders arrive automatically."
                          : "Tickets move here as preparation progresses."}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <Modal
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        title="Kitchen availability"
        description={`Changes apply to ${r.data?.outlet.name || r.outletId} and update the customer menu.`}
      >
        <label>Search kitchen availability<input type="search" value={stockQuery} onChange={event => setStockQuery(event.target.value)} maxLength={100} /></label>
        {stock.loading && <Loading />}
        {stock.error && (
          <ErrorNotice message={stock.error} retry={stock.refresh} />
        )}{" "}
        {stock.data && !stock.data.items.some(item => item.name.toLowerCase().includes(stockQuery.toLowerCase().trim())) && <p>No dishes match this search.</p>}
        {stock.data?.items.filter(item => item.name.toLowerCase().includes(stockQuery.toLowerCase().trim())).map((item) => (
          <div className="stock-row" key={item.id}>
            <Diet veg={item.vegetarian} />
            <div>
              <strong>{item.name}</strong>
              <small>
                {item.inStock
                  ? item.available ? "In stock · available to order" : `In stock · ${item.unavailableReason?.toLowerCase() || "not taking orders"}`
                  : "Out of stock"}
              </small>
            </div>
            <button
              className={`switch ${item.inStock ? "on" : ""}`}
              role="switch"
              aria-checked={item.inStock === true}
              aria-label={`${item.name} availability`}
              disabled={busy === item.id || r.connection === "offline"}
              onClick={async () => {
                setBusy(item.id);
                try {
                  await request("/api/staff/availability", "PATCH", {
                    outletId: r.outletId,
                    itemId: item.id,
                    available: !item.inStock,
                  });
                  await stock.refresh();
                } catch (e) {
                  app.setToast((e as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              <span />
            </button>
          </div>
        ))}
      </Modal>
      <Modal
        open={!!override}
        onClose={() => setOverride(null)}
        title="Update the promise"
        description="A customer update and an audit entry will be saved."
      >
        {override && (
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setBusy(override.id);
              try {
                await request(`/api/orders/${override.id}/promise`, "PATCH", {
                  minutes: Number(form.get("minutes")),
                  reason: form.get("reason"),
                  version: override.version,
                });
                setOverride(null);
                await r.refresh();
              } catch (e) {
                app.setToast((e as Error).message);
              } finally {
                setBusy(null);
              }
            }}
          >
            <label>
              Minutes from now
              <input
                type="number"
                name="minutes"
                min={r.data?.outlet.minPrepMinutes || 25}
                max={180}
                defaultValue={r.data?.outlet.minPrepMinutes || 25}
                required
              />
            </label>
            <small>
              Cannot be lower than the kitchen minimum of{" "}
              {r.data?.outlet.minPrepMinutes} minutes.
            </small>
            <label>
              Reason for the customer
              <textarea
                name="reason"
                required
                minLength={5}
                maxLength={200}
                placeholder="A short, useful explanation"
              />
            </label>
            <button
              className="button primary full"
              disabled={busy === override.id || r.connection === "offline"}
            >
              Save new promise
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
function CheckCircle() {
  return (
    <span className="empty-check">
      <Check size={22} />
    </span>
  );
}
