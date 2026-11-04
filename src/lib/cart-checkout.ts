import { z } from "zod";
import { cartLineKey } from "./domain";
import { cartLineSchema } from "./validation";

export const CART_STORAGE_KEY = "deccan-cart-v1";
export const CHECKOUT_STORAGE_KEY = "deccan-checkouts-v1";
export const CART_CONSUME_LOCK = "deccan-cart-payment";
export const cartSnapshotSchema = z.object({
  outletId: z.string().min(1).max(100),
  cart: cartLineSchema.array().max(30),
  generation: z.string().uuid().optional(),
});
export type CartSnapshot = z.infer<typeof cartSnapshotSchema>;
export const pendingCheckoutsSchema = z.array(z.object({
  orderId: z.string().min(1).max(100),
  snapshot: cartSnapshotSchema,
})).max(20);
export type PendingCheckout = z.infer<typeof pendingCheckoutsSchema>[number];

/** A reduction, replacement or outlet change starts a new cart generation. */
export function cartAfterEdit(
  current: CartSnapshot,
  next: Pick<CartSnapshot, "cart" | "outletId">,
  newGeneration = () => crypto.randomUUID(),
): CartSnapshot {
  const quantities = new Map(next.cart.map((line) => [cartLineKey(line), line.quantity]));
  const changed = current.outletId !== next.outletId || current.cart.some(
    (line) => (quantities.get(cartLineKey(line)) || 0) < line.quantity,
  );
  return { ...next, generation: changed ? newGeneration() : current.generation || newGeneration() };
}

/** Consume only the submitted quantities, preserving subsequent additions. */
export function cartAfterPayment(current: CartSnapshot, submitted: CartSnapshot): CartSnapshot {
  if (!submitted.generation || current.generation !== submitted.generation || current.outletId !== submitted.outletId) return current;
  const quantities = new Map(current.cart.map((line) => [cartLineKey(line), line.quantity]));
  // A removed or reconfigured line means this is a different cart; leave it alone.
  if (submitted.cart.some((line) => (quantities.get(cartLineKey(line)) || 0) < line.quantity)) return current;
  const paid = new Map(submitted.cart.map((line) => [cartLineKey(line), line.quantity]));
  return {
    ...current,
    cart: current.cart.flatMap((line) => {
      const quantity = line.quantity - (paid.get(cartLineKey(line)) || 0);
      return quantity > 0 ? [{ ...line, quantity }] : [];
    }),
  };
}
