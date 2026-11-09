"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import { cartLineKey, type CartLine } from "@/lib/domain";
import { request, useResource } from "@/lib/client";
import type { MenuData, User } from "@/lib/types";
import { useDeliveryProfile } from "./use-delivery-profile";
import { mergeReorder } from "@/lib/reorder";
import {
  CART_STORAGE_KEY, CHECKOUT_STORAGE_KEY, CART_CONSUME_LOCK, cartSnapshotSchema,
  pendingCheckoutsSchema, cartAfterEdit, cartAfterPayment, type CartSnapshot, type PendingCheckout,
} from "@/lib/cart-checkout";

function useStore(demoMode: boolean) {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false);
  const [cartState, setCartState] = useState<CartSnapshot>({ outletId: "kondapur", cart: [] }),
    [hydrated, setHydrated] = useState(false);
  const cartStateRef = useRef(cartState);
  const { cart, outletId } = cartState;
  const [toast, setToast] = useState("");
  const pendingCheckouts = useRef<PendingCheckout[]>([]);
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
  function adoptCart(value: CartSnapshot) {
    cartStateRef.current = value;
    setCartState(value);
  }
  function saveCart(value: CartSnapshot) {
    adoptCart(value);
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(value)); } catch {}
  }
  function setCart(value: SetStateAction<CartLine[]>) {
    const current = cartStateRef.current;
    saveCart(cartAfterEdit(current, {
      outletId: current.outletId,
      cart: typeof value === "function" ? value(current.cart) : value,
    }));
  }
  function setOutletId(value: string) {
    const current = cartStateRef.current;
    saveCart(cartAfterEdit(current, { cart: current.cart, outletId: value }));
  }
  useEffect(() => {
    void refreshUser().catch(() => {});
    let initial = cartStateRef.current;
    try {
      const saved = cartSnapshotSchema.safeParse(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "null"));
      if (saved.success) initial = saved.data;
    } catch {}
    saveCart({ ...initial, generation: initial.generation || crypto.randomUUID() });
    setHydrated(true);
  }, []);
  useEffect(() => {
    const syncCart = (event: StorageEvent) => {
      if (event.key !== CART_STORAGE_KEY || !event.newValue) return;
      try {
        const saved = cartSnapshotSchema.safeParse(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "null"));
        if (saved.success) adoptCart(saved.data);
      } catch {}
    };
    window.addEventListener("storage", syncCart);
    return () => window.removeEventListener("storage", syncCart);
  }, []);
  function readCheckouts() {
    try {
      const parsed = pendingCheckoutsSchema.safeParse(JSON.parse(localStorage.getItem(CHECKOUT_STORAGE_KEY) || "[]"));
      if (parsed.success) pendingCheckouts.current = parsed.data;
    } catch {}
    return pendingCheckouts.current;
  }
  function saveCheckouts(checkouts: PendingCheckout[]) {
    pendingCheckouts.current = checkouts;
    try { localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(checkouts)); } catch {}
  }
  function rememberCheckout(orderId: string, snapshot: CartSnapshot) {
    saveCheckouts([...readCheckouts().filter((entry) => entry.orderId !== orderId),
      { orderId, snapshot: structuredClone(snapshot) }].slice(-20));
  }
  async function consumeCheckout(orderId: string) {
    // Without cross-tab exclusion, preserve the cart for manual review.
    if (!navigator.locks?.request) return false;
    try {
      return await navigator.locks.request(CART_CONSUME_LOCK, () => {
        const checkouts = readCheckouts();
        const submitted = checkouts.find((entry) => entry.orderId === orderId);
        if (!submitted) return true;
        saveCheckouts(checkouts.filter((entry) => entry.orderId !== orderId));
        let current = cartStateRef.current;
        // Another tab may have edited the cart while payment was processing.
        try {
          const saved = cartSnapshotSchema.safeParse(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "null"));
          if (saved.success) current = saved.data;
        } catch {}
        saveCart(cartAfterPayment(current, submitted.snapshot));
        return true;
      });
    } catch { return false; }
  }
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
  const deliveryProfile = useDeliveryProfile(user, authReady, menu.data?.outlets, setOutletId, setToast);
  function addReviewedLines(lines: CartLine[]) {
    const current = cartStateRef.current;
    if (!menu.data || menu.loading || menu.error || menu.data.outlet.id !== current.outletId)
      throw new Error("The selected kitchen changed. Wait for its menu and review your choices again.");
    saveCart(cartAfterEdit(current, { outletId: current.outletId, cart: mergeReorder(current.cart, lines, menu.data) }));
    setToast("Selected dishes added. Review your order before paying.");
  }
  return {
    ...deliveryProfile,
    user,
    authReady,
    refreshUser,
    outletId,
    setOutletId,
    cart,
    cartGeneration: cartState.generation,
    setCart,
    cartReady: hydrated,
    rememberCheckout,
    consumeCheckout,
    add,
    addReviewedLines,
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
