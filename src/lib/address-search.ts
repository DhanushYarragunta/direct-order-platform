import { z } from "zod";
import { DELIVERY_LOCALITIES } from "./delivery";
import type { LocationSuggestion } from "./profile-types";

export const addressQuerySchema = z.string().trim().transform((value) => value.replace(/\s+/g, " "))
  .pipe(z.string().min(3, "Type at least 3 characters to search").max(120, "Keep your search under 120 characters")
    .regex(/^[^\u0000-\u001f\u007f]+$/, "Enter an area, building or landmark"));

export type AddressSearchResult = {
  results: LocationSuggestion[];
  attribution: string;
  provider: "photon" | "local";
  warning?: string;
};

// This public demo endpoint allows moderate project use. Keep traffic bounded at
// the route and debounce in the client; do not retain or log address searches.
const ENDPOINT = "https://photon.komoot.io/api/";
const BOUNDS = [78.05, 17.15, 78.75, 17.7] as const;
const ATTRIBUTION = "© OpenStreetMap contributors · Search by Photon";
const MAX_RESULTS = 6;
const MAX_RESPONSE_BYTES = 128_000;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown, length = 130) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, length) : "";
}

export function parsePhotonResults(value: unknown): LocationSuggestion[] {
  const payload = object(value);
  if (!Array.isArray(payload?.features)) throw new Error("Invalid place-search response");
  const results: LocationSuggestion[] = [];
  const seen = new Set<string>();
  for (const feature of payload.features.slice(0, 30)) {
    const record = object(feature), geometry = object(record?.geometry), properties = object(record?.properties);
    if (!properties || geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) continue;
    const [longitude, latitude] = geometry.coordinates;
    if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || longitude < BOUNDS[0] || latitude < BOUNDS[1] || longitude > BOUNDS[2] || latitude > BOUNDS[3]) continue;
    const country = text(properties.countrycode).toUpperCase();
    if (country && country !== "IN") continue;
    const street = [text(properties.housenumber, 20), text(properties.street, 100)].filter(Boolean).join(" ");
    const name = text(properties.name) || street;
    if (!name) continue;
    const city = text(properties.city, 50) || "Hyderabad";
    const postcode = text(properties.postcode, 10);
    const pincode = /^[1-9]\d{5}$/.test(postcode) ? postcode : "";
    const addressParts = [name, street, text(properties.locality) || text(properties.district), city, pincode].filter(Boolean);
    const compact: string[] = [];
    for (const part of [...new Set(addressParts)]) {
      // Saved-address summaries need the chosen place name, not just its city.
      // Add complete address parts that fit instead of cutting a street in half.
      if ([...compact, part].join(", ").length <= 130) compact.push(part);
    }
    const address = compact.join(", ") || name;
    const key = `${name.toLowerCase()}:${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Road/locality results represent an area, not a verified door or building.
    const area = ["street", "locality", "district", "city", "county", "state", "country"].includes(text(properties.type))
      || ["place", "boundary", "highway"].includes(text(properties.osm_key));
    results.push({ id: `photon:${latitude}:${longitude}:${results.length}`, name, address, city, pincode, latitude, longitude,
      kind: area ? "area" : "place" });
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}

export function localAddressResults(query: string): LocationSuggestion[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return DELIVERY_LOCALITIES.filter((item) => terms.every((term) => `${item.name} ${item.pincode} Hyderabad`.toLowerCase().includes(term)))
    .map((item) => ({ id: `local:${item.id}`, name: item.name, address: `${item.name}, Hyderabad, ${item.pincode}`, city: "Hyderabad",
      pincode: item.pincode, latitude: item.latitude, longitude: item.longitude, localityId: item.id, kind: "area" }));
}

async function readResponse(response: Response) {
  if (!response.ok || !response.body) throw new Error("Place search unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Place-search response exceeded its limit");
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}

export async function searchAddresses(query: string, signal?: AbortSignal): Promise<AddressSearchResult> {
  const normalized = addressQuerySchema.parse(query);
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ q: normalized, limit: String(MAX_RESULTS), lat: "17.45", lon: "78.38",
    bbox: BOUNDS.join(","), lang: "en" }).toString();
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 5000);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "DeccanKitchen/1.0 (https://direct-order-platform.onrender.com)" },
      cache: "no-store", redirect: "error", signal: controller.signal });
    const results = parsePhotonResults(await readResponse(response));
    if (results.length) return { results, attribution: ATTRIBUTION, provider: "photon" };
    const local = localAddressResults(normalized);
    return { results: local, attribution: local.length ? "Deccan Kitchen supported areas" : ATTRIBUTION,
      provider: local.length ? "local" : "photon",
      warning: local.length ? "No matching map places. These suggestions use supported area centres; add your full address next."
        : "No matching places in Hyderabad. Try a nearby landmark or area." };
  } catch {
    if (signal?.aborted) throw new Error("Address search cancelled");
    return { results: localAddressResults(normalized), attribution: "Deccan Kitchen supported areas", provider: "local",
      warning: "Map search is temporarily unavailable. You can try again or search Kondapur, Gachibowli or Kukatpally to choose a supported area centre." };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
