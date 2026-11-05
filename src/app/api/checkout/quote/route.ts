import { api, body } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { serializable } from "@/lib/db";
import { quoteSchema } from "@/lib/validation";
import { quoteCheckout } from "@/lib/orders";

export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    const input = await body(request, quoteSchema);
    return serializable((tx) => quoteCheckout(tx, input, user.id));
  });
}
