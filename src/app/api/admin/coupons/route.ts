import { requireUser, rateLimit } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { couponSchema, couponUpdateSchema } from "@/lib/coupon-validation";
import { listCoupons, saveCoupon } from "@/lib/coupons";

export async function GET() {
  return api(async () => listCoupons(await requireUser(["ADMIN"])));
}
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser(["ADMIN"]);
    const input = await body(request, couponSchema);
    await rateLimit(`coupons:${user.id}`, 60);
    return saveCoupon(user, input);
  }, 201);
}
export async function PATCH(request: Request) {
  return api(async () => {
    const user = await requireUser(["ADMIN"]);
    const { version, ...input } = await body(request, couponUpdateSchema);
    await rateLimit(`coupons:${user.id}`, 60);
    return saveCoupon(user, input, version);
  });
}
