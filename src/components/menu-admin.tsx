"use client";
import { useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { request, useResource } from "@/lib/client";
import { CATEGORIES, money, PHOTOS } from "@/lib/domain";
import type { MenuItem, Outlet } from "@/lib/types";
import { StaffGate } from "./staff-screens";
import { Diet, Empty, ErrorNotice, FoodPhoto, Loading, Modal } from "./ui";
import { useApp } from "./provider";

type MenuAdminData = { items: MenuItem[]; outlets: Outlet[] };
const blank = {
  id: "",
  name: "",
  description: "",
  category: "Biryani",
  pricePaise: 10000,
  familyPricePaise: null,
  portion: "Regular · serves 1",
  vegetarian: true,
  spice: "Medium",
  allergens: [],
  photo: null,
  prepMinutes: 15,
  active: true,
  featured: false,
  available: true,
} satisfies MenuItem;
export function MenuAdminScreen() {
  return (
    <StaffGate admin>
      <MenuAdmin />
    </StaffGate>
  );
}
function MenuAdmin() {
  const app = useApp(),
    r = useResource<MenuAdminData>("/api/admin/menu"),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<MenuItem | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [busy, setBusy] = useState<string | null>(null),
    [photo, setPhoto] = useState<string>("");
  const items =
    r.data?.items.filter((i) =>
      i.name.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  function edit(item: MenuItem) {
    setEditing(item);
    setPhoto(item.photo || "");
    setError("");
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    const f = new FormData(e.currentTarget),
      family = String(f.get("family") || "");
    const input = {
      name: f.get("name"),
      description: f.get("description"),
      category: f.get("category"),
      pricePaise: Math.round(Number(f.get("price")) * 100),
      familyPricePaise: family ? Math.round(Number(family) * 100) : null,
      portion: f.get("portion"),
      vegetarian: f.get("diet") === "veg",
      spice: f.get("spice"),
      allergens: String(f.get("allergens") || "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      photo: photo || null,
      prepMinutes: Number(f.get("prep")),
      active: f.get("active") === "on",
      featured: f.get("featured") === "on",
    };
    try {
      await request(
        editing.id ? `/api/admin/menu/${editing.id}` : "/api/admin/menu",
        editing.id ? "PATCH" : "POST",
        input,
      );
      setEditing(null);
      await r.refresh();
      app.setToast("Menu saved. Customer menus update automatically.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">ONE MENU. EVERY KITCHEN.</p>
          <h1>A menu worth coming back for.</h1>
          <p>
            Manage your dishes, prices, and what’s available at each outlet.
          </p>
        </div>
        <button className="button primary" onClick={() => edit({ ...blank })}>
          <Plus size={18} /> Add a dish
        </button>
      </div>
      <div className="admin-summary">
        <span>
          <strong>{r.data?.items.filter((i) => i.active).length || 0}</strong>{" "}
          active dishes
        </span>
        <span>
          <strong>{r.data?.outlets.length || 0}</strong> connected kitchens
        </span>
        <span>Hyderabad pricing · 5% GST included</span>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>All dishes</h2>
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search menu manager"
              placeholder="Search the menu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {r.error && <ErrorNotice message={r.error} retry={r.refresh} />}{" "}
        {r.loading ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table className="menu-table">
              <thead>
                <tr>
                  <th>Dish</th>
                  <th>Price</th>
                  <th>Status</th>
                  {r.data?.outlets.map((o) => (
                    <th key={o.id}>{o.name.replace(" cloud kitchen", "")}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="admin-dish">
                        <FoodPhoto src={item.photo} name={item.name} />
                        <div>
                          <strong>
                            <Diet veg={item.vegetarian} /> {item.name}
                          </strong>
                          <small>
                            {item.category} · {item.spice}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{money(item.pricePaise)}</strong>
                      <small>
                        {item.familyPricePaise
                          ? `${money(item.familyPricePaise)} family`
                          : item.portion}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${item.active ? "status-ready" : "status-cancelled"}`}
                      >
                        {item.active ? "Published" : "Hidden"}
                      </span>
                    </td>
                    {r.data?.outlets.map((outlet) => {
                      const available =
                          item.availability?.find(
                            (a) => a.outletId === outlet.id,
                          )?.available || false,
                        key = `${item.id}:${outlet.id}`;
                      return (
                        <td key={outlet.id}>
                          <button
                            className={`switch ${available ? "on" : ""}`}
                            role="switch"
                            aria-checked={available}
                            aria-label={`${item.name} at ${outlet.name}`}
                            disabled={busy === key}
                            onClick={async () => {
                              setBusy(key);
                              try {
                                await request(
                                  "/api/staff/availability",
                                  "PATCH",
                                  {
                                    itemId: item.id,
                                    outletId: outlet.id,
                                    available: !available,
                                  },
                                );
                                await r.refresh();
                              } catch (e) {
                                app.setToast((e as Error).message);
                              } finally {
                                setBusy(null);
                              }
                            }}
                          >
                            <span />
                          </button>
                        </td>
                      );
                    })}
                    <td>
                      <button
                        className="icon-button"
                        onClick={() => edit(item)}
                        aria-label={`Edit ${item.name}`}
                      >
                        <Pencil size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length && <Empty title="No dishes match your search" />}
          </div>
        )}
        <small className="table-note">
          Hidden dishes stay off every customer menu. Outlet switches pause
          ordering at one kitchen.
        </small>
      </section>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit dish" : "Add a dish"}
        description="Changes publish to all connected customer menus."
      >
        {editing && (
          <form onSubmit={save} className="form-stack">
            <label>
              Dish name
              <input
                name="name"
                required
                minLength={3}
                maxLength={80}
                defaultValue={editing.name}
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                required
                minLength={5}
                maxLength={240}
                defaultValue={editing.description}
              />
            </label>
            <div className="form-two">
              <label>
                Category
                <select name="category" defaultValue={editing.category}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Diet
                <select
                  name="diet"
                  defaultValue={editing.vegetarian ? "veg" : "nonveg"}
                >
                  <option value="veg">Vegetarian</option>
                  <option value="nonveg">Non-vegetarian</option>
                </select>
              </label>
            </div>
            <div className="form-two">
              <label>
                Regular price (₹, incl. GST)
                <input
                  type="number"
                  name="price"
                  min={1}
                  max={10000}
                  step="0.01"
                  required
                  defaultValue={editing.pricePaise / 100}
                />
              </label>
              <label>
                Family price (₹, optional)
                <input
                  type="number"
                  name="family"
                  min={1}
                  max={10000}
                  step="0.01"
                  defaultValue={
                    editing.familyPricePaise
                      ? editing.familyPricePaise / 100
                      : ""
                  }
                />
              </label>
            </div>
            <label>
              Portion label
              <input
                name="portion"
                required
                minLength={2}
                maxLength={60}
                defaultValue={editing.portion}
              />
            </label>
            <div className="form-two">
              <label>
                Spice level
                <select name="spice" defaultValue={editing.spice}>
                  {["Mild", "Medium", "Hot", "Sweet"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Prep work (minutes)
                <input
                  type="number"
                  name="prep"
                  min={1}
                  max={120}
                  required
                  defaultValue={editing.prepMinutes}
                />
              </label>
            </div>
            <label>
              Allergens, separated by commas
              <input
                name="allergens"
                defaultValue={editing.allergens.join(", ")}
                placeholder="milk, peanut, wheat"
              />
            </label>
            <label>
              Photo from your library
              <select value={photo} onChange={(e) => setPhoto(e.target.value)}>
                <option value="">No photo yet</option>
                {PHOTOS.map((p) => (
                  <option key={p} value={p}>
                    {p.split("/").pop()?.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </label>
            {photo && (
              <FoodPhoto
                className="admin-photo-preview"
                src={photo}
                name="Selected dish photo"
              />
            )}
            <label className="check-label">
              <input
                type="checkbox"
                name="active"
                defaultChecked={editing.active}
              />{" "}
              Publish on customer menus
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={editing.featured}
              />{" "}
              Mark as a house favourite
            </label>
            {error && <ErrorNotice message={error} />}
            <button className="button primary full" disabled={saving}>
              {saving ? "Saving…" : "Save dish"}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
