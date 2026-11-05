import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { gstIncluded } from "../src/lib/domain";
import { seedDepth } from "./seed-depth";

async function seed() {
  if (process.env.DEMO_MODE !== "true" || !process.env.DEMO_PASSWORD)
    throw new Error(
      "Seeding requires DEMO_MODE=true and DEMO_PASSWORD in .env",
    );
  const outlets = [
    {
      id: "kondapur",
      name: "Kondapur",
      address: "Botanical Garden Road, Kondapur, Hyderabad",
      latitude: 17.462,
      longitude: 78.357,
      minPrepMinutes: 25,
    },
    {
      id: "gachibowli",
      name: "Gachibowli cloud kitchen",
      address: "DLF Road, Gachibowli, Hyderabad",
      latitude: 17.444,
      longitude: 78.349,
      minPrepMinutes: 25,
    },
    {
      id: "kukatpally",
      name: "Kukatpally",
      address: "KPHB Main Road, Kukatpally, Hyderabad",
      latitude: 17.494,
      longitude: 78.399,
      minPrepMinutes: 30,
    },
  ];
  for (const [index, outlet] of outlets.entries()) {
    const fssai = `0000000000000${index + 1}`;
    await db.outlet.upsert({
      where: { id: outlet.id },
      update: {},
      create: {
        ...outlet,
        fssai,
        fssaiVerified: false,
        radiusKm: 5,
        activeStations: 4,
      },
    });
    await db.outlet.updateMany({ where: { id: outlet.id, fssai: "DEMO — licence pending verification" }, data: { fssai, fssaiVerified: false } });
  }
  const menu = [
    {
      id: "chicken-biryani",
      name: "Chicken dum biryani",
      description:
        "Tender chicken, fragrant basmati and our signature blend of slow-cooked spices.",
      category: "Biryani",
      pricePaise: 32000,
      familyPricePaise: 90000,
      portion: "Regular · serves 1",
      vegetarian: false,
      spice: "Medium",
      allergens: ["milk"],
      photo: "/food/chicken-biryani.jpg",
      prepMinutes: 18,
      featured: true,
      active: true,
    },
    {
      id: "vegetable-biryani",
      name: "Vegetable biryani",
      description:
        "Seasonal vegetables and long-grain basmati, layered with herbs and golden onions.",
      category: "Biryani",
      pricePaise: 26000,
      familyPricePaise: null,
      portion: "Regular · serves 1",
      vegetarian: true,
      spice: "Medium",
      allergens: ["milk", "cashew"],
      photo: "/food/vegetable-biryani.jpg",
      prepMinutes: 15,
      featured: false,
      active: true,
    },
    {
      id: "mirchi-ka-salan",
      name: "Mirchi ka salan",
      description:
        "A Hyderabadi classic: green chillies in a rich, tangy peanut and sesame gravy.",
      category: "Sides",
      pricePaise: 12000,
      familyPricePaise: null,
      portion: "250 ml · serves 1–2",
      vegetarian: true,
      spice: "Hot",
      allergens: ["peanut", "sesame"],
      photo: "/food/mirchi-ka-salan.jpg",
      prepMinutes: 5,
      featured: false,
      active: true,
    },
    {
      id: "double-ka-meetha",
      name: "Double ka meetha",
      description:
        "Golden bread, saffron milk and toasted nuts. A sweet little piece of the old city.",
      category: "Sweets",
      pricePaise: 14000,
      familyPricePaise: null,
      portion: "150 g · serves 1",
      vegetarian: true,
      spice: "Sweet",
      allergens: ["wheat", "milk", "almond", "cashew"],
      photo: "/food/double-ka-meetha.jpg",
      prepMinutes: 4,
      featured: false,
      active: true,
    },
    {
      id: "mutton-haleem",
      name: "Mutton haleem",
      description:
        "Slow-cooked mutton and wheat with fragrant spices, herbs and golden onions.",
      category: "Sides",
      pricePaise: 35000,
      familyPricePaise: null,
      portion: "Regular",
      vegetarian: false,
      spice: "Medium",
      allergens: ["wheat", "milk", "egg"],
      photo: "/food/mutton-haleem.jpg",
      prepMinutes: 20,
      featured: false,
      active: true,
    },
    {
      id: "cucumber-raita", name: "Cucumber raita", description: "Cool yoghurt, crisp cucumber and roasted cumin. A refreshing side for your biryani.",
      category: "Sides", pricePaise: 8000, familyPricePaise: null, portion: "200 ml · serves 1–2", vegetarian: true,
      spice: "Mild", allergens: ["milk"], photo: "/food/cucumber-raita.jpg", prepMinutes: 3, featured: false, active: true,
    },
    {
      id: "gulab-jamun", name: "Gulab jamun", description: "Soft milk dumplings soaked in warm cardamom syrup. Two pieces to finish your meal.",
      category: "Sweets", pricePaise: 10000, familyPricePaise: null, portion: "2 pieces · serves 1", vegetarian: true,
      spice: "Sweet", allergens: ["milk", "wheat"], photo: "/food/gulab-jamun.jpg", prepMinutes: 3, featured: false, active: true,
    },
  ];
  // Upgrade only the exact untouched historical demo placeholder, preserving admin edits.
  await db.menuItem.updateMany({ where: { id: "mutton-haleem", photo: null, active: false, description: "Slow-cooked mutton and wheat. Seasonal sample dish, currently off the menu." },
    data: { photo: "/food/mutton-haleem.jpg", active: true, allergens: ["wheat", "milk", "egg"], description: menu.find(item => item.id === "mutton-haleem")!.description } });
  await db.menuItem.updateMany({ where: { id: "mutton-haleem", photo: "/food/mutton-haleem.jpg", description: menu.find(item => item.id === "mutton-haleem")!.description, allergens: { equals: ["wheat", "milk"] } }, data: { allergens: ["wheat", "milk", "egg"] } });
  for (const item of menu) {
    await db.menuItem.upsert({
      where: { id: item.id },
      update: {},
      create: item,
    });
    for (const outlet of outlets)
      await db.availability.upsert({
        where: { outletId_itemId: { outletId: outlet.id, itemId: item.id } },
        update: {},
        create: { outletId: outlet.id, itemId: item.id },
      });
  }
  for (const extra of [
    {
      id: "raita",
      name: "Extra raita",
      pricePaise: 3000,
      prepMinutes: 1,
      allergens: ["milk"],
    },
    {
      id: "onions",
      name: "Onion & lemon",
      pricePaise: 2000,
      prepMinutes: 1,
      allergens: [],
    },
  ])
    await db.addOn.upsert({
      where: { id: extra.id },
      update: {},
      create: extra,
    });
  const passwordHash = hashPassword(process.env.DEMO_PASSWORD);
  const users = [
    {
      id: "demo-customer",
      name: "Aarav",
      email: "customer@deccan.example",
      role: "CUSTOMER" as const,
      outletId: null,
    },
    {
      id: "demo-admin",
      name: "Central team",
      email: "admin@deccan.example",
      role: "ADMIN" as const,
      outletId: null,
    },
    {
      id: "demo-manager",
      name: "Outlet manager",
      email: "manager@deccan.example",
      role: "MANAGER" as const,
      outletId: "kondapur",
    },
    ...outlets.map((o) => ({
      id: `demo-kitchen-${o.id}`,
      name: `${o.name} kitchen`,
      email: `${o.id}@deccan.example`,
      role: "KITCHEN" as const,
      outletId: o.id,
    })),
  ];
  for (const user of users)
    await db.user.upsert({
      where: { id: user.id },
      update: {},
      create: { ...user, passwordHash, consentAt: new Date() },
    });
  const now = Date.now();
  const samples = [
    {
      number: "WEB-778120",
      outletId: "kondapur",
      age: 25,
      promise: 20,
      status: "PREPARING" as const,
      method: "UPI",
      items: [
        { id: "chicken-biryani", quantity: 1, portion: "family" },
        { id: "double-ka-meetha", quantity: 2, portion: "regular" },
      ],
    },
    {
      number: "WEB-778131",
      outletId: "gachibowli",
      age: 35,
      promise: 5,
      status: "READY" as const,
      method: "CARD",
      items: [
        { id: "vegetable-biryani", quantity: 2, portion: "regular" },
        { id: "mirchi-ka-salan", quantity: 1, portion: "regular" },
      ],
    },
    {
      number: "WEB-778146",
      outletId: "kukatpally",
      age: 54,
      promise: -4,
      status: "PREPARING" as const,
      method: "UPI",
      items: [{ id: "mutton-haleem", quantity: 3, portion: "regular" }],
    },
  ];
  for (const sample of samples) {
    if (await db.order.findUnique({ where: { number: sample.number } }))
      continue;
    const lines = sample.items.map((i) => {
      const m = menu.find((m) => m.id === i.id)!;
      return {
        itemId: i.id,
        name: m.name,
        photo: m.photo,
        portion: i.portion,
        quantity: i.quantity,
        unitPaise: i.portion === "family" ? m.familyPricePaise! : m.pricePaise,
        addOns: [],
      };
    });
    const totalPaise = lines.reduce((s, l) => s + l.unitPaise * l.quantity, 0),
      promisedAt = new Date(now + sample.promise * 60000);
    await db.order.create({
      data: {
        number: sample.number,
        userId: "demo-customer",
        outletId: sample.outletId,
        checkoutKey: sample.number,
        cartHash: "seed",
        status: sample.status,
        paymentStatus: "PAID",
        totalPaise,
        subtotalPaise: totalPaise,
        gstPaise: gstIncluded(totalPaise),
        workMinutes: 40,
        fulfillment: sample.outletId === "kukatpally" ? "delivery" : "pickup",
        address: sample.outletId === "kukatpally" ? "Demo address: 10 KPHB Main Road, Kukatpally, Hyderabad 500072" : "",
        phone: "9000000000",
        note: "Sample order from the client brief",
        createdAt: new Date(now - sample.age * 60000),
        placedAt: new Date(now - sample.age * 60000),
        promisedAt,
        originalPromisedAt: promisedAt,
        estimateMinutes: sample.age + sample.promise,
        expiresAt: new Date(now + 86400000),
        readyAt: sample.status === "READY" ? new Date() : null,
        lines: { create: lines },
        payments: {
          create: {
            attemptKey: "seed",
            method: sample.method,
            status: "PAID",
            amountPaise: totalPaise,
          },
        },
        messages: {
          create: {
            kind: "PLACED",
            body: "Sample order confirmed. Updates from the kitchen appear here.",
          },
        },
      },
    });
  }
  await seedDepth(passwordHash);
  console.log("Seed ready: core sample orders, coupons, loyalty, repeat-customer history and party requests. Existing records were preserved.");
}
seed()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
