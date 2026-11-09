"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed, ChevronDown, ArrowRight, Home, BriefcaseBusiness, Check } from "lucide-react";
import { placeSelection, type LocationSuggestion } from "@/lib/profile-types";
import { useApp } from "./provider";
import { AddressSearch } from "./address-search";
import { AddressEditor } from "./address-editor";
import { ErrorNotice, Modal } from "./ui";
import "./profile.css";

export function DeliveryLocationButton() {
  const app = useApp(), selected = app.deliveryLocation;
  return <button type="button" className="delivery-header-button" onClick={() => app.setLocationOpen(true)} aria-label="Change delivery location">
    <MapPin size={19} aria-hidden="true" /><span><small>DELIVER TO</small>
      <strong>{selected ? `${selected.label}${selected.addressId ? ` · ${selected.area}` : ""}` : "Choose your location"}</strong></span>
    <ChevronDown size={16} aria-hidden="true" />
  </button>;
}
export function DeliveryLocationDialog() {
  const app = useApp();
  return <Modal open={app.locationOpen} onClose={() => app.setLocationOpen(false)} title="Where should we deliver?"
    description="Search an area, building or landmark. Your saved addresses are always here.">
    {app.locationOpen && <LocationContent />}
  </Modal>;
}
function LocationContent() {
  const app = useApp();
  const [candidate, setCandidate] = useState<LocationSuggestion | null>(null);
  const [editing, setEditing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const gpsAttempt = useRef(0);
  useEffect(() => () => { gpsAttempt.current += 1; }, []);
  function abandonGps() { gpsAttempt.current += 1; setLocating(false); }
  const addresses = app.profile.data?.addresses || [];
  function locate() {
    setError("");
    if (!navigator.geolocation) { setError("Location is unavailable. Search for your address above."); return; }
    setLocating(true);
    const attempt = ++gpsAttempt.current;
    navigator.geolocation.getCurrentPosition(position => {
      if (attempt !== gpsAttempt.current) return;
      setCandidate({ id: "device-location", name: "Current location", address: "Current GPS location", city: "", pincode: "",
        latitude: position.coords.latitude, longitude: position.coords.longitude, kind: "place" });
      setLocating(false);
    }, () => { if (attempt !== gpsAttempt.current) return; setError("We couldn't read your location. Search for your area or landmark instead."); setLocating(false); }, { timeout: 10000 });
  }
  if (editing && candidate) return <AddressEditor location={candidate} onCancel={() => setEditing(false)}
    onSaved={address => { app.selectSavedAddress(address.id); app.setLocationOpen(false); }} />;
  return <div className="location-content">
    <AddressSearch onSelect={place => { abandonGps(); setCandidate(place); setError(""); }} onQueryChange={() => { abandonGps(); setCandidate(null); }} />
    <button type="button" className="location-gps-button" onClick={locate} disabled={locating}><LocateFixed size={19} />
      <span><strong>{locating ? "Finding your location…" : "Use current location"}</strong><small>Only when you are at the delivery address</small></span></button>
    {candidate && <div className="location-preview"><div className="chosen-place"><MapPin size={21} />
      <div><strong>{candidate.name}</strong><p>{candidate.address}</p>{candidate.kind === "area" && <small>Area centre · add your complete street address at checkout.</small>}</div></div>
      <div className="profile-form-actions">{app.user?.role === "CUSTOMER" && <button type="button" className="button secondary" onClick={() => setEditing(true)}>Save an address here</button>}
        <button type="button" className="button primary" onClick={() => { app.selectDeliveryLocation(placeSelection(candidate)); app.setLocationOpen(false); }}>Use this location <ArrowRight size={16} /></button></div>
    </div>}
    {error && <ErrorNotice message={error} />}
    {app.profile.error && app.user && <ErrorNotice message="Saved addresses could not be refreshed." retry={app.profile.refresh} />}
    {!!addresses.length && <section className="saved-location-list" aria-label="Choose a saved address"><h3>Your saved addresses</h3>
      {addresses.map(address => { const Icon = address.label === "Home" ? Home : address.label === "Work" ? BriefcaseBusiness : MapPin;
        return <button key={address.id} type="button" onClick={() => { app.selectSavedAddress(address.id); app.setLocationOpen(false); }}>
          <Icon size={22} /><span><strong>{address.label} {address.isDefault && <em>Default</em>}</strong><small>{address.addressLine}, {address.area}</small></span>
          {app.deliveryLocation?.addressId === address.id && <Check size={18} />}</button>; })}
    </section>}
    {!app.user && app.authReady && <p className="location-signin"><Link href="/login?next=/profile" onClick={() => app.setLocationOpen(false)}>Sign in</Link> to save an address for next time.</p>}
    {app.user?.role === "CUSTOMER" && <Link className="text-button location-manage" href="/profile#addresses" onClick={() => app.setLocationOpen(false)}>Manage saved addresses <ArrowRight size={15} /></Link>}
  </div>;
}
