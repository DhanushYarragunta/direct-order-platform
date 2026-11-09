"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin, Home, BriefcaseBusiness, Check } from "lucide-react";
import { request } from "@/lib/client";
import { fullDeliveryAddress, type LocationSuggestion, type SavedAddress } from "@/lib/profile-types";
import { AddressSearch } from "./address-search";
import { useApp } from "./provider";
import { ErrorNotice } from "./ui";

export function AddressEditor({ initial, location, onSaved, onCancel }: {
  initial?: SavedAddress; location?: LocationSuggestion; onSaved: (address: SavedAddress) => void; onCancel: () => void;
}) {
  const app = useApp();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [place, setPlace] = useState<LocationSuggestion | null>(location || (initial ? {
    id: initial.id, name: initial.area, address: initial.area, city: initial.city, pincode: initial.pincode,
    latitude: initial.latitude, longitude: initial.longitude, localityId: initial.localityId || undefined,
    kind: initial.locationKind,
  } : null));
  const [label, setLabel] = useState<SavedAddress["label"]>(initial?.label || "Home");
  const [addressLine, setAddressLine] = useState(initial?.addressLine || "");
  const [recipientName, setRecipientName] = useState(initial?.recipientName || app.profile.data?.name || app.user?.name || "");
  const [phone, setPhone] = useState(initial?.phone || app.profile.data?.phone || "");
  const [city, setCity] = useState(initial?.city || location?.city || "");
  const [pincode, setPincode] = useState(initial?.pincode || location?.pincode || "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? !app.profile.data?.addresses.length);
  const [confirmed, setConfirmed] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!place || !confirmed || busy) return;
    setBusy(true); setError("");
    try {
      const values = { label, addressLine: addressLine.trim(), recipientName: recipientName.trim(), phone,
        area: place.address, city: city.trim(), pincode, latitude: place.latitude, longitude: place.longitude,
        localityId: place.localityId || null, locationKind: place.kind, isDefault };
      if (fullDeliveryAddress(values).length > 300) throw new Error("Please shorten the address to 300 characters.");
      const saved = await request<SavedAddress>(initial ? `/api/account/addresses/${initial.id}` : "/api/account/addresses",
        initial ? "PATCH" : "POST", values);
      app.adoptSavedAddress(saved);
      await app.profile.refresh();
      app.setToast(initial ? "Address updated" : "Address saved for next time");
      // A dismissed editor must not close a newer dialog or replace a newer selection.
      if (mounted.current) onSaved(saved);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <form className="address-editor form-stack" onSubmit={save}>
    {place ? <div className="chosen-place">
      <MapPin size={21} aria-hidden="true" />
      <div><strong>{place.name}</strong><p>{place.address}</p>
        {place.kind === "area" && <small>This is an area centre. Check that it matches your delivery neighbourhood.</small>}
      </div>
      <button type="button" className="text-button" disabled={busy} onClick={() => { setPlace(null); setConfirmed(false); }}>Change</button>
    </div> : <AddressSearch onSelect={(value) => { setPlace(value); setCity(value.city); setPincode(value.pincode); setConfirmed(false); }} />}
    <label>Flat / house, building and street
      <input value={addressLine} onChange={event => setAddressLine(event.target.value)} autoComplete="address-line1"
        required minLength={5} maxLength={120} placeholder="Flat 302, Lakeview Apartments, 4th Street" disabled={busy} />
    </label>
    <div className="profile-form-row">
      <label>City<input value={city} onChange={event => setCity(event.target.value)} autoComplete="address-level2" required minLength={2} maxLength={50} disabled={busy} /></label>
      <label>Pincode <span className="muted">(optional)</span><input value={pincode} onChange={event => setPincode(event.target.value)} inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" maxLength={6} disabled={busy} /></label>
    </div>
    <div className="profile-form-row">
      <label>Recipient name<input value={recipientName} onChange={event => setRecipientName(event.target.value)}
        autoComplete="name" required minLength={2} maxLength={70} disabled={busy} /></label>
      <label>Recipient mobile number<input type="tel" inputMode="tel" autoComplete="tel-national" value={phone}
        onChange={event => setPhone(event.target.value)} required maxLength={20} placeholder="10-digit mobile number" disabled={busy} /></label>
    </div>
    <fieldset className="address-labels"><legend>Save address as</legend>
      {([{ name: "Home", icon: Home }, { name: "Work", icon: BriefcaseBusiness }, { name: "Other", icon: MapPin }] as const).map(({ name, icon: Icon }) =>
        <label key={name} className={label === name ? "chosen" : ""}><input type="radio" name="address-label" value={name}
          checked={label === name} onChange={() => setLabel(name)} disabled={busy} /><Icon size={17} />{name}</label>)}
    </fieldset>
    <label className="profile-checkbox"><input type="checkbox" checked={isDefault} disabled={busy || initial?.isDefault}
      onChange={event => setIsDefault(event.target.checked)} /><span>Use as my default delivery address</span></label>
    {place && <label className="profile-checkbox"><input type="checkbox" checked={confirmed} required disabled={busy}
      onChange={event => setConfirmed(event.target.checked)} /><span>{place.kind === "area"
        ? "My address is in this area. Delivery coverage will use its centre point."
        : "I have checked the selected location and delivery address."}</span></label>}
    {error && <ErrorNotice message={error} />}
    <div className="profile-form-actions"><button className="button secondary" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      <button className="button primary" disabled={busy || !place || !confirmed}><Check size={17} />{busy ? "Saving…" : "Save address"}</button></div>
  </form>;
}
