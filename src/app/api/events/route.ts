import { db } from "@/lib/db";
import {
  currentUser,
  staffOutlet,
  AppError,
  COOKIE,
  tokenHash,
} from "@/lib/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams,
    scope = params.get("scope") || "menu",
    outlet = params.get("outlet") || "kondapur";
  let user: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    if (!["menu", "orders", "kitchen"].includes(scope))
      throw new AppError(400, "Invalid stream");
    if (scope !== "menu") {
      user = await currentUser();
      if (!user) throw new AppError(401, "Please sign in");
      if (scope === "kitchen") {
        if (user.role === "CUSTOMER")
          throw new AppError(403, "Staff access required");
        staffOutlet(user, outlet);
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: error instanceof AppError ? error.status : 503 },
    );
  }
  // Capture the cookie in the request context; stream timers only query the session.
  const token = (await cookies()).get(COOKIE)?.value;
  const sessionId = token ? tokenHash(token) : null;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let ended = false,
    busy = false,
    last = "";
  const stream = new ReadableStream({
    start(controller) {
      const finish = () => {
        if (ended) return;
        ended = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {}
      };
      const tick = async () => {
        if (ended || busy) return;
        busy = true;
        try {
          if (scope !== "menu") {
            const session = sessionId
              ? await db.session.findUnique({
                  where: { id: sessionId },
                  include: { user: true },
                })
              : null;
            if (
              !session ||
              session.expiresAt < new Date() ||
              session.userId !== user?.id
            ) {
              finish();
              return;
            }
            if (
              scope === "kitchen" &&
              (session.user.role === "CUSTOMER" ||
                (session.user.role !== "ADMIN" &&
                  session.user.outletId !== outlet))
            ) {
              finish();
              return;
            }
          }
          let revision: string;
          if (scope === "menu") {
            const [items, stock, kitchen] = await Promise.all([
              db.menuItem.aggregate({
                _max: { updatedAt: true },
                _count: true,
              }),
              db.availability.aggregate({
                where: { outletId: outlet },
                _max: { updatedAt: true },
              }),
              db.outlet.findUnique({
                where: { id: outlet },
                select: { updatedAt: true },
              }),
            ]);
            revision = JSON.stringify([
              items._max.updatedAt,
              items._count,
              stock._max.updatedAt,
              kitchen?.updatedAt,
            ]);
          } else {
            const where =
              scope === "orders" ? { userId: user!.id } : { outletId: outlet };
            const orders = await db.order.aggregate({
              where,
              _max: { updatedAt: true },
              _count: true,
            });
            revision = JSON.stringify(orders);
          }
          if (ended) return;
          if (revision !== last) {
            last = revision;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ revision })}\n\n`),
            );
          } else controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          finish();
        } finally {
          busy = false;
        }
      };
      request.signal.addEventListener("abort", finish, { once: true });
      if (request.signal.aborted) {
        finish();
        return;
      }
      timer = setInterval(() => void tick(), 3000);
      void tick();
    },
    cancel() {
      ended = true;
      clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
