import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, requireUser, rateLimit } from "../src/lib/auth";
import { getOrder } from "../src/lib/orders";
import { createReceiptPdf } from "../src/lib/receipt";
import { db } from "../src/lib/db";
import { GET } from "../src/app/api/orders/[id]/receipt/route";
import { receiptFixture } from "./fixtures/receipt";

vi.mock("../src/lib/auth", async (original) => ({
  ...await original<typeof import("../src/lib/auth")>(), requireUser: vi.fn(), rateLimit: vi.fn(),
}));
vi.mock("../src/lib/orders", () => ({ getOrder: vi.fn() }));
vi.mock("../src/lib/db", () => ({ db: { payment: { findMany: vi.fn() } } }));
vi.mock("../src/lib/receipt", async (original) => ({
  ...await original<typeof import("../src/lib/receipt")>(), createReceiptPdf: vi.fn(),
}));
const request = new Request("http://127.0.0.1:3000/api/orders/order-1/receipt");
const context = () => ({ params: Promise.resolve({ id: "order-1" }) });
beforeEach(() => vi.clearAllMocks());

describe("receipt download access", () => {
  it("requires a session before generating or accessing order data", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new AppError(401, "Please sign in to continue"));
    const response = await GET(request, context());
    expect(response.status).toBe(401);
    expect(getOrder).not.toHaveBeenCalled();
    expect(createReceiptPdf).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("honours the existing customer and outlet access check before rendering", async () => {
    const user = { id: "someone-else", role: "CUSTOMER" } as Awaited<ReturnType<typeof requireUser>>;
    vi.mocked(requireUser).mockResolvedValueOnce(user);
    vi.mocked(getOrder).mockRejectedValueOnce(new AppError(404, "Order not found"));
    const response = await GET(request, context());
    expect(getOrder).toHaveBeenCalledWith("order-1", user);
    expect(response.status).toBe(404);
    expect(createReceiptPdf).not.toHaveBeenCalled();
  });
  it("returns an authenticated attachment and never permits shared caching", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce({ id: "owner", role: "CUSTOMER" } as Awaited<ReturnType<typeof requireUser>>);
    vi.mocked(getOrder).mockResolvedValueOnce({ ...receiptFixture(), id: "order-1" } as Awaited<ReturnType<typeof getOrder>>);
    vi.mocked(db.payment.findMany).mockResolvedValueOnce(receiptFixture().payments as Awaited<ReturnType<typeof db.payment.findMany>>);
    vi.mocked(createReceiptPdf).mockResolvedValueOnce(new TextEncoder().encode("%PDF-1.7"));
    const response = await GET(request, context());
    expect(response.status).toBe(200);
    expect(rateLimit).toHaveBeenCalledWith("receipt:owner", 30);
    expect(db.payment.findMany).toHaveBeenCalledWith({ where: { orderId: "order-1", OR: [
      { status: { in: ["PAID", "REFUND_PENDING", "REFUNDED"] } }, { refundReviewRequired: true },
    ] }, orderBy: { createdAt: "asc" } });
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="receipt-WEB-RECEIPT-2026.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(await response.text()).toBe("%PDF-1.7");
  });
  it("returns an actionable private error instead of a misleading PDF during refund review", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce({ id: "owner", role: "CUSTOMER" } as Awaited<ReturnType<typeof requireUser>>);
    vi.mocked(getOrder).mockResolvedValueOnce({ ...receiptFixture(), id: "order-1" } as Awaited<ReturnType<typeof getOrder>>);
    vi.mocked(db.payment.findMany).mockResolvedValueOnce([]);
    vi.mocked(createReceiptPdf).mockRejectedValueOnce(new AppError(409, "A refund needs reconciliation before this receipt can be downloaded. Please contact the outlet with your order number."));
    const response = await GET(request, context());
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect((await response.json()).error).toContain("refund needs reconciliation");
  });
});
