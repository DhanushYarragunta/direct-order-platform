import { beforeEach, expect, it, vi } from "vitest";
import { AppError, rateLimit } from "../src/lib/auth";
import { searchAddresses } from "../src/lib/address-search";
import { GET } from "../src/app/api/locations/search/route";

vi.mock("../src/lib/auth", async (original) => ({
  ...await original<typeof import("../src/lib/auth")>(), rateLimit: vi.fn(),
}));
vi.mock("../src/lib/address-search", async (original) => ({
  ...await original<typeof import("../src/lib/address-search")>(), searchAddresses: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue(undefined);
  vi.mocked(searchAddresses).mockResolvedValue({ results: [], provider: "photon", attribution: "OpenStreetMap" });
});
const request = (search = "q=Kondapur", headers?: HeadersInit) => new Request(`http://127.0.0.1:3000/api/locations/search?${search}`, { headers });

it("bounds anonymous and total provider traffic without persisting the query in rate-limit keys", async () => {
  const response = await GET(request("q=Kondapur", { "x-forwarded-for": "203.0.113.1, 127.0.0.1" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(vi.mocked(rateLimit).mock.calls).toEqual([["address-search:client:203.0.113.1", 60], ["address-search:global", 300]]);
  expect(searchAddresses).toHaveBeenCalledWith("Kondapur", expect.any(AbortSignal));
});
it.each(["q=ab", "q=Kondapur&q=Gachibowli", "q=Kondapur&url=https://untrusted.example", "q=" ])
  ("rejects unsupported queries before contacting the provider: %s", async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(searchAddresses).not.toHaveBeenCalled();
  });
it("rejects cross-site requests before consuming provider capacity", async () => {
  const response = await GET(request("q=Kondapur", { "sec-fetch-site": "cross-site" }));
  expect(response.status).toBe(403);
  expect(searchAddresses).not.toHaveBeenCalled();
});
it("never contacts the provider once the route limit is reached", async () => {
  vi.mocked(rateLimit).mockRejectedValueOnce(new AppError(429, "Too many attempts. Please try again in 10 minutes."));
  const response = await GET(request());
  expect(response.status).toBe(429);
  expect(searchAddresses).not.toHaveBeenCalled();
});
