export const MENU_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const MENU_TIME_ZONE = "Asia/Kolkata";

export type MenuSchedule = {
  menuDays?: number[];
  menuStartMinute?: number | null;
  menuEndMinute?: number | null;
};
export type CityPrice = {
  city: string;
  pricePaise: number;
  familyPricePaise: number | null;
};

export const normalizeCity = (city: string) => city.trim().toLowerCase();
export const minuteTime = (minute: number) =>
  `${Math.floor(minute / 60).toString().padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;

/** A service window belongs to the day on which it starts, including overnight windows. */
export function menuScheduleOpen(schedule: MenuSchedule, now = new Date()) {
  const start = schedule.menuStartMinute ?? null;
  const end = schedule.menuEndMinute ?? null;
  if (start === null && end === null) return true;
  const days = schedule.menuDays || [];
  if (
    start === null || end === null || start === end ||
    !Number.isInteger(start) || !Number.isInteger(end) ||
    start < 0 || start > 1439 || end < 0 || end > 1439 ||
    !days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    !Number.isFinite(now.getTime())
  ) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MENU_TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  const day = MENU_DAYS.indexOf(part("weekday") as (typeof MENU_DAYS)[number]);
  const minute = Number(part("hour")) * 60 + Number(part("minute"));
  return start < end
    ? days.includes(day) && minute >= start && minute < end
    : (days.includes(day) && minute >= start) ||
        (days.includes((day + 6) % 7) && minute < end);
}

export function menuScheduleLabel(schedule: MenuSchedule) {
  const start = schedule.menuStartMinute, end = schedule.menuEndMinute;
  if (start == null || end == null) return null;
  const days = [...(schedule.menuDays || [])].sort((a, b) => a - b);
  return `${days.length === 7 ? "Daily" : days.map((day) => MENU_DAYS[day]).join(", ")} · ${minuteTime(start)}–${minuteTime(end)}${start > end ? " next day" : ""} IST`;
}

export function menuForOutlet<T extends MenuSchedule & {
  pricePaise: number;
  familyPricePaise: number | null;
  cityPrices?: CityPrice[];
}>(item: T, city: string, now = new Date()) {
  const override = item.cityPrices?.find((price) => normalizeCity(price.city) === normalizeCity(city));
  return {
    ...item,
    pricePaise: override?.pricePaise ?? item.pricePaise,
    familyPricePaise: override?.familyPricePaise ?? item.familyPricePaise,
    scheduleAvailable: menuScheduleOpen(item, now),
    scheduleLabel: menuScheduleLabel(item),
  };
}

/** Suggestions rank only purchased items; callers supply already-scoped history and available menu. */
export function suggestReorders<T extends { id: string; available: boolean }>(
  items: T[],
  history: { itemId: string; quantity: number; orderedAt: Date }[],
) {
  const scores = new Map<string, { count: number; recent: number }>();
  for (const line of history) {
    const previous = scores.get(line.itemId);
    scores.set(line.itemId, {
      count: (previous?.count || 0) + line.quantity,
      recent: Math.max(previous?.recent || 0, line.orderedAt.getTime()),
    });
  }
  return items.filter((item) => item.available && scores.has(item.id))
    .sort((a, b) => {
      const aScore = scores.get(a.id)!, bScore = scores.get(b.id)!;
      return bScore.count - aScore.count || bScore.recent - aScore.recent || a.id.localeCompare(b.id);
    }).slice(0, 3).map((item) => item.id);
}
