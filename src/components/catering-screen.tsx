"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChefHat,
  Clock3,
  MapPin,
  RefreshCw,
  Users,
} from "lucide-react";
import { useApp } from "./provider";
import { Empty, ErrorNotice, Loading, Modal } from "./ui";
import { request, useResource } from "@/lib/client";
import { money } from "@/lib/domain";
import {
  cateringEventDate,
  cateringLocalDate,
  CATERING_STATUSES,
} from "@/lib/catering-validation";
import { AddressSearch } from "./address-search";
import { fullDeliveryAddress } from "@/lib/profile-types";
import type { Outlet } from "@/lib/types";
import "./catering.css";

type CateringRequest = {
  id: string;
  number: string;
  outlet: Outlet;
  status: (typeof CATERING_STATUSES)[number];
  eventAt: string;
  guestCount: number;
  occasion: string;
  contactName: string;
  phone: string;
  address: string;
  menuNotes: string;
  budgetPaise: number | null;
  managerNote: string;
  respondedAt: string | null;
  version: number;
};
type CateringData = {
  requests: CateringRequest[];
  outlets: Outlet[];
  total: number;
  page: number;
  pageSize: number;
};
const labels = {
  REQUESTED: "Awaiting reply",
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};
const eventTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));

function Access({ staff, children }: { staff: boolean; children: ReactNode }) {
  const app = useApp();
  if (!app.authReady) return <Loading />;
  const allowed = staff
    ? app.user && ["ADMIN", "MANAGER"].includes(app.user.role)
    : app.user?.role === "CUSTOMER";
  if (!allowed)
    return (
      <div className="page">
        <Empty
          title={
            staff
              ? "Catering is managed by your team"
              : "Good food brings everyone together."
          }
        >
          <p>
            {staff
              ? "Sign in as an outlet manager or central admin to review party requests."
              : "Sign in with a customer account to plan a party and track your request."}
          </p>
          <Link
            className="button primary"
            href={`/login?next=${staff ? "/workspace/catering" : "/catering"}`}
          >
            {app.user ? "Switch account" : "Sign in"}
            <ArrowRight size={17} />
          </Link>
        </Empty>
      </div>
    );
  return children;
}

function RequestCard({
  value,
  children,
}: {
  value: CateringRequest;
  children?: ReactNode;
}) {
  return (
    <article className="catering-card">
      <div className="catering-card-top">
        <span className="catering-number">{value.number}</span>
        <span
          className={`catering-status catering-status-${value.status.toLowerCase()}`}
        >
          {value.status === "CONFIRMED" && <Check size={13} />}
          {labels[value.status]}
        </span>
      </div>
      <h3>{value.occasion}</h3>
      <div className="catering-facts">
        <span>
          <CalendarDays size={16} />
          {eventTime(value.eventAt)} IST
        </span>
        <span>
          <Users size={16} />
          {value.guestCount} guests
        </span>
        <span>
          <ChefHat size={16} />
          {value.outlet.name}
        </span>
      </div>
      <p className="catering-menu-note">{value.menuNotes}</p>
      <dl className="catering-details">
        <div>
          <dt>Contact</dt>
          <dd>
            {value.contactName} · {value.phone}
          </dd>
        </div>
        <div>
          <dt>Event address</dt>
          <dd>{value.address}</dd>
        </div>
        {value.budgetPaise !== null && (
          <div>
            <dt>Preferred total budget</dt>
            <dd>{money(value.budgetPaise)}</dd>
          </div>
        )}
      </dl>
      {value.managerNote && (
        <div className="catering-response">
          <strong>From the catering manager</strong>
          <p>{value.managerNote}</p>
          {value.respondedAt && (
            <small>{eventTime(value.respondedAt)} IST</small>
          )}
        </div>
      )}
      {children && <div className="catering-card-actions">{children}</div>}
    </article>
  );
}

function Pagination({
  data,
  setPage,
}: {
  data: CateringData | null;
  setPage: (v: number) => void;
}) {
  if (!data || data.total <= data.pageSize) return null;
  const pages = Math.ceil(data.total / data.pageSize);
  return (
    <div className="catering-pagination">
      <button
        className="button secondary"
        disabled={data.page <= 1}
        onClick={() => setPage(data.page - 1)}
      >
        Previous
      </button>
      <span>
        Page {data.page} of {pages}
      </span>
      <button
        className="button secondary"
        disabled={data.page >= pages}
        onClick={() => setPage(data.page + 1)}
      >
        Next
      </button>
    </div>
  );
}

export function CateringScreen() {
  const app = useApp();
  return (
    <Access staff={false}>
      <CustomerCatering key={app.user?.id || "guest"} />
    </Access>
  );
}

function CustomerCatering() {
  const app = useApp();
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [cancel, setCancel] = useState<CateringRequest | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [chosenOutlet, setOutlet] = useState<string | null>(null);
  const outlet = chosenOutlet || app.outletId;
  const [submitted, setSubmitted] = useState("");
  const [contact, setContact] = useState<{ name?: string; phone?: string; address?: string; addressId?: string }>({});
  const addresses = app.profile.data?.addresses || [];
  const savedAddress = contact.addressId === undefined ? addresses.find(address => address.isDefault) : addresses.find(address => address.id === contact.addressId);
  const contactName = contact.name ?? savedAddress?.recipientName ?? app.profile.data?.name ?? app.user?.name ?? "";
  const contactPhone = contact.phone ?? savedAddress?.phone ?? app.profile.data?.phone ?? "";
  const eventAddress = contact.address ?? (savedAddress ? fullDeliveryAddress(savedAddress) : "");
  const idempotency = useRef({ payload: "", key: "" });
  const r = useResource<CateringData>(`/api/catering?page=${page}`);
  useEffect(() => {
    if (r.data) {
      const lastPage = Math.max(1, Math.ceil(r.data.total / r.data.pageSize));
      if (page > lastPage) setPage(lastPage);
    }
  }, [r.data, page]);
  useEffect(() => {
    setEventDate(cateringLocalDate(new Date(Date.now() + 48 * 3600000)));
  }, []);
  useEffect(() => {
    const timer = setInterval(() => void r.refresh(), 15000);
    return () => clearInterval(timer);
  }, [r.refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      fields = new FormData(form);
    setBusy(true);
    setError("");
    setSubmitted("");
    try {
      const input = {
        outletId: outlet,
        eventAt: cateringEventDate(eventDate),
        guestCount: Number(fields.get("guestCount")),
        occasion: String(fields.get("occasion")),
        contactName: String(fields.get("contactName")),
        phone: String(fields.get("phone")),
        address: String(fields.get("address")),
        menuNotes: String(fields.get("menuNotes")),
        budgetPaise: fields.get("budget")
          ? Math.round(Number(fields.get("budget")) * 100)
          : null,
      };
      const payload = JSON.stringify(input);
      if (idempotency.current.payload !== payload)
        idempotency.current = { payload, key: crypto.randomUUID() };
      const saved = await request<CateringRequest>("/api/catering", "POST", {
        ...input,
        requestKey: idempotency.current.key,
      });
      setSubmitted(
        `${saved.number} is with the catering manager. Your request is confirmed only after the manager replies below.`,
      );
      app.setToast("Your party request has been sent");
      form.reset();
      setContact({});
      idempotency.current = { payload: "", key: "" };
      if (page === 1) await r.refresh();
      else setPage(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    if (!cancel) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/catering/${cancel.id}`, "PATCH", {
        version: cancel.version,
      });
      setCancel(null);
      app.setToast("Party request cancelled");
      await r.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page catering-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">A TABLE FULL OF GOOD MEMORIES</p>
          <h1>Feed your gathering.</h1>
          <p>Family celebrations, office lunches, and everything in between.</p>
        </div>
        <span className="catering-notice">
          <Clock3 size={18} />
          At least 24 hours ahead
        </span>
      </div>
      <div className="catering-layout">
        <form className="panel form-stack catering-form" onSubmit={submit}>
          <div>
            <h2>Tell us what you’re planning</h2>
            <p className="catering-help">
              For 10–500 guests. We’ll review your menu, timing and location
              before confirming. No payment is collected here.
            </p>
          </div>
          {submitted && (
            <div className="catering-success" role="status">
              <Check size={18} />
              <span>{submitted}</span>
            </div>
          )}
          <label>
            Occasion
            <input
              name="occasion"
              required
              minLength={3}
              maxLength={80}
              placeholder="Team lunch, birthday, family celebration…"
            />
          </label>
          <div className="catering-form-row">
            <label>
              Event date and time (IST)
              <input
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                min={cateringLocalDate(
                  new Date(Date.now() + 24 * 3600000 + 60000),
                )}
                max={cateringLocalDate(new Date(Date.now() + 180 * 86400000))}
                required
              />
            </label>
            <label>
              Number of guests
              <input
                name="guestCount"
                type="number"
                min={10}
                max={500}
                step={1}
                defaultValue={20}
                required
              />
            </label>
          </div>
          <label>
            Kitchen
            <select
              value={outlet}
              onChange={(e) => setOutlet(e.target.value)}
              required
              aria-label="Catering kitchen"
            >
              {(r.data?.outlets || app.menu.data?.outlets || []).map((o) => (
                <option key={o.id} value={o.id} disabled={!o.open}>
                  {o.name}
                  {!o.open ? " · not accepting requests" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Menu and dietary requirements
            <textarea
              name="menuNotes"
              required
              minLength={10}
              maxLength={1000}
              rows={3}
              placeholder="Dishes, vegetarian portions, allergies and anything else we should know."
            />
          </label>
          <label>
            Preferred total budget (₹) <span className="muted">optional</span>
            <input
              name="budget"
              type="number"
              min={1000}
              max={1000000}
              step={1}
              placeholder="For the whole party"
            />
          </label>
          {app.profile.error && <ErrorNotice message="Saved details could not be loaded. Enter them below or try again." retry={app.profile.refresh} />}
          {!!addresses.length && <label>Use a saved address
            <select value={savedAddress?.id || ""} onChange={event => {
              const address = addresses.find(item => item.id === event.target.value);
              setContact(address ? { addressId: address.id, name: address.recipientName, phone: address.phone, address: fullDeliveryAddress(address) }
                : { name: contactName, phone: contactPhone, addressId: "", address: "" });
            }}><option value="">A different event venue</option>{addresses.map(address => <option key={address.id} value={address.id}>{address.label} · {address.area}</option>)}</select>
          </label>}
          <div className="catering-form-row">
            <label>
              Contact name
              <input
                name="contactName"
                value={contactName}
                onChange={event => setContact(value => ({ ...value, name: event.target.value }))}
                required
                minLength={2}
                maxLength={70}
                autoComplete="name"
              />
            </label>
            <label>
              Mobile number
              <input
                name="phone"
                value={contactPhone}
                onChange={event => setContact(value => ({ ...value, phone: event.target.value }))}
                type="tel"
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                required
                maxLength={10}
                placeholder="10-digit Indian mobile"
                autoComplete="tel-national"
              />
            </label>
          </div>
          <AddressSearch label="Search event location" onSelect={place => setContact(value => ({ ...value, addressId: "", address: place.address }))} />
          <label>
            Event address
            <textarea
              name="address"
              value={eventAddress}
              onChange={event => setContact(value => ({ ...value, address: event.target.value }))}
              required
              minLength={8}
              maxLength={300}
              rows={2}
              placeholder="Venue, street, area and landmark"
              autoComplete="street-address"
            />
          </label>
          <p className="catering-help">
            <MapPin size={15} />
            The manager confirms service to your event address. Your details are
            used to arrange this request.
          </p>
          {error && !cancel && <ErrorNotice message={error} />}
          <button
            className="button primary"
            disabled={
              busy ||
              r.loading ||
              !!r.error ||
              !(r.data?.outlets || []).some((o) => o.id === outlet && o.open)
            }
          >
            {busy ? "Sending request…" : "Send party request"}
            <ArrowRight size={17} />
          </button>
          <small className="catering-help">
            Demo policy: 24 hours’ notice, up to 180 days ahead. These limits
            are assumptions for review.
          </small>
        </form>
        <section className="catering-history" aria-label="Your party requests">
          <div className="catering-section-title">
            <div>
              <h2>Your party requests</h2>
              <p>Manager replies appear here.</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Refresh party requests"
              onClick={() => void r.refresh()}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          {r.error && (
            <ErrorNotice message={r.error} retry={() => void r.refresh()} />
          )}
          {r.loading ? (
            <Loading />
          ) : r.data && r.data.requests.length === 0 ? (
            <div className="panel">
              <Empty title="Something worth celebrating?">
                <p>Your first party request will appear here.</p>
              </Empty>
            </div>
          ) : (
            r.data?.requests.map((value) => (
              <RequestCard key={value.id} value={value}>
                {value.status === "REQUESTED" ? (
                  <button
                    className="text-button"
                    onClick={() => {
                      setError("");
                      setCancel(value);
                    }}
                    disabled={busy}
                  >
                    Cancel request
                  </button>
                ) : null}
              </RequestCard>
            ))
          )}
          <Pagination data={r.data} setPage={setPage} />
        </section>
      </div>
      <Modal
        open={!!cancel}
        onClose={() => {
          if (!busy) {
            setCancel(null);
            setError("");
          }
        }}
        title="Cancel this party request?"
        description={
          cancel
            ? `${cancel.number} · ${cancel.occasion}`
            : "Review your request"
        }
      >
        <div className="form-stack">
          <p>
            The catering manager will see that you no longer need this request.
            You can submit another whenever you’re ready.
          </p>
          {error && <ErrorNotice message={error} />}
          <div className="catering-modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setCancel(null)}
            >
              Keep request
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void cancelRequest()}
            >
              {busy ? "Cancelling…" : "Cancel request"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function CateringWorkspaceScreen() {
  return (
    <Access staff>
      <CateringWorkspace />
    </Access>
  );
}

function CateringWorkspace() {
  const app = useApp();
  const [page, setPage] = useState(1),
    [outlet, setOutlet] = useState(app.user?.outletId || "all"),
    [filter, setFilter] = useState("REQUESTED");
  const [selected, setSelected] = useState<CateringRequest | null>(null),
    [decision, setDecision] = useState("CONFIRMED"),
    [note, setNote] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const r = useResource<CateringData>(
    `/api/staff/catering?outlet=${outlet}&status=${filter}&page=${page}`,
  );
  useEffect(() => {
    if (r.data) {
      const lastPage = Math.max(1, Math.ceil(r.data.total / r.data.pageSize));
      if (page > lastPage) setPage(lastPage);
    }
  }, [r.data, page]);
  useEffect(() => {
    const timer = setInterval(() => void r.refresh(), 15000);
    return () => clearInterval(timer);
  }, [r.refresh]);
  async function respond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/staff/catering/${selected.id}`, "PATCH", {
        status: decision,
        managerNote: note,
        version: selected.version,
      });
      setSelected(null);
      app.setToast(
        decision === "CONFIRMED"
          ? "Party request confirmed"
          : "Reply sent to the customer",
      );
      await r.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page catering-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">MAKE ROOM FOR THE OCCASION</p>
          <h1>Party requests</h1>
          <p>
            Review the details, check capacity, and give every gathering a clear
            answer.
          </p>
        </div>
        <button className="button secondary" onClick={() => void r.refresh()}>
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>
      <div className="catering-toolbar">
        <label>
          Kitchen
          <select
            value={outlet}
            onChange={(e) => {
              setOutlet(e.target.value);
              setPage(1);
            }}
            aria-label="Catering workspace outlet"
          >
            {app.user?.role === "ADMIN" && (
              <option value="all">All kitchens</option>
            )}
            {r.data?.outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            aria-label="Catering request status"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All requests</option>
            {CATERING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </label>
        <span>
          {r.data
            ? `${r.data.total} ${r.data.total === 1 ? "request" : "requests"}`
            : "Loading requests…"}{" "}
          · earliest events first
        </span>
      </div>
      {r.error && (
        <ErrorNotice message={r.error} retry={() => void r.refresh()} />
      )}
      {r.loading ? (
        <Loading />
      ) : r.data?.requests.length === 0 ? (
        <div className="panel">
          <Empty title="You’re all caught up">
            <p>No party requests match these filters.</p>
          </Empty>
        </div>
      ) : (
        <div className="catering-workspace-grid">
          {r.data?.requests.map((value) => (
            <RequestCard key={value.id} value={value}>
              {value.status === "REQUESTED" ? (
                <button
                  className="button primary"
                  onClick={() => {
                    setSelected(value);
                    setDecision("CONFIRMED");
                    setNote("");
                    setError("");
                  }}
                >
                  Review request
                  <ArrowRight size={16} />
                </button>
              ) : null}
            </RequestCard>
          ))}
        </div>
      )}
      <Pagination data={r.data} setPage={setPage} />
      <Modal
        open={!!selected}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title="Reply to this party request"
        description={
          selected
            ? `${selected.number} · ${selected.guestCount} guests · ${eventTime(selected.eventAt)} IST`
            : "Review the event details"
        }
      >
        <form className="form-stack" onSubmit={respond}>
          <p>
            Check kitchen capacity, the requested menu and the event address
            before confirming. Your reply appears in the customer’s account.
          </p>
          <label>
            Decision
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="CONFIRMED">Confirm request</option>
              <option value="DECLINED">Decline request</option>
            </select>
          </label>
          <label>
            {decision === "CONFIRMED"
              ? "Confirmation details"
              : "Reason and next steps"}
            <textarea
              required
              minLength={10}
              maxLength={1000}
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                decision === "CONFIRMED"
                  ? "Confirm the agreed menu, timing, total quote and arrangements."
                  : "Explain why and suggest an alternative if possible."
              }
            />
          </label>
          <small className="catering-help">
            No payment is collected or kitchen ticket created by this form.
            Final arrangements are recorded in your reply.
          </small>
          {error && <ErrorNotice message={error} />}
          <div className="catering-modal-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Back
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "Sending reply…" : "Send reply"}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
