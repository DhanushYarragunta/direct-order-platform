"use client";
import { useState } from "react";
import type { BusinessTargets } from "@/lib/business-targets";
import { request } from "@/lib/client";
import { ErrorNotice } from "./ui";

const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : "Awaiting data";
const date = (value: string) => new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
export function BusinessTargetPanel({ targets, outletId, canEdit, refresh }: {
  targets: BusinessTargets; outletId: string; canEdit: boolean; refresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    setBusy(true); setError("");
    try {
      await request("/api/staff/baselines", "POST", {
        outletId,
        periodStart: new Date(`${data.get("start")}T00:00:00+05:30`).toISOString(),
        periodEnd: new Date(Date.parse(`${data.get("end")}T00:00:00+05:30`) + 86400000).toISOString(),
        appOrders: Number(data.get("appOrders")), source: data.get("source"),
      });
      form.reset(); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const timing = targets.checkout;
  return <section className="panel report-panel business-targets">
    <div className="section-heading"><div><p className="eyebrow">MEASURE THE BRIEF</p><h2>Business targets</h2></div></div>
    {targets.demo && <p className="target-demo">Demo data and simulated payments. These numbers do not prove production adoption or human checkout speed.</p>}
    <div className="target-copy">
      <h3>Checkout median · target under 60 seconds</h3>
      <p><strong>{timing.medianMs === null ? "Awaiting timed checkouts" : `${(timing.medianMs / 1000).toFixed(1)} seconds`}</strong> · {timing.samples} paid samples · {pct(timing.under60, timing.samples)} under 60 seconds{timing.p95Ms !== null && ` · p95 ${(timing.p95Ms / 1000).toFixed(1)} seconds`}</p>
      <p>From the first visible cart (checkout entry when opened directly) to successful payment, including sign-in and retries. Uses the browser’s start timestamp and server’s payment time; invalid or absent timings are excluded. Run observed human sessions to validate usability.</p>
      <h3>30-day customer retention · target 35% by month 6</h3>
      <p>Monthly cohorts use each customer’s first paid direct order in the selected kitchen scope. A return is another paid order within the next 30 days. Only customers with a full 30-day observation window enter the rate; recent customers stay pending. All kitchens follows customers across outlets.</p>
    </div>
    <div className="table-scroll"><table><thead><tr><th>First-order month (IST)</th><th>Eligible customers</th><th>Returned in 30 days</th><th>Retention</th><th>Still observing</th></tr></thead><tbody>
      {targets.retention.map(c => <tr key={c.month}><td>{c.month}</td><td>{c.eligible}</td><td>{c.returned}</td><td>{pct(c.returned, c.eligible)}</td><td>{c.pending}</td></tr>)}
      {!targets.retention.length && <tr><td colSpan={5}>No paid customer cohorts yet.</td></tr>}
    </tbody></table></div>
    <div className="target-copy"><h3>Direct orders / delivery-app orders · target 12% by month 9</h3><p>Enter aggregate app-order counts from existing business reports for matching completed periods. Each comparison uses paid direct orders in that exact period and kitchen. No delivery-app integration or customer data import is needed. Periods include both dates in IST; refunds are excluded from direct counts.</p></div>
    <div className="table-scroll"><table><thead><tr><th>Kitchen / period</th><th>Direct orders</th><th>App orders</th><th>Direct / app</th><th>Baseline source</th></tr></thead><tbody>
      {targets.baselines.map(b => <tr key={b.id}><td>{b.outletId}<small>{date(b.periodStart)} – {date(new Date(Date.parse(b.periodEnd) - 1).toISOString())}</small></td><td>{b.directOrders}</td><td>{b.appOrders}</td><td>{pct(b.directOrders, b.appOrders)}</td><td>{b.source}</td></tr>)}
      {!targets.baselines.length && <tr><td colSpan={5}>Awaiting an app-order baseline. A percentage cannot be calculated yet.</td></tr>}
    </tbody></table></div>
    {canEdit && (outletId === "all" ? <p className="target-copy">Select one kitchen above to record its baseline.</p> : <form className="target-baseline-form" onSubmit={submit}>
      <h3>Record or replace a baseline</h3>
      <label>First date<input name="start" type="date" required /></label>
      <label>Last date (inclusive)<input name="end" type="date" required /></label>
      <label>App orders<input name="appOrders" type="number" min={1} max={10000000} required /></label>
      <label>Source report<input name="source" minLength={5} maxLength={160} placeholder="Monthly channel totals, October 2026" required /></label>
      <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save baseline"}</button>
      {error && <ErrorNotice message={error} />}
    </form>)}
  </section>;
}
