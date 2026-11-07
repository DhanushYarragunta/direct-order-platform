import { api, body } from "@/lib/http";
import { requireUser, rateLimit } from "@/lib/auth";
import { verifyGatewayPayment } from "@/lib/gateway-payments";
import { gatewayVerifySchema } from "@/lib/razorpay";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    await rateLimit(`gateway-verify:${user.id}`, 40);
    return verifyGatewayPayment((await context.params).id, await body(request, gatewayVerifySchema), user);
  });
}
