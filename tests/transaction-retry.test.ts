import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { db, serializable } from "../src/lib/db";

function driverError(originalCode: string, kind = "TransactionWriteConflict") {
  // Exact public Error shape used by the installed PostgreSQL adapter.
  return Object.assign(new Error(kind, { cause: { kind, originalCode } }), { name: "DriverAdapterError" });
}
const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("Database operation failed", { code, clientVersion: "7.10.1", meta });

afterEach(() => vi.restoreAllMocks());
afterAll(() => db.$disconnect());

describe("serializable transaction retry policy", () => {
  it.each([
    ["direct commit serialization failure", driverError("40001")],
    ["direct deadlock failure", driverError("40P01")],
    ["ORM write conflict", known("P2034")],
    ["raw SQL serialization failure", known("P2010", { code: "40001" })],
    ["raw SQL wrapped deadlock", known("P2010", { driverAdapterError: { cause: { originalCode: "40P01" } } })],
  ])("retries a %s as a fresh Serializable transaction", async (_label, error) => {
    const transaction = vi.spyOn(db, "$transaction")
      .mockRejectedValueOnce(error).mockResolvedValueOnce("committed");
    const work = vi.fn(async () => "committed");
    await expect(serializable(work)).resolves.toBe("committed");
    expect(transaction).toHaveBeenCalledTimes(2);
    for (const call of transaction.mock.calls)
      expect(call).toEqual([work, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 }]);
  });

  it("stops after four conflicting attempts and preserves the last error", async () => {
    const error = driverError("40001");
    const transaction = vi.spyOn(db, "$transaction").mockRejectedValue(error);
    await expect(serializable(async () => null)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["connection loss with uncertain commit", driverError("08006", "ConnectionClosed")],
    ["unique constraint", known("P2002")],
    ["raw SQL validation error", known("P2010", { code: "23505" })],
    ["unrelated adapter error", driverError("23505", "UniqueConstraintViolation")],
    ["mismatched adapter classification", driverError("40001", "GenericJs")],
    ["ordinary application failure", new Error("Do not retry")],
  ])("does not retry %s", async (_label, error) => {
    const transaction = vi.spyOn(db, "$transaction").mockRejectedValue(error);
    await expect(serializable(async () => null)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
