"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { cartLineKey, type CartLine } from "@/lib/domain";
import { cartLineSchema } from "@/lib/validation";
import { request, useResource } from "@/lib/client";
import type { MenuData, User } from "@/lib/types";

function useStore(demoMode: boolean) {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false);
  const [outletId, setOutletId] = useState("kondapur"),
    [cart, setCart] = useState<CartLine[]>([]),
    [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");
  const menu = useResource<MenuData>(
    `/api/menu?outlet=${outletId}&account=${user?.id || "guest"}`,
    `/api/events?scope=menu&outlet=${outletId}`,
  );
  const refreshUser = async () => {
    try {
      const v = await request<{ user: User | null }>("/api/auth/me");
      setUser(v.user);
      return v.user;
    } finally {
      setAuthReady(true);
    }
  };
  useEffect(() => {
    void refreshUser().catch(() => {});
    try {
      const saved = JSON.parse(
        localStorage.getItem("deccan-cart-v1") || "null",
      );
      if (saved) {
        const parsed = cartLineSchema.array().max(30).safeParse(saved.cart);
        if (parsed.success) setCart(parsed.data);
        if (["kondapur", "gachibowli", "kukatpally"].includes(saved.outletId))
          setOutletId(saved.outletId);
      }
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated)
      localStorage.setItem(
        "deccan-cart-v1",
        JSON.stringify({ cart, outletId }),
      );
  }, [cart, outletId, hydrated]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  function add(line: CartLine) {
    if (!menu.data?.items.find((i) => i.id === line.itemId)?.available) {
      setToast("This dish is currently unavailable.");
      return;
    }
    const current = cart
      .filter((l) => l.itemId === line.itemId)
      .reduce((s, l) => s + l.quantity, 0);
    if (current + line.quantity > 20) {
      setToast("You can add up to 20 of each dish.");
      return;
    }
    setCart((lines) => {
      const key = cartLineKey(line),
        existing = lines.find((l) => cartLineKey(l) === key);
      return existing
        ? lines.map((l) =>
            cartLineKey(l) === key
              ? { ...l, quantity: l.quantity + line.quantity }
              : l,
          )
        : [...lines, line];
    });
    setToast("Added to your order");
  }
  function quantity(key: string, value: number) {
    if (value <= 0) {
      setCart((c) => c.filter((l) => cartLineKey(l) !== key));
      return;
    }
    const line = cart.find((l) => cartLineKey(l) === key);
    if (!line) return;
    if (
      cart
        .filter((l) => l.itemId === line.itemId && cartLineKey(l) !== key)
        .reduce((s, l) => s + l.quantity, value) > 20
    ) {
      setToast("You can add up to 20 of each dish.");
      return;
    }
    if (
      value > line.quantity &&
      !menu.data?.items.find((i) => i.id === line.itemId)?.available
    )
      return;
    setCart((c) =>
      c.map((l) => (cartLineKey(l) === key ? { ...l, quantity: value } : l)),
    );
  }
  const total = cart.reduce((sum, l) => {
    const i = menu.data?.items.find((i) => i.id === l.itemId);
    return (
      sum +
      ((l.portion === "family" ? i?.familyPricePaise : i?.pricePaise) || 0) *
        l.quantity +
      l.addOnIds.reduce(
        (s, id) =>
          s + (menu.data?.addOns.find((a) => a.id === id)?.pricePaise || 0),
        0,
      ) *
        l.quantity
    );
  }, 0);
  const unavailable = cart.some((l) => {
    const i = menu.data?.items.find((i) => i.id === l.itemId);
    return (
      !i?.available ||
      (l.portion === "family" && !i.familyPricePaise) ||
      l.addOnIds.some((id) => !menu.data?.addOns.some((a) => a.id === id))
    );
  });
  return {
    user,
    authReady,
    refreshUser,
    outletId,
    setOutletId,
    cart,
    setCart,
    add,
    quantity,
    total,
    unavailable,
    menu,
    demoMode,
    toast,
    setToast,
  };
}
const Context = createContext<ReturnType<typeof useStore> | null>(null);
export function Provider({
  children,
  demoMode,
}: {
  children: ReactNode;
  demoMode: boolean;
}) {
  const value = useStore(demoMode);
  return (
    <Context.Provider value={value}>
      {children}
      <div className={`toast ${value.toast ? "visible" : ""}`} role="status">
        {value.toast}
      </div>
    </Context.Provider>
  );
}
export function useApp() {
  const context = useContext(Context);
  if (!context) throw new Error("Provider missing");
  return context;
}
