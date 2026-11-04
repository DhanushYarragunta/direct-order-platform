import { requireUser, rateLimit } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { cateringSchema } from "@/lib/catering-validation";
import { createCatering, listCatering } from "@/lib/catering";

export async function GET(request: Request) {
  return api(async () =>
    listCatering(
      await requireUser(["CUSTOMER"]),
      new URL(request.url).searchParams,
    ),
  );
}
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    const input = await body(request, cateringSchema);
    await rateLimit(`catering:${user.id}`, 20);
    return createCatering(input, user);
  }, 201);
}
