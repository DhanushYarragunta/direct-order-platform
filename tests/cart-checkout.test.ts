import { expect, it } from "vitest";
import { cartAfterEdit, cartAfterPayment, type CartSnapshot } from "../src/lib/cart-checkout";

const submitted: CartSnapshot = {
  outletId: "kondapur",
  generation: "11111111-1111-4111-8111-111111111111",
  cart: [{ itemId: "chicken", quantity: 1, portion: "regular", addOnIds: ["raita"] }],
};

it("consumes the paid snapshot from an unchanged cart", () => {
  expect(cartAfterPayment(submitted, submitted).cart).toEqual([]);
});

it("preserves new dishes and additional quantities while a payment is pending", () => {
  const current: CartSnapshot = {
    ...submitted,
    cart: [
      { ...submitted.cart[0], quantity: 3 },
      { itemId: "sweet", quantity: 2, portion: "regular", addOnIds: [] },
    ],
  };
  expect(cartAfterPayment(current, submitted).cart).toEqual([
    { ...submitted.cart[0], quantity: 2 }, current.cart[1],
  ]);
  expect(current.cart[0].quantity).toBe(3);
});

it("leaves a cart at another outlet intact", () => {
  const current = { ...submitted, outletId: "gachibowli" };
  expect(cartAfterPayment(current, submitted)).toBe(current);
});

it("leaves a replaced or reduced cart intact", () => {
  const reconfigured: CartSnapshot = {
    ...submitted, cart: [{ ...submitted.cart[0], addOnIds: [] }],
  };
  expect(cartAfterPayment(reconfigured, submitted)).toBe(reconfigured);
  expect(cartAfterPayment(submitted, {
    ...submitted, cart: [{ ...submitted.cart[0], quantity: 2 }],
  })).toBe(submitted);
});

it("preserves a removed then readded identical line through serialization", () => {
  const removed = cartAfterEdit(submitted, { ...submitted, cart: [] });
  const readded = cartAfterEdit(removed, { ...removed, cart: submitted.cart });
  const restored = JSON.parse(JSON.stringify(readded)) as CartSnapshot;
  expect(restored.generation).not.toBe(submitted.generation);
  expect(cartAfterPayment(restored, submitted)).toBe(restored);
});

it("keeps additions in the current generation but changes it after a reduction or outlet change", () => {
  const increased = cartAfterEdit(submitted, { ...submitted, cart: [{ ...submitted.cart[0], quantity: 3 }] });
  expect(increased.generation).toBe(submitted.generation);
  expect(cartAfterPayment(increased, submitted).cart[0].quantity).toBe(2);
  const reduced = cartAfterEdit(increased, { ...increased, cart: submitted.cart });
  expect(reduced.generation).not.toBe(increased.generation);
  const moved = cartAfterEdit(submitted, { ...submitted, outletId: "gachibowli" });
  const returned = cartAfterEdit(moved, { ...moved, outletId: "kondapur" });
  expect(cartAfterPayment(returned, submitted)).toBe(returned);
});

it("preserves legacy carts without a known checkout generation", () => {
  expect(cartAfterPayment(submitted, { ...submitted, generation: undefined })).toBe(submitted);
});
