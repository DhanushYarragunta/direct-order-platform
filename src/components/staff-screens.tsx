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
} from "lucide-react";
import { request, useResource } from "@/lib/client";
import { money } from "@/lib/domain";
import type { MenuData, Order, Outlet } from "@/lib/types";
import { useApp } from "./provider";
import { Diet, Empty, ErrorNotice, Loading, Modal } from "./ui";
import { time } from "./order-screens";
import { AnalyticsScreen } from "./analytics-screen";

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
    [override, setOverride] = useState<Order | null>(null);
  const stock = useResource<MenuData>(
    `/api/menu?outlet=${r.outletId}`,
    `/api/events?scope=menu&outlet=${r.outletId}`,
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
        label: "Ready for pickup",
        next: "HANDED_OFF",
        action: "Confirm handoff",
      },
    ],
    orders = r.data?.orders || [];
  return (
    <div className="page kitchen-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">KITCHEN DISPLAY</p>
          <h1>Every order. In good hands.</h1>
          <p>
            <span className="status-dot" /> Updates automatically ·{" "}
            {new Date(now).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="kitchen-toolbar">
          <OutletSelect
            data={r.data}
            value={r.outletId}
            onChange={r.setSelected}
          />
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
      {(r.error || error) && (
        <ErrorNotice message={error || r.error} retry={r.refresh} />
      )}{" "}
      {r.loading ? (
        <Loading />
      ) : (
        <div className="kitchen-board">
          {columns.map((column) => {
            const list = orders
              .filter((o) => o.status === column.status)
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
                      const remaining = order.promisedAt
                          ? Math.ceil(
                              (new Date(order.promisedAt).getTime() - now) /
                                60000,
                            )
                          : 0,
                        late = remaining < 0 && column.status !== "READY",
                        alert = order.messages.some((m) => m.kind === "LATE");
                      return (
                        <article
                          className={`kitchen-ticket ${late ? "ticket-late" : ""}`}
                          key={order.id}
                        >
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
                            {column.status === "READY"
                              ? `Ready ${order.readyAt ? time(order.readyAt) : "now"}`
                              : late
                                ? `${Math.abs(remaining)} min overdue`
                                : `${remaining} min to promise`}
                            <small>Placed {time(order.createdAt)}</small>
                          </div>
                          {alert && column.status !== "READY" && (
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
                          <div className="ticket-total">
                            <span>
                              {order.lines.reduce((s, l) => s + l.quantity, 0)}{" "}
                              items · {order.paymentStatus.toLowerCase()}
                            </span>
                            <strong>{money(order.totalPaise)}</strong>
                          </div>
                          <button
                            className="button primary full"
                            disabled={busy === order.id}
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
                            column.status !== "READY" && (
                              <button
                                className="text-button promise-button"
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
                        {column.status === "PLACED"
                          ? "All caught up"
                          : "No orders here yet"}
                      </h3>
                      <p>
                        {column.status === "PLACED"
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
        {stock.error && (
          <ErrorNotice message={stock.error} retry={stock.refresh} />
        )}{" "}
        {stock.data?.items.map((item) => (
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
              disabled={busy === item.id}
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
              disabled={busy === override.id}
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
