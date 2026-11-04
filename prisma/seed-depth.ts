import { db } from "../src/lib/db";
import { gstIncluded } from "../src/lib/domain";

// Invented demo policies and history, kept separate from the three brief orders.
export async function seedDepth(passwordHash: string) {
  for (const coupon of [
    { code: "WELCOME100", description: "₹100 off your first order of ₹499 or more", type: "FIXED", value: 10000, minSubtotalPaise: 49900, maxDiscountPaise: 10000, firstOrderOnly: true, active: true },
    { code: "BIRYANI10", description: "10% off orders of ₹399 or more, up to ₹150", type: "PERCENT", value: 10, minSubtotalPaise: 39900, maxDiscountPaise: 15000, firstOrderOnly: false, active: true },
    { code: "EXPIRED10", description: "Expired demo offer", type: "PERCENT", value: 10, minSubtotalPaise: 39900, maxDiscountPaise: 15000, firstOrderOnly: false, active: false },
  ]) await db.coupon.upsert({ where: { code: coupon.code }, update: {}, create: {
    ...coupon, startsAt: new Date("2026-01-01T00:00:00Z"), expiresAt: new Date(coupon.active ? "2030-12-31T23:59:59Z" : "2026-02-01T00:00:00Z"),
  } });
  await db.loyaltyEntry.upsert({ where: { id: "demo-opening-points" }, update: {}, create: { id: "demo-opening-points", userId: "demo-customer", kind: "OPENING", points: 100 } });

  const names = ["Ishaan", "Mira", "Kabir", "Anaya", "Dev"];
  for (let i = 0; i < names.length; i++) await db.user.upsert({ where: { id: `demo-regular-${i}` }, update: {}, create: {
    id: `demo-regular-${i}`, name: names[i], email: `regular${i + 1}@deccan.example`, passwordHash, role: "CUSTOMER", consentAt: new Date(),
  } });
  const dishes = await db.menuItem.findMany({ where: { id: { in: ["chicken-biryani", "vegetable-biryani", "mirchi-ka-salan", "double-ka-meetha"] } } });
  const outlets = ["kondapur", "gachibowli", "kukatpally"];
  for (let i = 0; i < 18; i++) {
    const number = `DEMO-HISTORY-${String(i + 1).padStart(3, "0")}`;
    if (await db.order.findUnique({ where: { number } })) continue;
    const dish = dishes[i % dishes.length], totalPaise = dish.pricePaise * 2;
    const placedAt = new Date(Date.now() - (i * 17 + 3) * 3600000);
    const cancelled = i === 8 || i === 15;
    const order = await db.order.create({ data: {
      number, userId: `demo-regular-${i % names.length}`, outletId: outlets[i % 3], checkoutKey: number, cartHash: "seed-history",
      status: cancelled ? "CANCELLED" : "HANDED_OFF", paymentStatus: cancelled ? "REFUNDED" : "PAID", totalPaise, subtotalPaise: totalPaise, gstPaise: gstIncluded(totalPaise), workMinutes: dish.prepMinutes * 2,
      fulfillment: "pickup", address: "", phone: "9000000000", note: "Invented demo history for report review", createdAt: new Date(placedAt.getTime() - 30000), placedAt,
      readyAt: cancelled ? null : new Date(placedAt.getTime() + (22 + i % 12) * 60000), promisedAt: new Date(placedAt.getTime() + 35 * 60000), originalPromisedAt: new Date(placedAt.getTime() + 35 * 60000), expiresAt: new Date(placedAt.getTime() + 15 * 60000), estimateMinutes: 35,
      lines: { create: { itemId: dish.id, name: dish.name, photo: dish.photo, portion: "regular", quantity: 2, unitPaise: dish.pricePaise, addOns: [] } },
      payments: { create: { attemptKey: "seed", method: i % 2 ? "CARD" : "UPI", status: cancelled ? "REFUNDED" : "PAID", amountPaise: totalPaise, createdAt: placedAt } },
    } });
    if (!cancelled) await db.loyaltyEntry.create({ data: { userId: order.userId, orderId: order.id, kind: "EARN", points: Math.floor(totalPaise / 10000), createdAt: order.readyAt! } });
  }
  for (let i = 0; i < 2; i++) {
    const number = `PARTY-DEMO-${i + 1}`;
    await db.cateringRequest.upsert({ where: { number }, update: {}, create: {
      number, userId: "demo-customer", outletId: outlets[i], requestKey: number, requestHash: "seed",
      eventAt: new Date(Date.now() + (3 + i) * 86400000), guestCount: i ? 40 : 25,
      occasion: i ? "Office lunch" : "Family celebration", contactName: "Aarav", phone: "9000000000", address: "Demo venue, Hyderabad",
      menuNotes: "Chicken and vegetable biryani, salan and dessert. Please discuss vegetarian portions.", budgetPaise: i ? 1800000 : 1200000,
      status: i ? "CONFIRMED" : "REQUESTED", managerNote: i ? "Demo confirmation: menu and fulfilment discussed with the customer. No payment collected online." : "", respondedAt: i ? new Date() : null,
    } });
  }
}
