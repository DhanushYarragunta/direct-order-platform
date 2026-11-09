import { cartLineKey, type CartLine, MAX_QUANTITY } from "./domain";
import type { MenuData, Order } from "./types";

export function reviewReorder(lines: Order["lines"], menu: MenuData) {
  return lines.map(line => {
    const item = menu.items.find(item => item.id === line.itemId);
    const extras = line.addOns.map(extra => menu.addOns.find(current => current.id === extra.id));
    const reason = !item?.available ? item?.unavailableReason || "Not available at this kitchen"
      : !["regular", "family"].includes(line.portion) || (line.portion === "family" && item.familyPricePaise === null) ? "This portion is no longer available"
        : extras.some(extra => !extra) || extras.length > 4 ? "An extra is no longer available; customise this dish from the menu"
          : line.quantity < 1 || line.quantity > MAX_QUANTITY ? "Choose a new quantity from the menu" : null;
    const unitPaise = item ? (line.portion === "family" ? item.familyPricePaise || 0 : item.pricePaise) + extras.reduce((sum, extra) => sum + (extra?.pricePaise || 0), 0) : 0;
    return { id: line.id, name: item?.name || line.name, reason, unitPaise, vegetarian: item?.vegetarian,
      allergens: [...new Set([...(item?.allergens || []), ...extras.flatMap(extra => extra?.allergens || [])])],
      line: { itemId: line.itemId, portion: line.portion as CartLine["portion"], quantity: line.quantity, addOnIds: line.addOns.map(extra => extra.id) },
      details: [line.portion === "family" ? "Family pack" : item?.portion || "Regular", ...line.addOns.map(extra => extra.name)].join(" · ") };
  });
}

export function mergeReorder(cart: CartLine[], additions: CartLine[], menu: MenuData): CartLine[] {
  if (!additions.length) throw new Error("Choose at least one available dish");
  const merged = cart.map(line => ({ ...line, addOnIds: [...line.addOnIds] }));
  for (const line of additions) {
    const item = menu.items.find(item => item.id === line.itemId);
    if (!item?.available || (line.portion === "family" && item.familyPricePaise === null)
      || !["regular", "family"].includes(line.portion) || line.addOnIds.some(id => !menu.addOns.some(extra => extra.id === id)))
      throw new Error("The menu changed. Review the available dishes again.");
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.addOnIds.length > 4 || new Set(line.addOnIds).size !== line.addOnIds.length)
      throw new Error("Review the quantities and extras before adding these dishes");
    const quantity = merged.filter(current => current.itemId === line.itemId).reduce((sum, current) => sum + current.quantity, line.quantity);
    if (quantity > MAX_QUANTITY) throw new Error(`Your cart can contain up to ${MAX_QUANTITY} of ${item.name}. Adjust your cart first.`);
    const existing = merged.find(current => cartLineKey(current) === cartLineKey(line));
    if (existing) existing.quantity += line.quantity;
    else merged.push({ ...line, addOnIds: [...line.addOnIds] });
  }
  if (merged.length > 30) throw new Error("Your cart can contain up to 30 different selections. Adjust your cart first.");
  return merged;
}
