export function kitchenUrgency(status: string, promisedAt: string | null, now: number) {
  if (["READY", "HANDED_OFF", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status)) {
    return { tone: "on-time", label: status === "READY" ? "Ready" : "Preparation complete", remaining: null };
  }
  if (!promisedAt) return { tone: "due-soon", label: "Promise unavailable", remaining: null };
  const difference = new Date(promisedAt).getTime() - now;
  if (!Number.isFinite(difference)) return { tone: "due-soon", label: "Promise unavailable", remaining: null };
  return {
    tone: difference < 0 ? "late" : difference <= 5 * 60000 ? "due-soon" : "on-time",
    label: difference < 0 ? "Overdue" : difference <= 5 * 60000 ? "Due soon" : "On time",
    remaining: difference < 0 ? -Math.max(1, Math.ceil(-difference / 60000)) : Math.ceil(difference / 60000),
  };
}
