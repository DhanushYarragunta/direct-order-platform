import { chooseOutlet, money } from "./domain";

// Curated demo service areas, not address geocoding or a guarantee for an entire pincode.
export const DELIVERY_LOCALITIES = [
  { id: "kondapur", name: "Kondapur centre", pincode: "500084", latitude: 17.462, longitude: 78.357 },
  { id: "gachibowli", name: "Gachibowli centre", pincode: "500032", latitude: 17.4401, longitude: 78.3489 },
  { id: "kukatpally", name: "Kukatpally centre", pincode: "500072", latitude: 17.4948, longitude: 78.3996 },
] as const;

export type DeliveryLocation = { latitude?: number; longitude?: number; localityId?: string };
export function deliveryPoint(input: DeliveryLocation) {
  if (input.localityId) {
    const locality = DELIVERY_LOCALITIES.find((item) => item.id === input.localityId);
    if (!locality) throw new Error("Choose a supported delivery locality");
    return { latitude: locality.latitude, longitude: locality.longitude };
  }
  if (input.latitude === undefined || input.longitude === undefined ||
      !Number.isFinite(input.latitude) || !Number.isFinite(input.longitude))
    throw new Error("Choose a delivery locality or share the delivery address location");
  return { latitude: input.latitude, longitude: input.longitude };
}

export function deliveryOutlet<T extends { latitude: number; longitude: number; radiusKm: number; open: boolean }>(outlets: T[], input: DeliveryLocation) {
  const outlet = chooseOutlet(outlets, deliveryPoint(input));
  if (!outlet) throw new Error("This location is outside all open kitchen delivery areas. Choose pickup or another address.");
  return outlet;
}

export function deliveryFee(subtotalPaise: number, fulfillment: string, policy: {
  deliveryFeePaise: number; minDeliveryPaise: number; freeDeliveryAbovePaise: number;
}) {
  if (fulfillment !== "delivery") return 0;
  if (subtotalPaise < policy.minDeliveryPaise)
    throw new Error(`Delivery needs an item total of ${money(policy.minDeliveryPaise)} before discounts`);
  return subtotalPaise >= policy.freeDeliveryAbovePaise ? 0 : policy.deliveryFeePaise;
}
