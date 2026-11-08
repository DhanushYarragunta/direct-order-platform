"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ChefHat,
  LayoutDashboard,
  UtensilsCrossed,
  ReceiptText,
  BookOpen,
  LogOut,
  ArrowUpRight,
  MapPin,
  CalendarHeart,
  Settings,
  BrainCircuit,
  X,
  ShieldCheck,
  CircleHelp,
} from "lucide-react";
import { useApp } from "./provider";
import { request } from "@/lib/client";
import { ErrorNotice } from "./ui";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    app = useApp(),
    staff = app.user && app.user.role !== "CUSTOMER";
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState("");
  useEffect(() => {
    setAccountOpen(false);
    setAccountError("");
  }, [path, app.user?.id]);
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setAccountError("");
    try {
      await request("/api/auth/logout", "POST", {});
      // Reload after the session is revoked, even if a subsequent account read would fail.
      window.location.assign("/");
    } catch (error) {
      const message = (error as Error).message;
      setAccountError(message);
      if (!accountOpen) app.setToast(message);
      setSigningOut(false);
    }
  }
  const links = staff
    ? [
        { href: "/workspace", label: "Overview", icon: LayoutDashboard },
        { href: "/kitchen", label: "Kitchen display", icon: ChefHat },
        ...(["ADMIN", "MANAGER"].includes(app.user?.role || "")
          ? [{ href: "/workspace/ai", label: "AI & automation", icon: BrainCircuit }]
          : []),
        ...(app.user?.role === "ADMIN"
          ? [{ href: "/workspace/menu", label: "Menu manager", icon: BookOpen },
             { href: "/workspace/services", label: "Services", icon: Settings }]
          : []),
        ...(["ADMIN", "MANAGER"].includes(app.user?.role || "")
          ? [{ href: "/workspace/catering", label: "Party requests", icon: CalendarHeart }]
          : []),
        { href: "/", label: "Customer menu", icon: UtensilsCrossed },
      ]
    : [
        { href: "/", label: "Our menu", icon: UtensilsCrossed },
        { href: "/orders", label: "My orders", icon: ReceiptText },
        { href: "/catering", label: "Party orders", icon: CalendarHeart },
      ];
  return (
    <div className={`app-shell ${path === "/kitchen" ? "kitchen-shell" : ""}`}>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <UtensilsCrossed size={22} />
          </span>
          <span>
            deccan<span className="brand-sub">KITCHEN & CO.</span>
          </span>
        </Link>
        <div className="sidebar-rule" />
        <p className="nav-label">
          {staff ? "RESTAURANT WORKSPACE" : "A TASTE OF HYDERABAD"}
        </p>
        <nav aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={label}
              aria-current={path === href ? "page" : undefined}
              className={`nav-link ${path === href ? "active" : ""}`}
            >
              <Icon size={19} />
              {label}
              {path === href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="direct-note">
            <span className="tiny-label">STRAIGHT FROM OUR KITCHEN</span>
            <h3>
              Good food.
              <br />
              Closer to home.
            </h3>
            <p>
              Order direct. Made with care,
              <br />
              served with a little more heart.
            </p>
          </div>
          {app.user ? (
            <div className="account">
              <span className="avatar">{app.user.name.slice(0, 1)}</span>
              <div>
                <strong>{app.user.name}</strong>
                <small>{app.user.role.toLowerCase()}</small>
              </div>
              <button
                className="icon-button"
                aria-label="Sign out"
                disabled={signingOut}
                onClick={() => void signOut()}
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <Link className="sign-in-link" href="/login">
              Sign in to your account <ArrowUpRight size={18} />
            </Link>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            {path.startsWith("/workspace")
              ? "Workspace"
              : path === "/kitchen"
                ? "Operations"
                : "Order online"}
            <span>/</span>
            <strong>
              {path === "/"
                ? "Menu"
                : path.includes("checkout")
                  ? "Checkout"
                  : path.includes("payment")
                    ? "Payment"
                    : path === "/kitchen"
                      ? "Kitchen display"
                      : path.includes("workspace/ai")
                        ? "AI & automation"
                      : path.includes("workspace/services")
                        ? "Payments & communications"
                      : path.includes("workspace/menu")
                        ? "Menu manager"
                        : path.includes("catering")
                          ? "Party orders"
                        : path === "/workspace"
                          ? "Overview"
                          : path.includes("login")
                            ? "Your account"
                            : path === "/privacy"
                              ? "Privacy & account"
                              : path === "/help"
                                ? "Help & refunds"
                            : "Your orders"}
            </strong>
          </div>
          <div className="topbar-right">
            {app.demoMode && <span className="demo-pill">DEMO</span>}
            <span className="location-label">
              <MapPin size={16} /> Hyderabad
            </span>
            {app.user ? (
              <Dialog.Root open={accountOpen} onOpenChange={(open) => {
                setAccountOpen(open);
                if (open) setAccountError("");
              }}>
                <Dialog.Trigger asChild>
                  <button type="button" className="avatar top-avatar account-trigger" aria-label="Your account" title="Your account">
                    {app.user.name[0]}
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="modal-overlay" />
                  <Dialog.Content className="modal account-dialog">
                    <div className="modal-heading">
                      <div>
                        <Dialog.Title>Your account</Dialog.Title>
                        <Dialog.Description>Manage your account and find your way around.</Dialog.Description>
                      </div>
                      <Dialog.Close className="icon-button" aria-label="Close account">
                        <X size={20} />
                      </Dialog.Close>
                    </div>
                    <div className="account-summary">
                      <span className="avatar" aria-hidden="true">{app.user.name[0]}</span>
                      <div><strong>{app.user.name}</strong><span>{app.user.role.toLowerCase()}</span></div>
                    </div>
                    <nav className="account-navigation" aria-label="Account navigation">
                      {[...links,
                        { href: "/privacy", label: "Privacy & account", icon: ShieldCheck },
                        { href: "/help", label: "Help & refunds", icon: CircleHelp },
                      ].map(({ href, label, icon: Icon }) => (
                        <Link key={href} href={href} aria-current={path === href ? "page" : undefined} onClick={() => setAccountOpen(false)}>
                          <Icon size={19} aria-hidden="true" />{label}
                        </Link>
                      ))}
                    </nav>
                    {accountError && <ErrorNotice message={accountError} />}
                    <button type="button" className="button secondary account-signout" disabled={signingOut} onClick={() => void signOut()}>
                      <LogOut size={18} aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}
                    </button>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            ) : (
              <Link href="/login" className="avatar top-avatar account-trigger" aria-label="Sign in" title="Sign in">D</Link>
            )}
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <Link href="/privacy">Privacy & account</Link>
          <Link href="/help">Help & refunds</Link>
          <span>
            © {new Date().getFullYear()} Deccan Kitchen & Co. · Concept brand
            for Company A
          </span>
          <span>
            Prices include 5% GST ·{" "}
            {app.demoMode ? "Demo orders only" : "Hyderabad"}
          </span>
        </footer>
      </div>
    </div>
  );
}
