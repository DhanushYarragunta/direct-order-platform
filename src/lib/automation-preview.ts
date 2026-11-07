import { z } from "zod";
import { overridePromise } from "./domain";

export const aiScenarioSchema = z.object({
  outletId: z.string().min(1).max(80),
  inputs: z.object({
    workMinutes: z.number().min(1).max(5000),
    queueWork: z.number().min(0).max(1000000),
    stations: z.number().int().min(1).max(100),
    minimum: z.number().int().min(1).max(180),
    hour: z.number().min(0).lt(24),
  }).strict(),
  history: z.enum(["full", "limited"]),
  // Includes the largest supported queue fallback plus the ten-minute alert window.
  elapsedMinutes: z.number().int().min(0).max(1100000),
  overrideMinutes: z.number().int().min(1).max(180).nullable(),
}).strict().refine(value => value.overrideMinutes === null || value.overrideMinutes >= value.inputs.minimum, {
  message: "A manager override must respect the kitchen minimum", path: ["overrideMinutes"],
});
export type AIScenario = z.infer<typeof aiScenarioSchema>;

/** Pure demonstration of the existing minimum, override and ten-minute alert policy. */
export function automationPreview(minutes: number, minimum: number, elapsedMinutes: number, overrideMinutes: number | null) {
  const originalPromise = Math.max(minutes, minimum);
  if (overrideMinutes !== null) overridePromise(overrideMinutes, minimum, new Date(0));
  const promisedMinutes = overrideMinutes === null ? originalPromise : elapsedMinutes + overrideMinutes;
  const lateByMinutes = Math.max(0, elapsedMinutes - promisedMinutes);
  const managerAlert = lateByMinutes >= 10;
  const updates = [{ kind: "PLACED", audience: "Customer", text: `Order confirmed. Estimated preparation: ${originalPromise} minutes.` }];
  if (overrideMinutes !== null) updates.push({ kind: "OVERRIDE", audience: "Customer", text: `The outlet manager updated preparation to ${overrideMinutes} minutes from now.` });
  if (managerAlert) {
    updates.push({ kind: "LATE", audience: "Customer", text: "Your order is taking longer than promised. The outlet manager has been notified and the kitchen is working on it." });
    updates.push({ kind: "MANAGER_ALERT", audience: "Outlet manager", text: "Preparation promise exceeded by ten minutes. Review the order and update its promise." });
  }
  return { originalPromise, promisedMinutes, remainingMinutes: Math.max(0, promisedMinutes - elapsedMinutes), lateByMinutes, managerAlert,
    overrideApplied: overrideMinutes !== null, updates, delivery: "preview-only" as const };
}

export function predictionFallbackReason(version: string) {
  const reason = version.split(":")[1];
  return ({
    "insufficient-history": "Fewer than 60 completed examples are available.",
    "insufficient-chronological-history": "There is not enough earlier history to validate the model fairly.",
    "outside-observed-load": "This workload is outside the examples the model has seen.",
    "validation-gate": "The learned estimate did not improve enough on the kitchen-load formula.",
    "invalid-input": "Some kitchen inputs are missing or invalid.",
    "unstable-fit": "The available examples could not produce a stable model.",
    "non-monotone-load-fit": "The fitted model did not respond safely to increased work.",
    "unsafe-prediction": "The predicted duration was outside the supported range.",
    "demo-or-test-payment": "Learning is disabled for this payment configuration.",
  } as Record<string, string>)[reason] || "The kitchen-load formula is being used as a safe fallback.";
}
