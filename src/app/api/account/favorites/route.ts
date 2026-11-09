import { z } from "zod";
import { rateLimit, requireUser } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { setFavorite } from "@/lib/customer-profile";

export async function PUT(request: Request) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    const input = await body(request, z.object({ itemId: z.string().min(1).max(80), saved: z.boolean() }).strict());
    await rateLimit(`favorites:${user.id}`, 120);
    return setFavorite(user.id, input.itemId, input.saved);
  });
}
