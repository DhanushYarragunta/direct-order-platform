import { readFile } from "node:fs/promises";
import path from "node:path";
import "regenerator-runtime/runtime.js";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { AppError } from "./auth";

type ReceiptPayment = {
  id: string;
  method: string;
  status: string;
  amountPaise: number;
  provider?: string;
  providerPaymentId?: string | null;
  providerRefundId?: string | null;
  refundReviewRequired?: boolean;
  providerRefundedPaise?: number;
  testMode?: boolean;
  createdAt: Date | string;
};

export type ReceiptOrder = {
  number: string;
  status: string;
  paymentStatus: string;
  createdAt: Date | string;
  fulfillment: string;
  address: string;
  phone: string;
  subtotalPaise: number;
  couponCode: string | null;
  couponDiscountPaise: number;
  redeemedPoints: number;
  deliveryFeePaise: number;
  totalPaise: number;
  gstPaise: number;
  outlet: { name: string; address: string; city: string; fssai: string; fssaiVerified: boolean };
  lines: { name: string; portion: string; quantity: number; unitPaise: number; addOns: unknown }[];
  payments: ReceiptPayment[];
};

const paidStates = new Set(["PAID", "REFUND_PENDING", "REFUNDED"]);
const isTestPayment = (payment: ReceiptPayment) => !payment.provider || payment.provider === "demo" || payment.testMode !== false;
const rupees = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value / 100);
const dateLabel = (value: Date | string) => new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true,
}).format(new Date(value)) + " IST";

/** All receipt values come from persisted order/payment records, never browser totals. */
export function receiptSummary(order: ReceiptOrder) {
  if (order.payments.some((payment) => payment.refundReviewRequired))
    throw new AppError(409, "A refund needs reconciliation before this receipt can be downloaded. Please contact the outlet with your order number.");
  const payments = order.payments.filter((payment) => paidStates.has(payment.status));
  if (!paidStates.has(order.paymentStatus) || !payments.length)
    throw new AppError(409, "A receipt is available after payment has been confirmed.");
  if (payments.some(isTestPayment) && !payments.every(isTestPayment))
    throw new AppError(409, "Mixed test and live payment records need reconciliation before a receipt can be downloaded.");
  const amounts = [order.subtotalPaise, order.couponDiscountPaise, order.redeemedPoints,
    order.deliveryFeePaise, order.totalPaise, order.gstPaise, ...payments.map((payment) => payment.amountPaise)];
  const itemTotal = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPaise, 0);
  if (amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0) ||
      !order.lines.length || order.lines.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
        !Number.isSafeInteger(line.unitPaise) || line.unitPaise < 0) ||
      itemTotal !== order.subtotalPaise ||
      order.subtotalPaise - order.couponDiscountPaise - order.redeemedPoints * 100 + order.deliveryFeePaise !== order.totalPaise ||
      order.gstPaise > order.totalPaise)
    throw new AppError(409, "This receipt needs an order reconciliation. Please contact the outlet.");
  const capturedPaise = payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
  const refundedPaise = payments.filter((payment) => payment.status === "REFUNDED")
    .reduce((sum, payment) => sum + payment.amountPaise, 0);
  const pendingRefundPaise = payments.filter((payment) => payment.status === "REFUND_PENDING")
    .reduce((sum, payment) => sum + payment.amountPaise, 0);
  return { payments, capturedPaise, refundedPaise, pendingRefundPaise,
    netCollectedPaise: capturedPaise - refundedPaise,
    demo: payments.every((payment) => !payment.provider || payment.provider === "demo"),
    testMode: payments.every(isTestPayment),
  };
}

export function receiptFilename(number: string) {
  return `receipt-${number.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 90) || "order"}.pdf`;
}

// Packaged with the server; no remote font fetch or customer data sent to a PDF service.
const fontFiles = ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf", "NotoSansTelugu-Regular.ttf", "NotoSansDevanagari-Regular.ttf"];
let fontBytes: Promise<Buffer[]> | undefined;
function loadFonts() {
  return fontBytes ??= Promise.all(fontFiles.map((file) =>
    readFile(path.join(process.cwd(), "src", "assets", "fonts", file)))).catch((error) => {
    fontBytes = undefined;
    throw error;
  });
}

/** A real PDF with embedded Unicode fonts, repeating table headings and page numbers. */
export async function createReceiptPdf(order: ReceiptOrder): Promise<Uint8Array> {
  const summary = receiptSummary(order);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regular, bold, telugu, devanagari] = await Promise.all((await loadFonts())
    .map((bytes) => document.embedFont(bytes, { subset: true })));
  document.setTitle(`Payment receipt - ${order.number}`);
  document.setAuthor("Deccan Kitchen & Co.");
  document.setCreator("Deccan Kitchen & Co. ordering service");
  document.setSubject("Order summary and payment acknowledgement");
  document.setLanguage("en-IN");
  const width = 595.28, height = 841.89, margin = 46, right = width - margin;
  const ink = rgb(0.12, 0.16, 0.16), muted = rgb(0.37, 0.42, 0.42);
  const amber = rgb(0.79, 0.48, 0.08), pale = rgb(0.96, 0.96, 0.94);
  const lineColor = rgb(0.86, 0.88, 0.87);
  const fonts = [regular, telugu, devanagari];
  const charsets = new Map<PDFFont, Set<number>>([regular, bold, telugu, devanagari]
    .map((font) => [font, new Set(font.getCharacterSet())]));
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  type Run = { value: string; font: PDFFont };
  function runs(value: string, strong = false): Run[] {
    const output: Run[] = [];
    const candidates = strong ? [bold, telugu, devanagari] : fonts;
    // Preserve grapheme clusters so Indian names retain their combining marks.
    for (const { segment } of segmenter.segment(value.replace(/[\u0000-\u001f\u007f]/g, " "))) {
      const font = candidates.find((candidate) => [...segment].every((character) =>
        charsets.get(candidate)!.has(character.codePointAt(0)!) || /[\u200c\u200d]/u.test(character)));
      const resolved = font || (strong ? bold : regular);
      const text = font ? segment : "?";
      const previous = output.at(-1);
      if (previous?.font === resolved) previous.value += text;
      else output.push({ value: text, font: resolved });
    }
    return output;
  }
  const measure = (value: string, size: number, strong = false) =>
    runs(value, strong).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.value, size), 0);
  let page: PDFPage, y: number;
  function text(value: string, x: number, baseline: number, size = 10, strong = false, color = ink) {
    for (const run of runs(value, strong)) {
      page.drawText(run.value, { x, y: baseline, size, font: run.font, color });
      x += run.font.widthOfTextAtSize(run.value, size);
    }
  }
  function aligned(value: string, x: number, baseline: number, size = 10, strong = false, color = ink) {
    text(value, x - measure(value, size, strong), baseline, size, strong, color);
  }
  function wrap(value: string, maxWidth: number, size = 10, strong = false) {
    const lines: string[] = [];
    for (const paragraph of value.split(/\r?\n/)) {
      let current = "";
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        if (measure(current ? `${current} ${word}` : word, size, strong) <= maxWidth) {
          current = current ? `${current} ${word}` : word;
          continue;
        }
        if (current) { lines.push(current); current = ""; }
        // A long address/reference without whitespace must never overflow a column.
        for (const { segment } of segmenter.segment(word)) {
          if (current && measure(current + segment, size, strong) > maxWidth) {
            lines.push(current); current = "";
          }
          current += segment;
        }
      }
      lines.push(current);
    }
    return lines;
  }
  function newPage(continued = true) {
    page = document.addPage([width, height]);
    y = height - margin;
    text("DECCAN KITCHEN & CO.", margin, y, 15, true);
    aligned("PAYMENT RECEIPT", right, y + 1, 9, true, muted);
    y -= 20;
    text(continued ? `${order.number} - continued` : "Direct ordering", margin, y, 9, false, muted);
    page.drawLine({ start: { x: margin, y: y - 13 }, end: { x: right, y: y - 13 }, thickness: 2, color: amber });
    y -= 38;
  }
  function ensure(space: number) {
    if (y - space < 66) newPage();
  }
  function paragraph(value: string, size = 9, color = muted, maxWidth = right - margin) {
    for (const line of wrap(value, maxWidth, size)) {
      ensure(size + 5);
      text(line, margin, y, size, false, color);
      y -= size + 5;
    }
  }
  function section(label: string) {
    ensure(45); y -= 12;
    text(label.toUpperCase(), margin, y, 9, true, muted); y -= 20;
  }
  newPage(false);
  const label = order.paymentStatus === "REFUNDED" ? "Refunded" :
    order.paymentStatus === "REFUND_PENDING" ? "Refund in progress" : "Paid";
  const statusColor = order.paymentStatus === "PAID" ? rgb(0.1, 0.4, 0.28) : amber;
  const pillWidth = measure(label, 10, true) + 22;
  page!.drawRectangle({ x: right - pillWidth, y: y! - 5, width: pillWidth, height: 24, color: pale });
  aligned(label, right - 11, y! + 2, 10, true, statusColor);
  // Keep a long order reference away from the status pill.
  for (const line of wrap(order.number, right - margin - pillWidth - 14, 18, true)) {
    text(line, margin, y!, 18, true); y! -= 25;
  }
  paragraph(`Ordered ${dateLabel(order.createdAt)}`, 9);
  y! -= 4;
  if (summary.demo) {
    paragraph("DEMO RECEIPT - Simulated payment. No money was charged or refunded.", 9, amber);
    y! -= 4;
  } else if (summary.testMode) {
    paragraph("TEST RECEIPT - Razorpay test payment. No money was collected or refunded.", 9, amber);
    y! -= 4;
  }
  const outletLines = [order.outlet.name, order.outlet.address, `${order.outlet.city} - ${
    order.outlet.fssaiVerified ? "FSSAI" : "Demo FSSAI (not a valid licence)"}: ${order.outlet.fssai}`];
  for (const line of outletLines) paragraph(line, 9);
  section(order.fulfillment === "delivery" ? "Delivery details" : "Pickup details");
  paragraph(order.fulfillment === "delivery" ? order.address : `Collect from ${order.outlet.name}`, 10, ink);
  paragraph(`Contact: ${order.phone || "Not provided"}`, 9);
  y! -= 10;

  function tableHeader() {
    ensure(47);
    page!.drawRectangle({ x: margin, y: y! - 8, width: right - margin, height: 26, color: pale });
    text("ITEM", margin + 9, y!, 8, true, muted);
    aligned("QTY", 365, y!, 8, true, muted);
    aligned("UNIT", 443, y!, 8, true, muted);
    aligned("TOTAL", right - 9, y!, 8, true, muted);
    y! -= 30;
  }
  tableHeader();
  for (const item of order.lines) {
    const extras = Array.isArray(item.addOns) ? item.addOns.filter((value): value is { name: string } =>
      !!value && typeof value === "object" && "name" in value && typeof value.name === "string") : [];
    const detail = `${item.portion === "family" ? "Family portion" : "Regular portion"}${
      extras.length ? ` | Add-ons: ${extras.map((extra) => extra.name).join(", ")}` : ""}`;
    const rows = [
      ...wrap(item.name, 272, 10, true).map((value) => ({ value, size: 10, strong: true })),
      ...wrap(detail, 272, 8).map((value) => ({ value, size: 8, strong: false })),
    ];
    const rowHeight = rows.reduce((sum, row) => sum + row.size + 5, 0) + 19;
    if (rowHeight < 580 && y! - rowHeight < 66) { newPage(); tableHeader(); }
    let first = true;
    for (const row of rows) {
      if (y! < 83) {
        newPage(); tableHeader();
        text("Item continued", margin + 9, y!, 8, false, muted); y! -= 15;
      }
      text(row.value, margin + 9, y!, row.size, row.strong, row.strong ? ink : muted);
      if (first) {
        aligned(String(item.quantity), 365, y!, 10);
        aligned(rupees(item.unitPaise), 443, y!, 10);
        aligned(rupees(item.unitPaise * item.quantity), right - 9, y!, 10, true);
        first = false;
      }
      y! -= row.size + 5;
    }
    y! -= 9;
    page!.drawLine({ start: { x: margin, y: y! + 4 }, end: { x: right, y: y! + 4 }, thickness: 0.5, color: lineColor });
    y! -= 10;
  }
  const totals = [
    { label: "Items, including add-ons", amount: order.subtotalPaise },
    ...(order.couponDiscountPaise ? [{ label: `Coupon${order.couponCode ? ` (${order.couponCode})` : ""}`, amount: -order.couponDiscountPaise }] : []),
    ...(order.redeemedPoints ? [{ label: `Loyalty (${order.redeemedPoints} points)`, amount: -order.redeemedPoints * 100 }] : []),
    { label: "Delivery", amount: order.deliveryFeePaise },
  ];
  const totalRows = totals.map((row) => ({ ...row, labels: wrap(row.label, 171, 9) }));
  ensure(totalRows.reduce((sum, row) => sum + Math.max(23, row.labels.length * 13 + 8), 0) + 80);
  y! -= 5;
  for (const row of totalRows) {
    row.labels.forEach((label, index) => text(label, 265, y! - index * 13, 9, false, muted));
    aligned(rupees(row.amount), right - 9, y!, 10);
    y! -= Math.max(23, row.labels.length * 13 + 8);
  }
  y! -= 8;
  page!.drawRectangle({ x: 253, y: y! - 10, width: right - 253, height: 33, color: pale });
  text("Order total", 265, y!, 11, true);
  aligned(rupees(order.totalPaise), right - 9, y!, 14, true); y! -= 31;
  aligned(`Includes 5% GST: ${rupees(order.gstPaise)}`, right - 9, y!, 9, false, muted);
  y! -= 21;
  const hasRefundActivity = summary.refundedPaise || summary.pendingRefundPaise || summary.capturedPaise !== order.totalPaise;
  // Keep short payment/refund summaries together instead of orphaning a few
  // lines on a new page. Large histories can still continue across pages.
  const paymentBlock = 110 + summary.payments.reduce((sum, payment) => sum + (payment.providerRefundId ? 78 : 64), 0) +
    (hasRefundActivity ? 85 : 0);
  if (paymentBlock < 580) ensure(paymentBlock);
  section("Payment activity");
  for (const payment of summary.payments) {
    const isDemo = !payment.provider || payment.provider === "demo";
    const paymentState = payment.status === "REFUNDED" ? "Refunded" :
      payment.status === "REFUND_PENDING" ? "Refund in progress" : "Confirmed";
    ensure(68);
    paragraph(`${isDemo ? "Demo gateway" : isTestPayment(payment) ? "Razorpay test" : "Razorpay"} | ${payment.method} | ${paymentState} | ${rupees(payment.amountPaise)}`, 10, ink);
    paragraph(`Payment reference: ${payment.providerPaymentId || payment.id}`);
    paragraph(`Recorded ${dateLabel(payment.createdAt)}`);
    if (payment.providerRefundId) paragraph(`Refund reference: ${payment.providerRefundId}`);
    y! -= 5;
  }
  if (hasRefundActivity) {
    ensure(85);
    paragraph(`${summary.testMode ? "Test payment total" : "Total collected"}: ${rupees(summary.capturedPaise)} | ${summary.testMode ? "Test refunds" : "Refunded"}: ${rupees(summary.refundedPaise)}`, 9, ink);
    paragraph(`${summary.testMode ? "Net test amount" : "Net collected"} after completed refunds: ${rupees(summary.netCollectedPaise)}`, 9, ink);
    if (summary.pendingRefundPaise) paragraph(
      `Refund awaiting completion: ${rupees(summary.pendingRefundPaise)}. A refund request is not confirmation that funds have reached your account.`, 9, amber);
  }
  y! -= 7;
  paragraph("This receipt acknowledges the recorded payment and summarises your order. It is not a GST tax invoice. Contact the outlet if you need a tax invoice or help with your payment.", 8);
  paragraph("Add-on prices are included in each unit price. GST is included in the order total and is not an additional charge.", 8);
  document.getPages().forEach((receiptPage, index) => {
    page = receiptPage;
    page.drawLine({ start: { x: margin, y: 49 }, end: { x: right, y: 49 }, thickness: 0.5, color: lineColor });
    text("Deccan Kitchen & Co. | Payment receipt", margin, 34, 8, false, muted);
    aligned(`${index + 1} / ${document.getPageCount()}`, right, 34, 8, false, muted);
  });
  return document.save();
}
