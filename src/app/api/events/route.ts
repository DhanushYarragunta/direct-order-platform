import { db } from "@/lib/db";
import { currentUser, staffOutlet, AppError, COOKIE, tokenHash } from "@/lib/auth";
import { eventHub } from "@/lib/events";
import type { StreamAudience } from "@/lib/event-hub";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") || "menu", outletId = params.get("outlet") || "kondapur";
  let user: Awaited<ReturnType<typeof currentUser>> = null;
  try {
    if (!["menu", "orders", "kitchen"].includes(scope)) throw new AppError(400, "Invalid stream");
    if (scope !== "menu") {
      user = await currentUser();
      if (!user) throw new AppError(401, "Please sign in");
      if (scope === "kitchen") {
        if (user.role === "CUSTOMER") throw new AppError(403, "Staff access required");
        staffOutlet(user, outletId);
      }
    }
    if (scope !== "orders" && !await db.outlet.findUnique({ where: { id: outletId }, select: { id: true } })) {
      throw new AppError(404, "Outlet not found");
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof AppError ? error.message : "Live updates are temporarily unavailable" }, {
      status: error instanceof AppError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const token = (await cookies()).get(COOKIE)?.value;
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let detach: (() => void) | undefined;
  let ended = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = () => {
        if (ended) return;
        ended = true;
        unsubscribe?.();
        detach?.();
        try { controller.close(); } catch {}
      };
      request.signal.addEventListener("abort", finish, { once: true });
      detach = () => request.signal.removeEventListener("abort", finish);
      if (request.signal.aborted) { finish(); return; }
      unsubscribe = eventHub.subscribe({ scope: scope as StreamAudience["scope"], outletId, userId: user?.id }, {
        sessionId: token ? tokenHash(token) : null,
        close: finish,
        send(event, data) {
          if (ended) return;
          // Close readers that stopped consuming rather than buffer forever.
          if ((controller.desiredSize ?? 1) < -4) { finish(); return; }
          controller.enqueue(encoder.encode(`${event === "message" ? "" : `event: ${event}\n`}data: ${JSON.stringify(data)}\n\n`));
        },
      });
    },
    cancel() { ended = true; unsubscribe?.(); detach?.(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive", "X-Accel-Buffering": "no",
  } });
}
