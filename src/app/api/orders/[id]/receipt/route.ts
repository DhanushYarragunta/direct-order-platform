import { requireUser, rateLimit } from "@/lib/auth";
import { api } from "@/lib/http";
import { db } from "@/lib/db";
import { getOrder } from "@/lib/orders";
import { createReceiptPdf, receiptFilename } from "@/lib/receipt";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await rateLimit(`receipt:${user.id}`, 30);
    const order = await getOrder((await context.params).id, user);
    // The regular order screen limits payment history. Receipts must account for
    // every confirmed capture/refund, including an extra charge refunded later.
    const payments = await db.payment.findMany({
      where: { orderId: order.id, OR: [
        { status: { in: ["PAID", "REFUND_PENDING", "REFUNDED"] } }, { refundReviewRequired: true },
      ] },
      orderBy: { createdAt: "asc" },
    });
    const pdf = await createReceiptPdf({ ...order, payments });
    return new Response(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receiptFilename(order.number)}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    const response = await api(async () => { throw error; });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Vary", "Cookie");
    return response;
  }
}
