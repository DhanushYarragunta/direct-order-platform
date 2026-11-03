import { api, body } from "@/lib/http";
import { requireUser, rateLimit } from "@/lib/auth";
import { payOrder } from "@/lib/orders";
import { paymentSchema } from "@/lib/validation";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    await rateLimit(`payment:${user.id}`, 30);
    return payOrder(
      (await context.params).id,
      await body(request, paymentSchema),
      user,
    );
  });
}
