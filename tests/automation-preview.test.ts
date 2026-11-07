import { describe, expect, it } from "vitest";
import { aiScenarioSchema, automationPreview, predictionFallbackReason } from "../src/lib/automation-preview";

const scenario = { outletId: "kondapur", inputs: { workMinutes: 35, queueWork: 0, stations: 4, minimum: 25, hour: 19 },
  history: "full", elapsedMinutes: 0, overrideMinutes: null };

describe("AI demonstration recovery policies", () => {
  it("keeps the outlet minimum and alerts exactly ten minutes past the promise", () => {
    expect(automationPreview(15, 25, 34, null)).toMatchObject({ promisedMinutes: 25, managerAlert: false, lateByMinutes: 9 });
    const late = automationPreview(15, 25, 35, null);
    expect(late).toMatchObject({ promisedMinutes: 25, managerAlert: true, lateByMinutes: 10, delivery: "preview-only" });
    expect(late.updates.map(item => item.kind)).toEqual(["PLACED", "LATE", "MANAGER_ALERT"]);
  });
  it("applies a manager override from now, rejects a lower minimum and clears the previous late condition", () => {
    expect(automationPreview(25, 25, 40, 30)).toMatchObject({ originalPromise: 25, promisedMinutes: 70, remainingMinutes: 30,
      overrideApplied: true, managerAlert: false, lateByMinutes: 0 });
    expect(() => automationPreview(25, 25, 40, 24)).toThrow();
  });
  it("validates bounded scenario inputs and never accepts source overrides or recipients", () => {
    expect(aiScenarioSchema.safeParse(scenario).success).toBe(true);
    for (const changed of [{ inputs: { ...scenario.inputs, stations: 0 } }, { inputs: { ...scenario.inputs, queueWork: Infinity } },
      { inputs: { ...scenario.inputs, hour: 24 } }, { overrideMinutes: 24 }, { history: "live" }, { recipient: "someone@example.com" }])
      expect(aiScenarioSchema.safeParse({ ...scenario, ...changed }).success).toBe(false);
  });
  it("gives a usable explanation for unfamiliar workloads and incomplete history", () => {
    expect(predictionFallbackReason("demo-rules-v1:insufficient-history")).toContain("60");
    expect(predictionFallbackReason("demo-rules-v1:outside-observed-load")).toContain("outside");
    expect(predictionFallbackReason("unknown")).toContain("fallback");
  });
});
