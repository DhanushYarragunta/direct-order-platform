import { z } from "zod";

export const CATERING_NOTICE_HOURS = 24;
export const CATERING_MAX_DAYS = 180;
export const CATERING_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "DECLINED",
  "CANCELLED",
] as const;
export const cateringSchema = z
  .object({
    requestKey: z.string().uuid(),
    outletId: z.string().min(1).max(80),
    eventAt: z.string().datetime({ offset: true }),
    guestCount: z
      .number()
      .int()
      .min(10, "Party orders start at 10 guests")
      .max(500),
    occasion: z.string().trim().min(3).max(80),
    contactName: z.string().trim().min(2).max(70),
    phone: z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
    address: z
      .string()
      .trim()
      .min(8, "Enter a complete event address")
      .max(300),
    menuNotes: z
      .string()
      .trim()
      .min(10, "Tell us a little about the menu you need")
      .max(1000),
    budgetPaise: z
      .number()
      .int()
      .min(100000)
      .max(100000000)
      .nullable()
      .default(null),
  })
  .strict();

export const cateringDecisionSchema = z
  .object({
    status: z.enum(["CONFIRMED", "DECLINED"]),
    managerNote: z
      .string()
      .trim()
      .min(10, "Add confirmation details or a reason (at least 10 characters)")
      .max(1000),
    version: z.number().int().nonnegative(),
  })
  .strict();

export const cateringCancelSchema = z
  .object({ version: z.number().int().nonnegative() })
  .strict();

export function checkCateringNotice(eventAt: Date, now = new Date()) {
  const duration = eventAt.getTime() - now.getTime();
  if (!Number.isFinite(duration) || duration < CATERING_NOTICE_HOURS * 3600000)
    throw new Error(
      "Party orders need at least 24 hours’ notice. Choose a later event time.",
    );
  if (duration > CATERING_MAX_DAYS * 86400000)
    throw new Error("Choose an event within the next 180 days.");
}

/** datetime-local inputs always represent India time, independent of browser timezone. */
export function cateringLocalDate(date: Date) {
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 16);
}

export function cateringEventDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose an event date and time");
  const date = new Date(`${value}:00+05:30`);
  if (!Number.isFinite(date.getTime()) || cateringLocalDate(date) !== value)
    throw new Error("Choose a valid event date and time");
  return date.toISOString();
}
