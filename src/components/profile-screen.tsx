"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, ChevronRight, CircleHelp, Gift, Home, LogOut, Mail, MapPin, Pencil, Phone, Plus, ReceiptText, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { request } from "@/lib/client";
import type { CustomerProfile, SavedAddress } from "@/lib/profile-types";
import { useApp } from "./provider";
import { AddressEditor } from "./address-editor";
import { Empty, ErrorNotice, Loading, Modal } from "./ui";
import "./profile.css";

export function ProfileScreen() {
  const app = useApp();
  if (!app.authReady) return <Loading />;
  if (!app.user) return <div className="page"><Empty title="Your favourites deserve a familiar address">
    <p>Sign in to manage your details and save delivery addresses.</p>
    <Link className="button primary" href="/login?next=/profile">Sign in to your profile <ArrowRight size={17} /></Link>
  </Empty></div>;
  if (!app.profile.data) return <div className="page profile-page">{app.profile.error
    ? <ErrorNotice message={app.profile.error} retry={app.profile.refresh} /> : <Loading />}</div>;
  return <ProfileContent key={app.profile.data.id} profile={app.profile.data} />;
}
function ProfileContent({ profile }: { profile: CustomerProfile }) {
  const app = useApp();
  const [name, setName] = useState(profile.name), [phone, setPhone] = useState(profile.phone || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [editor, setEditor] = useState<SavedAddress | "new" | null>(null);
  const [deleting, setDeleting] = useState<SavedAddress | null>(null);
  const customer = profile.role === "CUSTOMER";
  const defaultAddress = profile.addresses.find(address => address.isDefault);
  function openProfileDetails() {
    setName(profile.name); setPhone(profile.phone || ""); setError(""); setNotice(""); setEditingProfile(true);
  }
  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy("profile"); setError(""); setNotice("");
    try {
      const value = await request<CustomerProfile>("/api/account/profile", "PATCH", { name: name.trim(), phone: phone.trim() || null });
      app.profile.mutate(value);
      setName(value.name); setPhone(value.phone || "");
      setNotice("Your details are saved. We'll fill them in at checkout.");
      setEditingProfile(false);
      await app.profile.refresh();
      await app.refreshUser().catch(() => {});
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  }
  async function makeDefault(address: SavedAddress) {
    if (busy) return; setBusy(address.id); setError("");
    try {
      const saved = await request<SavedAddress>(`/api/account/addresses/${address.id}`, "PATCH", { isDefault: true });
      app.adoptSavedAddress(saved);
      await app.profile.refresh(); app.selectSavedAddress(address.id); app.setToast(`${address.label} is now your default address`);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  }
  async function deleteAddress() {
    if (!deleting || busy) return; setBusy(deleting.id); setError("");
    try { await request(`/api/account/addresses/${deleting.id}`, "DELETE", {}); app.forgetSavedAddress(deleting.id); setDeleting(null); await app.profile.refresh(); app.setToast("Address removed"); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(""); }
  }
  async function signOut() {
    if (busy) return; setBusy("logout"); setError("");
    try { await request("/api/auth/logout", "POST", {}); window.location.assign("/"); }
    catch (error) { setError((error as Error).message); setBusy(""); }
  }
  return <div className="page profile-page">
    <div className="profile-page-heading"><div><Link className="profile-back" href="/" aria-label="Back to menu"><ArrowLeft size={20} /></Link><h1>Your profile</h1></div>
      <Link className="profile-help-link" href="/help"><CircleHelp size={17} />Help</Link></div>
    <section className="profile-hero" aria-label="Your account overview">
      <div className="profile-identity"><span className="profile-avatar" aria-hidden="true">{profile.name.charAt(0).toUpperCase()}</span>
        <div className="profile-identity-details"><span className="profile-member">{customer ? "YOUR DECCAN ACCOUNT" : `${profile.role} ACCOUNT`}</span>
          <h2>{profile.name}</h2>
          <div className="profile-identity-contact">{profile.phone && <span><Phone size={14} />{profile.phone}</span>}<span><Mail size={14} />{profile.email}</span></div>
          <button className="profile-edit-trigger" type="button" disabled={!!busy} onClick={openProfileDetails}>{customer ? "Edit profile" : "View details"}<ChevronRight size={17} /></button>
        </div>
      </div>
      {customer ? defaultAddress
        ? <a className="profile-default-line" href="#addresses"><span className="profile-default-icon"><MapPin size={22} /></span><span><small>YOUR DEFAULT DELIVERY ADDRESS</small><strong>{defaultAddress.label}<span> · {defaultAddress.area}</span></strong><p>{defaultAddress.addressLine}</p></span><ChevronRight size={20} /></a>
        : <button className="profile-default-line" type="button" disabled={!!busy} onClick={() => setEditor("new")}><span className="profile-default-icon"><MapPin size={22} /></span><span><small>MAKE YOURSELF AT HOME</small><strong>Save your delivery address</strong><p>Ready for every order, whenever you're hungry.</p></span><Plus size={20} /></button>
        : <Link className="profile-default-line" href="/workspace"><span className="profile-default-icon"><BriefcaseBusiness size={22} /></span><span><small>YOUR RESTAURANT</small><strong>Open your workspace</strong><p>Everything you need for your next service.</p></span><ChevronRight size={20} /></Link>}
    </section>
    {app.profile.error && <ErrorNotice message="Your latest profile could not be refreshed. Your saved changes are safe." retry={app.profile.refresh} />}
    {error && !editingProfile && !deleting && <ErrorNotice message={error} />}
    {notice && <p className="profile-success" role="status"><Check size={18} />{notice}</p>}
    <div className="profile-layout">
      <nav className="profile-nav" aria-label="Profile navigation">
        <div className={`profile-shortcuts${customer ? "" : " profile-shortcuts-staff"}`}>
          {customer && <a href="#addresses" aria-label="Saved addresses"><span><MapPin size={23} /></span><strong>Saved addresses</strong><small>{profile.addresses.length ? `${profile.addresses.length} saved` : "Add your doorstep"}</small></a>}
          <Link href={customer ? "/orders" : "/workspace"} aria-label={customer ? "My orders" : "Restaurant workspace"}><span><ReceiptText size={23} /></span><strong>{customer ? "My orders" : "Workspace"}</strong><small>{customer ? "Track & reorder" : "Manage your service"}</small></Link>
          {customer && <Link href="/orders#rewards" aria-label="Deccan rewards"><span><Gift size={23} /></span><strong>Rewards</strong><small>Your points & offers</small></Link>}
          <Link href="/help" aria-label="Help & refunds"><span><CircleHelp size={23} /></span><strong>Help & refunds</strong><small>We're here for you</small></Link>
        </div>
        <section className="profile-link-group" aria-labelledby="profile-account-heading"><h2 id="profile-account-heading">Your account</h2>
          <button type="button" aria-label="Personal details" disabled={!!busy} onClick={openProfileDetails}><span className="profile-link-icon"><UserRound size={20} /></span><span><strong>Personal details</strong><small>{customer ? "Name, mobile number & email" : "View your restaurant account"}</small></span><ChevronRight size={18} /></button>
          <Link href="/privacy" aria-label="Privacy & account"><span className="profile-link-icon"><ShieldCheck size={20} /></span><span><strong>Privacy & account</strong><small>Your information, in your control</small></span><ChevronRight size={18} /></Link>
          <button className="profile-signout" type="button" onClick={signOut} disabled={!!busy}><span className="profile-link-icon"><LogOut size={20} /></span><span><strong>{busy === "logout" ? "Signing out…" : "Sign out"}</strong></span><ChevronRight size={18} /></button>
        </section>
        <p className="profile-brand-note">GOOD FOOD. YOUR WAY.<span>Deccan</span></p>
      </nav>
      <div className="profile-main">
        {customer && <section className="profile-panel" id="addresses" aria-labelledby="saved-addresses-heading">
          <div className="profile-section-heading"><div><span className="profile-section-icon"><MapPin size={21} /></span><h2 id="saved-addresses-heading">Saved addresses</h2><p>{defaultAddress ? `We'll start with ${defaultAddress.label.toLowerCase()} next time you order.` : "Keep your doorstep ready for your next order."}</p></div>
            <button className="button secondary" type="button" disabled={profile.addresses.length >= 10 || !!busy} onClick={() => setEditor("new")}><Plus size={18} />Add address</button></div>
          {!profile.addresses.length ? <div className="addresses-empty"><span><Home size={31} /></span><h3>A home for your next delivery</h3><p>Search your location, add your house details and save it. No more typing it all again.</p>
            <button type="button" className="button primary" onClick={() => setEditor("new")}><Plus size={17} />Save your first address</button></div>
          : <div className="profile-address-grid">{profile.addresses.map(address => { const Icon = address.label === "Home" ? Home : address.label === "Work" ? BriefcaseBusiness : MapPin;
            return <article className={`profile-address-card ${address.isDefault ? "default" : ""}`} key={address.id} aria-label={`${address.label} address`}>
              <div className="address-card-heading"><Icon size={23} /><h3>{address.label}</h3>{address.isDefault && <span className="profile-status verified"><Check size={13} />Default</span>}</div>
              <strong>{address.recipientName}</strong><p>{address.addressLine}<br />{address.area}{address.pincode && !address.area.includes(address.pincode) ? ` · ${address.pincode}` : ""}</p>
              <span className="address-phone"><Phone size={14} />{address.phone}</span>
              <div className="address-card-actions"><button type="button" className="text-button" disabled={!!busy} onClick={() => setEditor(address)}><Pencil size={15} />Edit</button>
                <button type="button" className="text-button" disabled={!!busy} onClick={() => { setError(""); setDeleting(address); }}><Trash2 size={15} />Remove</button>
                {!address.isDefault && <button type="button" className="text-button" disabled={!!busy} onClick={() => void makeDefault(address)}>Set as default</button>}</div>
            </article>; })}</div>}
          {profile.addresses.length >= 10 && <p className="profile-contact-note">You have 10 saved addresses. Remove one to add another.</p>}
        </section>}
        {!customer && <section className="profile-panel profile-staff-card"><span className="profile-section-icon"><BriefcaseBusiness size={25} /></span><h2>Your restaurant, ready for service.</h2><p>Head to your workspace for restaurant orders and operations.</p><Link href="/workspace" className="button primary">Open workspace<ArrowRight size={17} /></Link></section>}
      </div>
    </div>
    <Modal open={editingProfile} onClose={() => { if (!busy) setEditingProfile(false); }} title={customer ? "Edit profile" : "Account details"} description={customer ? "Save your details once. We'll remember them at checkout." : "Your restaurant account details."}>
      <form className="form-stack profile-details-form" onSubmit={saveProfile}>
        {error && <ErrorNotice message={error} />}
        <div className="profile-form-row"><label>Full name<input value={name} onChange={event => { setName(event.target.value); setNotice(""); }} autoComplete="name"
          required minLength={2} maxLength={70} disabled={!customer || !!busy} /></label>
          <label>Mobile number<input type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={event => { setPhone(event.target.value); setNotice(""); }}
            maxLength={20} placeholder="Add your mobile number" disabled={!customer || !!busy} /></label></div>
        <div className="profile-email-row"><Mail size={19} /><div><span>Email address</span><strong>{profile.email}</strong></div>
          <span className={`profile-status ${profile.emailVerifiedAt ? "verified" : ""}`}>{profile.emailVerifiedAt ? <><Check size={13} />Verified</> : "Not verified"}</span></div>
        {profile.phone && <p className="profile-contact-note"><Phone size={15} />{profile.phoneVerifiedAt ? "Your mobile number is verified." : "Your saved number fills checkout. SMS verification is separate."}</p>}
        <div className="profile-form-actions"><button type="button" className="button secondary" disabled={!!busy} onClick={() => setEditingProfile(false)}>{customer ? "Cancel" : "Done"}</button>
          {customer && <button className="button primary" disabled={!!busy || (name === profile.name && phone === (profile.phone || ""))}>{busy === "profile" ? "Saving…" : "Save details"}<Check size={16} /></button>}</div>
      </form>
    </Modal>
    <Modal open={!!editor} onClose={() => setEditor(null)} title={editor === "new" ? "Add a delivery address" : "Edit delivery address"} description="Find the location, then add your doorstep details.">
      {editor && <AddressEditor key={editor === "new" ? "new" : editor.id} initial={editor === "new" ? undefined : editor}
        onCancel={() => setEditor(null)} onSaved={address => { if (address.isDefault) app.selectSavedAddress(address.id); setEditor(null); }} />}
    </Modal>
    <Modal open={!!deleting} onClose={() => { if (!busy) setDeleting(null); }} title="Remove this address?" description="You can add it again whenever you need it.">
      <div className="form-stack"><p>{deleting?.addressLine}, {deleting?.area}</p>{deleting?.isDefault && <p>Your next saved address will become the default.</p>}
        {error && <ErrorNotice message={error} />}<div className="profile-form-actions"><button type="button" className="button secondary" disabled={!!busy} onClick={() => setDeleting(null)}>Keep address</button>
          <button type="button" className="button danger" disabled={!!busy} onClick={() => void deleteAddress()}>{busy ? "Removing…" : "Remove address"}</button></div></div>
    </Modal>
  </div>;
}
