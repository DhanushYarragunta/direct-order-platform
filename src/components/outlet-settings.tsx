"use client";
import { useState } from "react";
import { request, useResource } from "@/lib/client";
import type { Outlet } from "@/lib/types";
import { money } from "@/lib/domain";
import { ErrorNotice, Modal } from "./ui";
import { useApp } from "./provider";

type ManagedOutlet = Outlet & { activeStations: number; updatedAt: string };
export function OutletSettings({ onSaved }: { onSaved: () => Promise<void> }) {
  const app = useApp(), resource = useResource<{ outlets: ManagedOutlet[] }>("/api/admin/outlets");
  const [editing, setEditing] = useState<ManagedOutlet | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await request("/api/admin/outlets", "PATCH", {
        outletId: editing.id, expectedUpdatedAt: editing.updatedAt,
        fssai: String(form.get("fssai")), fssaiVerified: verified,
        verificationNote: String(form.get("verificationNote") || ""),
        deliveryFeePaise: Math.round(Number(form.get("fee")) * 100),
        minDeliveryPaise: Math.round(Number(form.get("minimum")) * 100),
        freeDeliveryAbovePaise: Math.round(Number(form.get("free")) * 100),
        minPrepMinutes: Number(form.get("prep")), activeStations: Number(form.get("stations")),
        radiusKm: Number(form.get("radius")), open: form.get("open") === "on",
      });
      setEditing(null);
      await Promise.all([resource.refresh(), onSaved()]);
      app.setToast("Outlet settings saved. Customer quotes will use the updated policy.");
    } catch (e) { setError((e as Error).message); await resource.refresh(); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Outlet policies and licences">
    <h2>Outlet policies & licences</h2>
    <p>Configure delivery charges and kitchen capacity. Licence checks are recorded by your administrator; the app does not verify with FSSAI.</p>
    {resource.error && <ErrorNotice message={resource.error} retry={resource.refresh} />}
    <div className="form-two">
      {resource.data?.outlets.map((outlet) => <div className="panel" key={outlet.id}>
        <h3>{outlet.name}</h3>
        <p>{outlet.fssaiVerified ? "Licence checked by administrator" : "Demo / unchecked licence"}: {outlet.fssai}</p>
        <p>{money(outlet.deliveryFeePaise)} delivery · minimum {money(outlet.minDeliveryPaise)} · free from {money(outlet.freeDeliveryAbovePaise)}</p>
        <button type="button" className="button secondary" onClick={() => { setEditing(outlet); setVerified(outlet.fssaiVerified); setError(""); }}>Edit {outlet.name} settings</button>
      </div>)}
    </div>
    <Modal open={!!editing} onClose={() => { if (!busy) setEditing(null); }} title={`Outlet settings · ${editing?.name || ""}`} description="Changes apply to new checkout quotes. Existing paid orders retain their prices and promises.">
      {editing && <form key={editing.updatedAt} className="form-stack" onSubmit={save}>
        <label>FSSAI licence number<input name="fssai" inputMode="numeric" pattern="[0-9]{14}" minLength={14} maxLength={14} defaultValue={editing.fssai} required /></label>
        <label className="reward-toggle"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /><span>I checked this outlet’s licence against its current official record.</span></label>
        <p>Zero-prefixed demo numbers cannot be marked checked. Checking the box records your declaration; it is not automated external verification.</p>
        {verified && <label>Licence verification record<textarea name="verificationNote" minLength={10} maxLength={300} required placeholder="Date checked and reference to the official licence record" /></label>}
        <div className="form-two">
          <label>Delivery fee (₹, incl. GST)<input name="fee" type="number" min="0" max="1000" step="0.01" defaultValue={editing.deliveryFeePaise / 100} required /></label>
          <label>Minimum delivery item total (₹)<input name="minimum" type="number" min="0" max="10000" step="0.01" defaultValue={editing.minDeliveryPaise / 100} required /></label>
          <label>Free delivery from (₹)<input name="free" type="number" min="0" max="10000" step="0.01" defaultValue={editing.freeDeliveryAbovePaise / 100} required /></label>
          <label>Minimum preparation (minutes)<input name="prep" type="number" min="5" max="180" step="1" defaultValue={editing.minPrepMinutes} required /></label>
          <label>Active preparation stations<input name="stations" type="number" min="1" max="100" step="1" defaultValue={editing.activeStations} required /></label>
          <label>Delivery radius (km)<input name="radius" type="number" min="0.1" max="50" step="0.1" defaultValue={editing.radiusKm} required /></label>
        </div>
        <p>Minimum and free-delivery thresholds use item totals before discounts. A zero fee makes eligible delivery free.</p>
        <label className="reward-toggle"><input name="open" type="checkbox" defaultChecked={editing.open} /><span>Outlet is open for new orders</span></label>
        {error && <ErrorNotice message={error} />}
        <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save outlet settings"}</button>
      </form>}
    </Modal>
  </section>;
}
