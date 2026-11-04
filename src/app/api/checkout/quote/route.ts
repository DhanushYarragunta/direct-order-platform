import { api, body } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { serializable } from "@/lib/db";
import { quoteSchema } from "@/lib/validation";
import { priceCheckoutCart } from "@/lib/orders";
import { quoteRewards } from "@/lib/rewards";

export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    const input = await body(request, quoteSchema);
    return serializable(async (tx) => {
      const priced = await priceCheckoutCart(tx, input);
      return quoteRewards(tx, user.id, priced.totalPaise, input.couponCode, 0, input.useLoyalty);
    });
  });
}
