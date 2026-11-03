"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChefHat,
  LayoutDashboard,
  UtensilsCrossed,
  ReceiptText,
  BookOpen,
  LogOut,
  ArrowUpRight,
  MapPin,
} from "lucide-react";
import { useApp } from "./provider";
import { request } from "@/lib/client";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    app = useApp(),
    staff = app.user && app.user.role !== "CUSTOMER";
  const links = staff
    ? [
        { href: "/workspace", label: "Overview", icon: LayoutDashboard },
        { href: "/kitchen", label: "Kitchen display", icon: ChefHat },
        ...(app.user?.role === "ADMIN"
          ? [{ href: "/workspace/menu", label: "Menu manager", icon: BookOpen }]
          : []),
        { href: "/", label: "Customer menu", icon: UtensilsCrossed },
      ]
    : [
        { href: "/", label: "Our menu", icon: UtensilsCrossed },
        { href: "/orders", label: "My orders", icon: ReceiptText },
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
        <nav>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
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
                onClick={async () => {
                  try {
                    await request("/api/auth/logout", "POST", {});
                    await app.refreshUser();
                    location.assign("/");
                  } catch (e) {
                    app.setToast((e as Error).message);
                  }
                }}
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
                    ? "Test payment"
                    : path === "/kitchen"
                      ? "Kitchen display"
                      : path.includes("workspace/menu")
                        ? "Menu manager"
                        : path === "/workspace"
                          ? "Overview"
                          : path.includes("login")
                            ? "Your account"
                            : "Your orders"}
            </strong>
          </div>
          <div className="topbar-right">
            {app.demoMode && <span className="demo-pill">DEMO</span>}
            <span className="location-label">
              <MapPin size={16} /> Hyderabad
            </span>
            <Link
              href={app.user ? (staff ? "/workspace" : "/orders") : "/login"}
              className="avatar top-avatar"
              aria-label="Your account"
            >
              {app.user?.name[0] || "D"}
            </Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
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
