import { afterEach, describe, expect, it, vi } from "vitest";
import { addressQuerySchema, localAddressResults, parsePhotonResults, searchAddresses } from "../src/lib/address-search";

function feature(properties: Record<string, unknown> = {}, coordinates: unknown[] = [78.3730556, 17.4587912]) {
  return { type: "Feature", geometry: { type: "Point", coordinates }, properties: {
    name: "Kondapur", type: "locality", osm_key: "place", countrycode: "IN", postcode: "500084", ...properties,
  } };
}
function mockResponse(features: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "FeatureCollection", features })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("place response validation", () => {
  it("keeps selected coordinates and distinguishes a neighbourhood from a building", () => {
    const results = parsePhotonResults({ features: [feature(), feature({ name: "Kondapur RTA Office", type: "house", osm_key: "office",
      street: "Hafeezpet Road", locality: "Marthanda Nagar" }, [78.365155, 17.472253])] });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ name: "Kondapur", latitude: 17.4587912, longitude: 78.3730556, pincode: "500084", kind: "area" });
    expect(results[1]).toMatchObject({ name: "Kondapur RTA Office", address: "Kondapur RTA Office, Hafeezpet Road, Marthanda Nagar, Hyderabad, 500084", kind: "place" });
    expect(results[0].address).toBe("Kondapur, Hyderabad, 500084");
    expect(results[0].localityId).toBeUndefined();
  });
  it("rejects malformed geometries and results outside Hyderabad even if the provider returns them", () => {
    const results = parsePhotonResults({ features: [null, feature({}, ["78.3", 17.4]), feature({}, [NaN, 17.4]),
      feature({}, [77.2, 28.6]), feature({ countrycode: "DE" }), feature({ name: "", street: null }),
      { ...feature(), geometry: { type: "Polygon", coordinates: [78.3, 17.4] } }, feature()] });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Kondapur");
    expect(() => parsePhotonResults({ features: "bad" })).toThrow("Invalid place-search response");
  });
  it("deduplicates matches, caps results and bounds address fields", () => {
    const results = parsePhotonResults({ features: [feature(), feature(), ...Array.from({ length: 10 }, (_, index) =>
      feature({ name: `Building ${index}`, city: "x".repeat(200), locality: "y".repeat(200), street: "z".repeat(200), postcode: "invalid" }, [78.35 + index / 1000, 17.45]))] });
    expect(results).toHaveLength(6);
    expect(results.every((result) => result.address.length <= 130 && result.city.length <= 50)).toBe(true);
    expect(results[1].pincode).toBe("");
  });
});

describe("address search and honest fallback", () => {
  it("uses a fixed HTTPS endpoint with Hyderabad bounds, six results and no cache", async () => {
    const fetchMock = mockResponse([feature()]);
    const result = await searchAddresses(" Kondapur   ");
    expect(result.provider).toBe("photon");
    expect(result.attribution).toContain("OpenStreetMap");
    expect(result.warning).toBeUndefined();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.origin).toBe("https://photon.komoot.io");
    expect(url.pathname).toBe("/api/");
    expect(url.searchParams.get("q")).toBe("Kondapur");
    expect(url.searchParams.get("bbox")).toBe("78.05,17.15,78.75,17.7");
    expect(url.searchParams.get("limit")).toBe("6");
    expect(options).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("uses only matching curated area centres when map search fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider credentials or internal detail")));
    const result = await searchAddresses("Kukatpally 500072");
    expect(result.provider).toBe("local");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ name: "Kukatpally centre", localityId: "kukatpally", kind: "area", latitude: 17.4948, longitude: 78.3996 });
    expect(result.warning).toContain("temporarily unavailable");
    expect(JSON.stringify(result)).not.toContain("provider credentials");
  });
  it("never invents an address or uses an unrelated locality for an unknown street", async () => {
    mockResponse([]);
    const result = await searchAddresses("Imaginary Street 985");
    expect(result).toMatchObject({ provider: "photon", results: [], warning: "No matching places in Hyderabad. Try a nearby landmark or area." });
    expect(localAddressResults("Kondapur Imaginary Street")).toEqual([]);
  });
  it("labels curated suggestions when the provider has no matching places", async () => {
    mockResponse([]);
    const result = await searchAddresses("Gachibowli");
    expect(result.provider).toBe("local");
    expect(result.warning).toContain("supported area centres");
    expect(result.results[0].localityId).toBe("gachibowli");
  });
  it.each([new Response("not-json"), new Response("{}"), new Response("busy", { status: 429 }), new Response("x".repeat(128_001))])
    ("handles unusable or oversized provider responses with a bounded fallback", async (response) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      const result = await searchAddresses("Kondapur");
      expect(result.provider).toBe("local");
      expect(result.results[0].kind).toBe("area");
      expect(result.warning).toContain("temporarily unavailable");
    });
  it("aborts a slow provider after five seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const pending = searchAddresses("Kondapur");
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).provider).toBe("local");
  });
  it("cancels abandoned queries instead of converting them into new suggestions", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const pending = searchAddresses("Kondapur", controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("Address search cancelled");
  });
  it("rejects too-short, overlong and control-character queries before making a provider request", async () => {
    const fetchMock = mockResponse([]);
    for (const query of [" ", "ab", "x".repeat(121), "bad\u0000query"]) {
      expect(addressQuerySchema.safeParse(query).success).toBe(false);
      await expect(searchAddresses(query)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
