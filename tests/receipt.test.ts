import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createReceiptPdf, receiptFilename, receiptSummary } from "../src/lib/receipt";
import { receiptFixture } from "./fixtures/receipt";

describe("payment receipts", () => {
  it("refuses unconfirmed payments and money that does not reconcile", () => {
    expect(() => receiptSummary(receiptFixture({ paymentStatus: "PENDING" }))).toThrow("confirmed");
    expect(() => receiptSummary(receiptFixture({ payments: [] }))).toThrow("confirmed");
    expect(() => receiptSummary(receiptFixture({ totalPaise: 70000 }))).toThrow("reconciliation");
    expect(() => receiptSummary(receiptFixture({ subtotalPaise: 65000 }))).toThrow("reconciliation");
    expect(() => receiptSummary(receiptFixture({ gstPaise: 999999 }))).toThrow("reconciliation");
  });
  it("separates pending refunds from money already returned, including duplicate captures", () => {
    const order = receiptFixture();
    order.payments.push({ ...order.payments[0], id: "duplicate", status: "REFUND_PENDING" });
    expect(receiptSummary(order)).toMatchObject({ capturedPaise: 130000, refundedPaise: 0,
      pendingRefundPaise: 65000, netCollectedPaise: 130000, demo: false });
    order.payments[1].status = "REFUNDED";
    expect(receiptSummary(order)).toMatchObject({ capturedPaise: 130000, refundedPaise: 65000,
      pendingRefundPaise: 0, netCollectedPaise: 65000 });
  });
  it("blocks inaccurate PDFs while an external partial refund needs reconciliation", async () => {
    const order = receiptFixture();
    order.payments[0].refundReviewRequired = true;
    order.payments[0].providerRefundedPaise = 10000;
    expect(() => receiptSummary(order)).toThrow("refund needs reconciliation");
    await expect(createReceiptPdf(order)).rejects.toThrow("contact the outlet");
  });
  it("uses recorded demo providers and removes unsafe filename characters", () => {
    const order = receiptFixture();
    order.payments[0].provider = "demo";
    expect(receiptSummary(order).demo).toBe(true);
    expect(receiptFilename('WEB-1"\r\n/../.png')).toBe("receipt-WEB-1png.pdf");
    expect(receiptFilename("../")).toBe("receipt-order.pdf");
  });
  it("keeps Razorpay test mode on historical receipts after live configuration changes", async () => {
    const order = receiptFixture();
    expect(receiptSummary(order)).toMatchObject({ demo: false, testMode: false });
    order.payments[0].testMode = true;
    expect(receiptSummary(order)).toMatchObject({ demo: false, testMode: true });
    const pdf = await PDFDocument.load(await createReceiptPdf(order));
    expect(pdf.getPageCount()).toBe(1);
    order.payments.push({ ...order.payments[0], id: "live", testMode: false });
    expect(() => receiptSummary(order)).toThrow("Mixed test and live");
  });
  it("creates an actual A4 PDF containing a Unicode delivery address", async () => {
    const bytes = await createReceiptPdf(receiptFixture());
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("Payment receipt - WEB-RECEIPT-2026");
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
  });
  it("paginates large orders and long unbroken names without dropping line items", async () => {
    const base = receiptFixture();
    const lines = Array.from({ length: 30 }, (_, index) => ({ ...base.lines[0],
      name: `${index + 1}. ${"VeryLongDishName".repeat(12)} మటన్ బిర్యానీ`, quantity: 1, unitPaise: 10000,
      addOns: [{ name: "सलान और रायता" }, { name: "A slowly cooked extra accompaniment with a long description" }],
    }));
    const bytes = await createReceiptPdf(receiptFixture({ lines, subtotalPaise: 300000,
      couponDiscountPaise: 0, couponCode: null, redeemedPoints: 0, deliveryFeePaise: 0,
      totalPaise: 300000, gstPaise: 14286, payments: [{ ...base.payments[0], amountPaise: 300000 }],
    }));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(pdf.getPageCount()).toBeLessThan(12);
    expect(pdf.getPages().every((page) => page.getHeight() === 841.89)).toBe(true);
  });
});
