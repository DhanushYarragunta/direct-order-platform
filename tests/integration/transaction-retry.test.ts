import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db, serializable } from "../../src/lib/db";

const ids = [randomUUID(), randomUUID()].map((id) => `commit-conflict-${id}`);

beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") ||
    new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
  await db.outlet.createMany({ data: ids.map((id) => ({
    id, name: "Commit conflict fixture", address: "Test only", latitude: 0,
    longitude: 0, minPrepMinutes: 10, fssai: "DEMO-NOT-A-LICENCE",
  })) });
});
afterAll(async () => {
  await db.outlet.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

function rendezvous() {
  let arrived = 0, release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  return async () => { if (++arrived === 2) release(); await ready; };
}
function conflict() {
  const afterRead = rendezvous(), afterWrite = rendezvous(), attempts = [0, 0];
  return {
    attempts,
    work: (index: number) => async (tx: Prisma.TransactionClient) => {
      const first = ++attempts[index] === 1;
      const snapshot = await tx.outlet.findMany({ where: { id: { in: ids } } });
      // Both transactions read both rows, then update different rows. Holding
      // both callbacks until their writes finish forces a conflict at COMMIT.
      if (first) await afterRead();
      await tx.outlet.update({ where: { id: ids[index] }, data: { minPrepMinutes: { increment: 1 } } });
      if (first) await afterWrite();
      return snapshot.reduce((total, row) => total + row.minPrepMinutes, 0);
    },
  };
}

it("recovers from an actual PostgreSQL commit conflict without applying a write twice", async () => {
  const direct = conflict();
  const outcomes = await Promise.allSettled([0, 1].map((index) => db.$transaction(direct.work(index), {
    isolationLevel: "Serializable", timeout: 10000,
  })));
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = outcomes.find((result) => result.status === "rejected");
  expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
    name: "DriverAdapterError", cause: { kind: "TransactionWriteConflict", originalCode: "40001" },
  });
  await db.outlet.updateMany({ where: { id: { in: ids } }, data: { minPrepMinutes: 10 } });

  const retried = conflict();
  const snapshots = await Promise.all([0, 1].map((index) => serializable(retried.work(index))));
  expect(snapshots.sort()).toEqual([20, 21]);
  expect(retried.attempts.reduce((sum, count) => sum + count, 0)).toBe(3);
  const final = await db.outlet.findMany({ where: { id: { in: ids } } });
  expect(final.map((row) => row.minPrepMinutes)).toEqual([11, 11]);
});
