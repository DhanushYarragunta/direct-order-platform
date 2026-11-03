import { api, body } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { checkoutSchema } from "@/lib/validation";
import { checkout, orderInclude } from "@/lib/orders";
import { db } from "@/lib/db";
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    return checkout(await body(request, checkoutSchema), user);
  }, 201);
}
export async function GET() {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    return {
      orders: await db.order.findMany({
        where: { userId: user.id },
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    };
  });
}
