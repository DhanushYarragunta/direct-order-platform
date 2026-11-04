"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ChefHat, Clock3, IndianRupee, RefreshCw, ShoppingBag, Users } from "lucide-react";
import type { AnalyticsData } from "@/lib/analytics";
import { useResource } from "@/lib/client";
import { money } from "@/lib/domain";
import { useApp } from "./provider";
import { Empty, ErrorNotice, Loading } from "./ui";
import "./analytics.css";

const percent = (n: number, d: number) => d ? `${Math.round(n / d * 100)}%` : "—";
export function AnalyticsScreen() {
  const app = useApp();
  const [selected, setSelected] = useState("all"), [days, setDays] = useState(7);
  const outlet = app.user?.role === "ADMIN" ? selected : app.user?.outletId || "";
  const r = useResource<AnalyticsData>(outlet ? `/api/staff/analytics?outlet=${outlet}&days=${days}` : null);
  const data = r.data, m = data?.summary;
  const highest = Math.max(1, ...(data?.daily.map(d => d.orders) || []));
  return <div className="page analytics-page">
    <div className="page-intro">
      <div><p className="eyebrow">A LITTLE CLARITY FOR A BUSY KITCHEN</p><h1>Welcome back, {app.user?.name.split(" ")[0]}.</h1><p>Orders, service and the customers coming back for more.</p></div>
      <div className="report-controls">
        <label>Kitchen<select aria-label="Report outlet" value={outlet} disabled={app.user?.role !== "ADMIN"} onChange={e => setSelected(e.target.value)}>
          {app.user?.role === "ADMIN" && <option value="all">All kitchens</option>}
          {(data?.outlets || (app.user?.outletId ? [{ id: app.user.outletId, name: app.user.outletId }] : [])).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select></label>
        <label>Period<select aria-label="Report period" value={days} onChange={e => setDays(Number(e.target.value))}><option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></label>
      </div>
    </div>
    {r.error && <ErrorNotice message={r.error} retry={r.refresh} />}
    {r.loading ? <Loading /> : m && data ? <>
      <div className="metric-grid">
        {[
          { label: "Direct sales", value: money(m.revenuePaise), detail: `${m.paidOrders} paid orders · GST included`, icon: IndianRupee },
          { label: "Orders received", value: m.orders, detail: `${m.active} active in this period`, icon: ShoppingBag },
          { label: "Average prep time", value: m.averagePrepMinutes === null ? "—" : `${m.averagePrepMinutes} min`, detail: `${m.prepared} completed preparations`, icon: Clock3 },
          { label: "Repeat customers", value: percent(m.repeatCustomers, m.customers), detail: `${m.repeatCustomers} of ${m.customers} customers ordered twice or more`, icon: Users },
        ].map(({ label, value, detail, icon: Icon }) => <section className="metric-card" key={label}><div><span>{label}</span><Icon size={20} /></div><strong>{value}</strong><small>{detail}</small></section>)}
      </div>
      <div className="workspace-banner"><span className="workspace-banner-icon"><ChefHat size={32} /></span><div><p className="eyebrow">SERVICE, IN SYNC</p><h2>Every order. A little more care.</h2><p>Keep service moving with live tickets and clear preparation promises.</p></div><Link className="button primary" href="/kitchen">Open kitchen display <ArrowUpRight size={18} /></Link></div>
      <section className="panel report-panel">
        <div className="section-heading"><div><p className="eyebrow">THE BIG PICTURE</p><h2>Kitchen performance</h2></div><button className="button secondary" onClick={r.refresh}><RefreshCw size={15} /> Refresh</button></div>
        <div className="table-scroll"><table><thead><tr><th>Kitchen</th><th>Orders</th><th>Sales</th><th>Avg. prep</th><th>Cancelled</th><th>Repeat customers</th></tr></thead><tbody>{data.byOutlet.map(o => <tr key={o.id}><td><strong>{o.name}</strong></td><td>{o.orders}</td><td>{money(o.revenuePaise)}</td><td>{o.averagePrepMinutes === null ? "—" : `${o.averagePrepMinutes} min`}</td><td>{o.cancelled}</td><td>{percent(o.repeatCustomers, o.customers)}<small>{o.repeatCustomers} of {o.customers}</small></td></tr>)}</tbody></table></div>
        <p className="report-definition">Repeat customers placed at least two paid orders in the selected period. Outlet rows count repeat visits to that kitchen; the combined figure counts across kitchens. Cancelled orders were refunded; {m.expired} unpaid or expired checkouts are reported separately.</p>
      </section>
      <section className="panel report-panel"><div className="section-heading"><div><p className="eyebrow">DAY BY DAY</p><h2>Order activity</h2></div><span className="muted">India Standard Time</span></div>
        {data.daily.length ? <div className="report-bars">{data.daily.map(d => <div className="report-bar-row" key={d.date}><time dateTime={d.date}>{new Date(`${d.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</time><div className="report-bar-track"><div style={{ width: `${d.orders / highest * 100}%` }} /></div><strong>{d.orders}<span> orders</span></strong></div>)}</div> : <Empty title="Ready for your first order"><p>Activity will appear here as customers order directly.</p></Empty>}
        <p className="report-definition">Includes all submitted orders in the rolling {days === 1 ? "24-hour" : `${days}-day`} window, with no record cap. Empty dates are omitted. Preparation runs from payment confirmation to ready; older sample orders use their placed time. Updated {new Date(data.until).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST.</p>
      </section>
    </> : null}
  </div>;
}
