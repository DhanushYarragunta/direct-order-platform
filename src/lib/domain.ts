export const CATEGORIES = ["Biryani", "Sides", "Sweets"] as const;
export const PHOTOS = [
  "/food/chicken-biryani.jpg",
  "/food/vegetable-biryani.jpg",
  "/food/mirchi-ka-salan.jpg",
  "/food/double-ka-meetha.jpg",
] as const;
export const MAX_QUANTITY = 20;
export const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PLACED: "Order received",
  PREPARING: "In the kitchen",
  READY: "Ready for pickup",
  HANDED_OFF: "Handed over",
  CANCELLED: "Cancelled",
};

export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
}

export function gstIncluded(totalPaise: number) {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0)
    throw new Error("Invalid amount");
  return Math.round((totalPaise * 5) / 105);
}

export function estimatePreparation(
  workMinutes: number,
  queueWork: number,
  minimum: number,
  stations: number,
) {
  const safeMinimum =
    Number.isFinite(minimum) && minimum >= 1 ? Math.ceil(minimum) : 30;
  const valid =
    [workMinutes, queueWork, stations].every(Number.isFinite) &&
    workMinutes >= 0 &&
    queueWork >= 0 &&
    stations >= 1;
  // This baseline is explicitly rules-based, not a trained ML model.
  const estimate = valid
    ? Math.ceil(10 + workMinutes / 2 + queueWork / stations)
    : safeMinimum;
  return { minutes: Math.max(safeMinimum, estimate), fallback: !valid };
}

export function overridePromise(
  minutes: number,
  minimum: number,
  now = new Date(),
) {
  if (!Number.isInteger(minutes) || minutes < minimum || minutes > 180)
    throw new Error(`Use ${minimum}–180 minutes`);
  return new Date(now.getTime() + minutes * 60_000);
}

export function canTransition(from: string, to: string) {
  return (
    (
      {
        PLACED: ["PREPARING", "CANCELLED"],
        PREPARING: ["READY"],
        READY: ["HANDED_OFF"],
      } as Record<string, string[]>
    )[from]?.includes(to) ?? false
  );
}

export function isLateAlert(
  status: string,
  promisedAt: Date | null,
  now = new Date(),
) {
  return (
    ["PLACED", "PREPARING"].includes(status) &&
    !!promisedAt &&
    now.getTime() >= promisedAt.getTime() + 10 * 60_000
  );
}

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude),
    dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function chooseOutlet<
  T extends {
    latitude: number;
    longitude: number;
    radiusKm: number;
    open: boolean;
  },
>(outlets: T[], point: { latitude: number; longitude: number }) {
  return (
    outlets
      .filter((o) => o.open)
      .map((outlet) => ({ outlet, distance: distanceKm(point, outlet) }))
      .filter((o) => o.distance <= o.outlet.radiusKm)
      .sort((a, b) => a.distance - b.distance)[0]?.outlet ?? null
  );
}

export type CartLine = {
  itemId: string;
  quantity: number;
  portion: "regular" | "family";
  addOnIds: string[];
};
export function cartLineKey(
  line: Pick<CartLine, "itemId" | "portion" | "addOnIds">,
) {
  return [line.itemId, line.portion, ...[...line.addOnIds].sort()].join(":");
}
