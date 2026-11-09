"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { money } from "@/lib/domain";
import { reviewReorder } from "@/lib/reorder";
import type { Order } from "@/lib/types";
import { useApp } from "./provider";
import { Diet, ErrorNotice, Loading, Modal } from "./ui";
import "./customer-completion.css";

export function ReorderButton({ order }: { order: Order }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  if (app.user?.role !== "CUSTOMER" || app.user.id !== order.userId || order.status === "PENDING_PAYMENT") return null;
  return <><button type="button" className="button secondary no-print" onClick={() => setOpen(true)}><RotateCcw size={17} />Order again</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Order your favourites again" description={`${order.number} · Review today's menu before adding to your cart.`}>
      {open && <ReorderReview order={order} close={() => setOpen(false)} />}
    </Modal></>;
}
function ReorderReview({ order, close }: { order: Order; close: () => void }) {
  const app = useApp(), router = useRouter();
  const [omitted, setOmitted] = useState<string[]>([]), [error, setError] = useState("");
  const menu = app.menu.data;
  if (app.menu.error) return <ErrorNotice message={app.menu.error} retry={app.menu.refresh} />;
  if (!menu || menu.outlet.id !== app.outletId || app.menu.loading) return <Loading />;
  const rows = reviewReorder(order.lines, menu);
  const selected = rows.filter(row => !row.reason && !omitted.includes(row.id));
  return <div className="form-stack reorder-review">
    <p>Ordering from <strong>{menu.outlet.name}</strong>. Existing cart items stay in your cart. Choose your delivery address and any offers at checkout.</p>
    {rows.map(row => <label className={`reorder-review-line ${row.reason ? "unavailable" : ""}`} key={row.id}>
      <input type="checkbox" checked={!row.reason && !omitted.includes(row.id)} disabled={!!row.reason}
        onChange={event => { setError(""); setOmitted(ids => event.target.checked ? ids.filter(id => id !== row.id) : [...ids, row.id]); }} />
      <span><strong>{row.vegetarian !== undefined && <Diet veg={row.vegetarian} />} {row.line.quantity} × {row.name}</strong><small>{row.details}</small><small>{row.allergens.length ? `Contains ${row.allergens.join(", ")}` : "No declared allergens"}</small>{row.reason && <small>{row.reason}</small>}</span>
      {!row.reason && <strong>{money(row.unitPaise * row.line.quantity)}</strong>}
    </label>)}
    <p className="muted">Item total {money(selected.reduce((sum, row) => sum + row.unitPaise * row.line.quantity, 0))} · includes 5% GST. Delivery and offers are calculated at checkout.</p>
    {error && <ErrorNotice message={error} />}
    {!menu.outlet.open && <ErrorNotice message="This kitchen is closed. Choose an open kitchen from the menu." />}
    <button className="button primary" disabled={!selected.length || !menu.outlet.open || !app.cartReady} onClick={() => {
      try { app.addReviewedLines(selected.map(row => row.line)); close(); router.push("/checkout"); }
      catch (failure) { setError((failure as Error).message); }
    }}>Add selected dishes to cart</button>
  </div>;
}
