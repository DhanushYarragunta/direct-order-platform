import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import {
  createCatering,
  cancelCatering,
  decideCatering,
  listCatering,
} from "../../src/lib/catering";
import type { AuthUser } from "../../src/lib/auth";

let customer: AuthUser,
  outsider: AuthUser,
  kitchen: AuthUser,
  manager: AuthUser,
  otherManager: AuthUser;
const input = () => ({
  requestKey: randomUUID(),
  outletId: "kondapur",
  eventAt: new Date(Date.now() + 72 * 3600000).toISOString(),
  guestCount: 20,
  occasion: "Catering integration lunch",
  contactName: "Demo party guest",
  phone: "9000000000",
  address: "Demo office, Kondapur, Hyderabad",
  menuNotes: "Ten vegetarian and ten chicken biryani meals, with raita.",
  budgetPaise: 1200000,
});
beforeAll(async () => {
  if (
    !process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") ||
    new URL(process.env.DATABASE_URL!).pathname !==
      `/${process.env.CORE_TEST_DATABASE}`
  )
    throw new Error("Refusing tests outside an isolated core test database.");
  customer = await db.user.create({
    data: {
      email: `catering-${randomUUID()}@deccan.example`,
      name: "Party test guest",
      passwordHash: "test-only",
    },
    include: { outlet: true },
  });
  outsider = await db.user.create({
    data: {
      email: `catering-other-${randomUUID()}@deccan.example`,
      name: "Other party guest",
      passwordHash: "test-only",
    },
    include: { outlet: true },
  });
  otherManager = await db.user.create({
    data: {
      email: `catering-manager-${randomUUID()}@deccan.example`,
      name: "Other outlet manager",
      passwordHash: "test-only",
      role: "MANAGER",
      outletId: "kukatpally",
    },
    include: { outlet: true },
  });
  kitchen = await db.user.findUniqueOrThrow({
    where: { id: "demo-kitchen-kondapur" },
    include: { outlet: true },
  });
  manager = await db.user.findUniqueOrThrow({
    where: { id: "demo-manager" },
    include: { outlet: true },
  });
});
afterAll(() => db.$disconnect());

describe.sequential("catering requests in PostgreSQL", () => {
  it("deduplicates simultaneous submission and rejects a changed retry", async () => {
    const details = input();
    const [first, second] = await Promise.all([
      createCatering(details, customer),
      createCatering(details, customer),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.status).toBe("REQUESTED");
    await expect(
      createCatering({ ...details, guestCount: 25 }, customer),
    ).rejects.toThrow("request changed");
    expect(
      await db.audit.count({
        where: {
          action: "CATERING_REQUESTED",
          detail: { startsWith: first.number },
        },
      }),
    ).toBe(1);
  });

  it("rejects insufficient notice and a kitchen account trying to submit", async () => {
    await expect(
      createCatering(
        {
          ...input(),
          eventAt: new Date(Date.now() + 2 * 3600000).toISOString(),
        },
        customer,
      ),
    ).rejects.toThrow("24 hours");
    await expect(createCatering(input(), kitchen)).rejects.toThrow(
      "customer account",
    );
  });

  it("isolates customers and outlets and prevents kitchen staff from approving", async () => {
    const saved = await createCatering(input(), customer);
    const history = await listCatering(outsider, new URLSearchParams());
    expect(history.requests).toHaveLength(0);
    await expect(
      cancelCatering(saved.id, saved.version, outsider),
    ).rejects.toThrow("not found");
    const decision = {
      status: "CONFIRMED" as const,
      managerNote: "Confirmed for the requested date and menu.",
      version: saved.version,
    };
    await expect(decideCatering(saved.id, decision, kitchen)).rejects.toThrow(
      "manager access",
    );
    await expect(
      decideCatering(saved.id, decision, otherManager),
    ).rejects.toThrow("outside your access");
    await expect(
      listCatering(manager, new URLSearchParams("outlet=kukatpally"), true),
    ).rejects.toThrow("outside your access");
  });

  it("commits one competing manager decision and exposes the reply to the owner", async () => {
    const saved = await createCatering(input(), customer);
    const decision = {
      status: "CONFIRMED" as const,
      managerNote:
        "Confirmed: 20 meals for the requested event, ₹12,000 total including GST.",
      version: saved.version,
    };
    const result = await Promise.allSettled([
      decideCatering(saved.id, decision, manager),
      decideCatering(saved.id, { ...decision, status: "DECLINED" }, manager),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
    const updated = await db.cateringRequest.findUniqueOrThrow({
      where: { id: saved.id },
    });
    expect(updated.version).toBe(1);
    expect(updated.managerNote).toBe(decision.managerNote);
    const history = await listCatering(customer, new URLSearchParams());
    expect(history.requests.find((r) => r.id === saved.id)?.managerNote).toBe(
      decision.managerNote,
    );
    expect(
      await db.audit.count({
        where: {
          detail: { startsWith: saved.number },
          action: { in: ["CATERING_CONFIRMED", "CATERING_DECLINED"] },
        },
      }),
    ).toBe(1);
    await expect(cancelCatering(saved.id, 1, customer)).rejects.toThrow(
      "Only requests awaiting",
    );
  });

  it("allows owner cancellation before a decision and rejects confirming elapsed events", async () => {
    const saved = await createCatering(input(), customer);
    expect(
      (await cancelCatering(saved.id, saved.version, customer)).status,
    ).toBe("CANCELLED");
    await expect(
      decideCatering(
        saved.id,
        {
          status: "CONFIRMED",
          managerNote: "Confirmed for your requested event.",
          version: 1,
        },
        manager,
      ),
    ).rejects.toThrow("request has changed");
    const expired = await createCatering(input(), customer);
    await db.cateringRequest.update({
      where: { id: expired.id },
      data: { eventAt: new Date(Date.now() - 1000) },
    });
    await expect(
      decideCatering(
        expired.id,
        {
          status: "CONFIRMED",
          managerNote: "Confirmed for your requested event.",
          version: 0,
        },
        manager,
      ),
    ).rejects.toThrow("time has passed");
    expect(
      (
        await decideCatering(
          expired.id,
          {
            status: "DECLINED",
            managerNote:
              "The requested event time has passed; please choose a new date.",
            version: 0,
          },
          manager,
        )
      ).status,
    ).toBe("DECLINED");
  });
});
