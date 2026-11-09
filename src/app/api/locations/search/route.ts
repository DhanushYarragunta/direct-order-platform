import { AppError, rateLimit } from "@/lib/auth";
import { api } from "@/lib/http";
import { addressQuerySchema, searchAddresses } from "@/lib/address-search";

export async function GET(request: Request) {
  return api(async () => {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new AppError(403, "Open address search from this website");
    const parameters = new URL(request.url).searchParams;
    if ([...parameters.keys()].some((key) => key !== "q") || parameters.getAll("q").length !== 1)
      throw new AppError(400, "Enter one area, building or landmark to search");
    const query = addressQuerySchema.parse(parameters.get("q") || "");
    // Hashing inside rateLimit keeps network addresses out of stored keys. The
    // global cap also bounds provider traffic if a client spoofs forwarding data.
    const client = (request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 80);
    await rateLimit(`address-search:client:${client}`, 60);
    await rateLimit("address-search:global", 300);
    return searchAddresses(query, request.signal);
  });
}
