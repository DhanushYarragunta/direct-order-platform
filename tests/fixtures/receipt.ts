import type { ReceiptOrder } from "../../src/lib/receipt";

export function receiptFixture(overrides: Partial<ReceiptOrder> = {}): ReceiptOrder {
  return {
    number: "WEB-RECEIPT-2026", status: "PLACED", paymentStatus: "PAID",
    createdAt: new Date("2026-11-05T14:30:00Z"), fulfillment: "delivery",
    address: "Flat 204, ఉదయ్ నిలయం, Café Gardens, Botanical Garden Road, Kondapur, Hyderabad 500084",
    phone: "9000000000", subtotalPaise: 70000, couponCode: "WELCOME",
    couponDiscountPaise: 7000, redeemedPoints: 20, deliveryFeePaise: 4000,
    totalPaise: 65000, gstPaise: 3095,
    outlet: { name: "Kondapur Kitchen", address: "Botanical Garden Road, Kondapur",
      city: "Hyderabad", fssai: "00000000000001", fssaiVerified: false },
    lines: [
      { name: "Chicken dum biryani", portion: "regular", quantity: 2, unitPaise: 30000,
        addOns: [{ name: "Extra salan", pricePaise: 4000 }] },
      { name: "Double ka meetha", portion: "regular", quantity: 1, unitPaise: 10000, addOns: [] },
    ],
    payments: [{ id: "local-payment", provider: "razorpay", testMode: false, providerPaymentId: "pay_exampleConfirmed",
      method: "UPI", status: "PAID", amountPaise: 65000, createdAt: new Date("2026-11-05T14:31:00Z") }],
    ...overrides,
  };
}
