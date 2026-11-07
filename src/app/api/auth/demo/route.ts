import { z } from "zod";
import { api, body } from "@/lib/http";
import { AppError, createSession } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(request: Request) {
  return api(async () => {
    if (process.env.DEMO_MODE !== "true") throw new AppError(404, "Not found");
    const { account } = await body(
      request,
      z
        .object({
          account: z.enum([
            "customer",
            "admin",
            "manager",
            "kitchen-kondapur",
            "kitchen-gachibowli",
            "kitchen-kukatpally",
          ]),
        })
        .strict(),
    );
    const user = await db.user.findUnique({ where: { id: `demo-${account}` } });
    if (!user || user.deletedAt) throw new AppError(503, "This demo account is unavailable");
    await createSession(user.id, user.passwordHash);
    return { ok: true, role: user.role };
  });
}
