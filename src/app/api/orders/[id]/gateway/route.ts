import { z } from "zod";
import { api, body } from "@/lib/http";
import { requireUser, rateLimit } from "@/lib/auth";
import { initiateGatewayPayment } from "@/lib/gateway-payments";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    await body(request, z.object({}).strict());
    await rateLimit(`gateway:${user.id}`, 30);
    return initiateGatewayPayment((await context.params).id, user);
  });
}
