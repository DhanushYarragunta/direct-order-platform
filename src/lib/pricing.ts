import { CartLine, cartLineKey, MAX_QUANTITY } from "./domain";

type Item = {
  id: string;
  name: string;
  photo: string | null;
  pricePaise: number;
  familyPricePaise: number | null;
  prepMinutes: number;
  active: boolean;
  available: boolean;
};
type Extra = {
  id: string;
  name: string;
  pricePaise: number;
  prepMinutes: number;
  active: boolean;
};
export function priceCart(cart: CartLine[], items: Item[], extras: Extra[]) {
  const keys = new Set<string>(),
    totals = new Map<string, number>();
  let totalPaise = 0,
    workMinutes = 0;
  const lines = cart.map((line) => {
    const item = items.find((i) => i.id === line.itemId),
      key = cartLineKey(line);
    if (keys.has(key))
      throw new Error("Merge duplicate cart lines before checkout");
    keys.add(key);
    if (!item || !item.active || !item.available)
      throw new Error(`${item?.name || "An item"} is no longer available`);
    const count = (totals.get(item.id) || 0) + line.quantity;
    totals.set(item.id, count);
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      count > MAX_QUANTITY
    )
      throw new Error(`Maximum ${MAX_QUANTITY} of each dish per order`);
    const price =
      line.portion === "family" ? item.familyPricePaise : item.pricePaise;
    if (price === null)
      throw new Error("Family portion is not available for this dish");
    if (new Set(line.addOnIds).size !== line.addOnIds.length)
      throw new Error("Duplicate add-ons");
    const addOns = line.addOnIds.map((id) => {
      const extra = extras.find((e) => e.id === id && e.active);
      if (!extra) throw new Error("An add-on is no longer available");
      return {
        id: extra.id,
        name: extra.name,
        pricePaise: extra.pricePaise,
        prepMinutes: extra.prepMinutes,
      };
    });
    const unitPaise = price + addOns.reduce((sum, a) => sum + a.pricePaise, 0);
    totalPaise += unitPaise * line.quantity;
    workMinutes +=
      (item.prepMinutes * (line.portion === "family" ? 2 : 1) +
        addOns.reduce((sum, a) => sum + a.prepMinutes, 0)) *
      line.quantity;
    return {
      itemId: item.id,
      name: item.name,
      photo: item.photo,
      portion: line.portion,
      quantity: line.quantity,
      unitPaise,
      addOns,
    };
  });
  if (
    !Number.isSafeInteger(totalPaise) ||
    totalPaise <= 0 ||
    totalPaise > 10000000
  )
    throw new Error("Order total is outside the supported range");
  return { lines, totalPaise, workMinutes };
}
