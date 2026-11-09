"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, TicketPercent } from "lucide-react";
import { request, useResource } from "@/lib/client";
import { money } from "@/lib/domain";
import { couponStatus, type CouponRecord } from "@/lib/coupon-validation";
import { cateringLocalDate, cateringEventDate } from "@/lib/catering-validation";
import { StaffGate } from "./staff-screens";
import { useApp } from "./provider";
import { Empty, ErrorNotice, Loading, Modal } from "./ui";
import "./customer-completion.css";

export function CouponsScreen() { return <StaffGate admin><CouponManager /></StaffGate>; }
function CouponManager() {
  const app = useApp();
  const r = useResource<{ coupons: CouponRecord[] }>("/api/admin/coupons");
  const [editor, setEditor] = useState<CouponRecord | "new" | null>(null);
  const [query, setQuery] = useState("");
  const coupons = r.data?.coupons.filter(coupon => `${coupon.code} ${coupon.description}`.toLowerCase().includes(query.toLowerCase().trim())) || [];
  return <div className="page coupons-page"><div className="page-intro"><div><p className="eyebrow">GIVE THEM ANOTHER REASON TO RETURN</p><h1>Offers from your kitchen.</h1><p>Create offers, set their dates and pause them whenever you need.</p></div>
    <button className="button primary" onClick={() => setEditor("new")}><Plus size={18} />Create coupon</button></div>
    <label className="coupon-search">Search coupons<input type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Code or description" /></label>
    {r.error && <ErrorNotice message={r.error} retry={r.refresh} />}
    {r.loading ? <Loading /> : coupons.length ? <div className="coupon-grid">{coupons.map(coupon => <article className="panel coupon-card" key={coupon.code}>
      <div className="coupon-card-heading"><TicketPercent size={25} /><h2>{coupon.code}</h2><span className="coupon-status">{couponStatus(coupon)}</span></div><p>{coupon.description}</p>
      <strong className="coupon-value">{coupon.type === "PERCENT" ? `${coupon.value}%` : money(coupon.value)} off</strong>
      <p>Minimum items {money(coupon.minSubtotalPaise)} · up to {money(coupon.maxDiscountPaise)} off{coupon.firstOrderOnly ? " · first paid order only" : ""}</p>
      <p className="muted">{new Date(coupon.startsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} – {new Date(coupon.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST</p>
      <button className="button secondary" aria-label={`Edit ${coupon.code}`} onClick={() => setEditor(coupon)}>Edit offer</button>
    </article>)}</div> : !r.error && <Empty title={query ? "No matching coupons" : "Your first offer starts here"}><p>{query ? "Try a different code or description." : "Create a coupon for customers to use at checkout."}</p></Empty>}
    <Modal open={!!editor} onClose={() => setEditor(null)} title={editor === "new" ? "Create a coupon" : "Edit coupon"} description="Changes apply to new checkouts. Existing payment sessions keep their saved offer terms.">
      {editor && <CouponEditor initial={editor === "new" ? null : editor} close={() => setEditor(null)} saved={value => {
        r.mutate(data => ({ coupons: [...(data?.coupons || []).filter(coupon => coupon.code !== value.code), value].sort((a, b) => a.code.localeCompare(b.code)) }));
        setEditor(null); app.setToast("Coupon saved");
      }} />}
    </Modal>
  </div>;
}
function CouponEditor({ initial, close, saved }: { initial: CouponRecord | null; close: () => void; saved: (coupon: CouponRecord) => void }) {
  const [type, setType] = useState(initial?.type || "PERCENT"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const input = { code: initial?.code || String(fields.get("code")), description: String(fields.get("description")), type,
        value: Math.round(Number(fields.get("value")) * (type === "FIXED" ? 100 : 1)),
        minSubtotalPaise: Math.round(Number(fields.get("minimum")) * 100), maxDiscountPaise: Math.round(Number(fields.get("maximum")) * 100),
        startsAt: cateringEventDate(String(fields.get("startsAt"))), expiresAt: cateringEventDate(String(fields.get("expiresAt"))),
        firstOrderOnly: fields.get("firstOrderOnly") === "on", active: fields.get("active") === "on", ...(initial ? { version: initial.version } : {}) };
      const value = await request<CouponRecord>("/api/admin/coupons", initial ? "PATCH" : "POST", input);
      if (alive.current) saved(value);
    } catch (failure) { setError((failure as Error).message); setBusy(false); }
  }
  return <form className="form-stack" onSubmit={submit}>
    <fieldset className="coupon-fields" disabled={busy}>
      <label>Coupon code<input name="code" defaultValue={initial?.code || ""} readOnly={!!initial} required minLength={3} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,29}" autoCapitalize="characters" /></label>
      <label>Offer description<input name="description" defaultValue={initial?.description || ""} required minLength={5} maxLength={180} /></label>
      <div className="coupon-form-row"><label>Discount type<select value={type} onChange={event => setType(event.target.value as typeof type)}><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount</option></select></label>
        <label>{type === "PERCENT" ? "Discount (%)" : "Discount (₹)"}<input key={type} name="value" type="number" min={1} max={type === "PERCENT" ? 100 : 10000} step={type === "PERCENT" ? 1 : 0.01} defaultValue={initial?.type === type ? initial.value / (type === "FIXED" ? 100 : 1) : 10} required /></label></div>
      <div className="coupon-form-row"><label>Minimum item total (₹)<input name="minimum" type="number" min={0} max={100000} step="0.01" defaultValue={(initial?.minSubtotalPaise ?? 39900) / 100} required /></label>
        <label>Maximum discount (₹)<input name="maximum" type="number" min={1} max={10000} step="0.01" defaultValue={(initial?.maxDiscountPaise ?? 15000) / 100} required /></label></div>
      <div className="coupon-form-row"><label>Starts at (IST)<input name="startsAt" type="datetime-local" defaultValue={cateringLocalDate(initial ? new Date(initial.startsAt) : new Date())} required /></label>
        <label>Expires at (IST)<input name="expiresAt" type="datetime-local" defaultValue={cateringLocalDate(initial ? new Date(initial.expiresAt) : new Date(Date.now() + 30 * 86400000))} required /></label></div>
      <label className="check-label"><input name="firstOrderOnly" type="checkbox" defaultChecked={initial?.firstOrderOnly || false} />First paid order only</label>
      <label className="check-label"><input name="active" type="checkbox" defaultChecked={initial?.active ?? true} />Enabled during the selected dates</label>
      <p className="muted">Switch off to pause this offer. Customers see enabled offers in Rewards when their start date arrives.</p>
    </fieldset>
    {error && <ErrorNotice message={error} />}
    <div className="coupon-form-row"><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save coupon"}</button></div>
  </form>;
}
