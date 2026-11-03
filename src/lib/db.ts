import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { setTimeout as delay } from "node:timers/promises";

const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db =
  globalDb.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;

export async function serializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        maxWait: 5000,
        timeout: 10000,
      });
    } catch (error) {
      // ORM writes use P2034; explicit FOR UPDATE queries surface PostgreSQL's
      // serialization/deadlock SQLSTATE through P2010 with the driver adapter.
      const known = error instanceof Prisma.PrismaClientKnownRequestError;
      const adapter = known
        ? (error.meta?.driverAdapterError as
            | { cause?: { originalCode?: string } }
            | undefined)
        : undefined;
      const sqlState = known
        ? String(error.meta?.code || adapter?.cause?.originalCode || "")
        : "";
      const retryable =
        known &&
        (error.code === "P2034" ||
          (error.code === "P2010" && ["40001", "40P01"].includes(sqlState)));
      if (!retryable || attempt === 3) throw error;
      await delay(10 * 2 ** attempt + Math.floor(Math.random() * 10));
    }
  }
  throw new Error("Transaction retry limit");
}
