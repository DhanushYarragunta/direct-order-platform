import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { AppError, staffOutlet, type AuthUser } from "./auth";
import { db, serializable } from "./db";
import {
  cateringSchema,
  cateringDecisionSchema,
  checkCateringNotice,
  CATERING_STATUSES,
} from "./catering-validation";

const include = { outlet: true } as const;
const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
const statusSchema = z.enum(["ALL", ...CATERING_STATUSES]).default("ALL");
const PAGE_SIZE = 8;

function customerOnly(user: AuthUser) {
  if (user.role !== "CUSTOMER")
    throw new AppError(403, "Use a customer account to request catering");
}

function managerOnly(user: AuthUser) {
  if (!["ADMIN", "MANAGER"].includes(user.role))
    throw new AppError(403, "Catering requests need manager access");
}

export async function listCatering(
  user: AuthUser,
  params: URLSearchParams,
  staff = false,
) {
  const page = pageSchema.parse(params.get("page") ?? undefined);
  const status = statusSchema.parse(params.get("status") ?? undefined);
  let outletId: string | undefined;
  if (staff) {
    managerOnly(user);
    const requested = params.get("outlet");
    outletId =
      requested && requested !== "all" ? requested : user.outletId || undefined;
    if (user.role !== "ADMIN" && !outletId)
      throw new AppError(403, "This account has no assigned outlet");
    if (outletId) staffOutlet(user, outletId);
  } else customerOnly(user);
  const where = {
    ...(staff ? (outletId ? { outletId } : {}) : { userId: user.id }),
    ...(status !== "ALL" ? { status } : {}),
  };
  const [requests, total, outlets] = await db.$transaction([
    db.cateringRequest.findMany({
      where,
      include,
      orderBy: staff
        ? [{ eventAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.cateringRequest.count({ where }),
    db.outlet.findMany({
      where: staff && user.role !== "ADMIN" ? { id: user.outletId! } : {},
      orderBy: { name: "asc" },
    }),
  ]);
  return { requests, total, page, pageSize: PAGE_SIZE, outlets };
}

export async function createCatering(
  raw: z.input<typeof cateringSchema>,
  user: AuthUser,
) {
  customerOnly(user);
  const input = cateringSchema.parse(raw);
  const { requestKey, ...details } = input;
  const requestHash = createHash("sha256")
    .update(JSON.stringify(details))
    .digest("hex");
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const existing = await tx.cateringRequest.findUnique({
      where: { userId_requestKey: { userId: user.id, requestKey } },
      include,
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new AppError(
          409,
          "This request changed. Start a new request to submit different details.",
        );
      return existing;
    }
    try {
      checkCateringNotice(new Date(input.eventAt));
    } catch (error) {
      throw new AppError(400, (error as Error).message);
    }
    const outlet = await tx.outlet.findUnique({
      where: { id: input.outletId },
    });
    if (!outlet) throw new AppError(404, "Kitchen not found");
    if (!outlet.open)
      throw new AppError(
        409,
        "This kitchen is not accepting requests. Choose another kitchen.",
      );
    const active = await tx.cateringRequest.count({
      where: { userId: user.id, status: "REQUESTED" },
    });
    if (active >= 10)
      throw new AppError(
        409,
        "You already have 10 requests awaiting a reply. Cancel an unused request before adding another.",
      );
    const request = await tx.cateringRequest.create({
      data: {
        ...details,
        eventAt: new Date(input.eventAt),
        requestKey,
        requestHash,
        userId: user.id,
        number: `CAT-${randomBytes(5).toString("hex").toUpperCase()}`,
      },
      include,
    });
    await tx.audit.create({
      data: {
        actorId: user.id,
        action: "CATERING_REQUESTED",
        detail: `${request.number}: ${request.guestCount} guests at ${request.outletId}`,
      },
    });
    return request;
  });
}

export async function decideCatering(
  id: string,
  raw: z.input<typeof cateringDecisionSchema>,
  user: AuthUser,
) {
  managerOnly(user);
  const input = cateringDecisionSchema.parse(raw);
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CateringRequest" WHERE id = ${id} FOR UPDATE`;
    const current = await tx.cateringRequest.findUnique({ where: { id } });
    if (!current) throw new AppError(404, "Catering request not found");
    staffOutlet(user, current.outletId);
    if (current.status !== "REQUESTED" || current.version !== input.version)
      throw new AppError(
        409,
        "This request has changed. Refresh before responding.",
      );
    if (input.status === "CONFIRMED" && current.eventAt <= new Date())
      throw new AppError(
        409,
        "This event time has passed. Decline the request and ask the customer to choose a new date.",
      );
    const request = await tx.cateringRequest.update({
      where: { id },
      data: {
        status: input.status,
        managerNote: input.managerNote,
        respondedAt: new Date(),
        version: { increment: 1 },
      },
      include,
    });
    await tx.audit.create({
      data: {
        actorId: user.id,
        action: `CATERING_${input.status}`,
        detail: `${request.number}: ${input.managerNote}`,
      },
    });
    return request;
  });
}

export async function cancelCatering(
  id: string,
  version: number,
  user: AuthUser,
) {
  customerOnly(user);
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CateringRequest" WHERE id = ${id} FOR UPDATE`;
    const current = await tx.cateringRequest.findUnique({ where: { id } });
    if (!current || current.userId !== user.id)
      throw new AppError(404, "Catering request not found");
    if (current.status !== "REQUESTED" || current.version !== version)
      throw new AppError(
        409,
        "This request has changed. Only requests awaiting a reply can be cancelled.",
      );
    const request = await tx.cateringRequest.update({
      where: { id },
      data: { status: "CANCELLED", version: { increment: 1 } },
      include,
    });
    await tx.audit.create({
      data: {
        actorId: user.id,
        action: "CATERING_CANCELLED",
        detail: request.number,
      },
    });
    return request;
  });
}
