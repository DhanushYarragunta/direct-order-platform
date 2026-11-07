import { describe, expect, it } from "vitest";
import { DEMO_PREPARATION_HISTORY_METADATA, demoPrediction, demoPreparationEnabled } from "../src/lib/preparation-demo";
import { estimatePreparation } from "../src/lib/domain";
import type { PreparationInputs } from "../src/lib/preparation-model";

const inputs: PreparationInputs = { workMinutes: 35, queueWork: 0, stations: 4, minimum: 25, hour: 19 };

describe("explicit synthetic preparation demo", () => {
  it("fits repeatable synthetic history and reports its evaluation honestly", () => {
    const result = demoPrediction(inputs);
    expect(result.fallback).toBe(false);
    expect(result.modelVersion).toMatch(/^demo-ridge-prep-v1:[a-f0-9]{12}$/);
    expect(result.trainingSamples).toBe(DEMO_PREPARATION_HISTORY_METADATA.sampleCount);
    expect(result.validationMae).toBeLessThan(result.baselineMae! * 0.9);
    expect(result.baselineMae! - result.validationMae!).toBeGreaterThanOrEqual(0.5);
    expect(DEMO_PREPARATION_HISTORY_METADATA.source).toBe("synthetic-demo");
    expect(DEMO_PREPARATION_HISTORY_METADATA.evaluationLabel).toContain("not measured restaurant accuracy");
    expect(DEMO_PREPARATION_HISTORY_METADATA.trainingSampleCount + DEMO_PREPARATION_HISTORY_METADATA.validationSampleCount).toBe(result.trainingSamples);
    expect(demoPrediction(inputs)).toEqual(result);
  });

  it("respects the kitchen minimum and responds to queued work across normal demo orders", () => {
    const quiet = demoPrediction(inputs);
    const busy = demoPrediction({ ...inputs, queueWork: 250 });
    expect(quiet.minutes).toBe(inputs.minimum);
    expect(busy.minutes).toBeGreaterThan(quiet.minutes);
    expect(busy.rawMinutes).toBeGreaterThan(quiet.rawMinutes);
    for (const workMinutes of [20, 35, 100, 250, 500]) for (const queueWork of [0, 250, 1000]) {
      const result = demoPrediction({ ...inputs, workMinutes, queueWork });
      expect(result.fallback).toBe(false);
      expect(result.minutes).toBeGreaterThanOrEqual(inputs.minimum);
      expect(result.minutes).toBeLessThanOrEqual(180);
    }
    expect(demoPrediction({ ...inputs, minimum: 100 }).minutes).toBe(100);
  });

  it("retains explicit demo fallbacks for sparse history, invalid inputs and unsafe loads", () => {
    const sparse = demoPrediction(inputs, { historyLimit: 30 });
    expect(sparse.fallback).toBe(true);
    expect(sparse.modelVersion).toBe("demo-rules-v1:insufficient-history");
    expect(sparse.trainingSamples).toBe(30);
    expect(sparse.minutes).toBe(estimatePreparation(35, 0, 25, 4).minutes);
    expect(demoPrediction(inputs, { historyLimit: 0 }).trainingSamples).toBe(0);
    expect(demoPrediction(inputs, { historyLimit: -1 }).trainingSamples).toBe(0);
    expect(demoPrediction(inputs, { historyLimit: 1000 }).trainingSamples).toBe(300);
    expect(demoPrediction({ ...inputs, stations: 0 }).modelVersion).toBe("demo-rules-v1:invalid-input");
    expect(demoPrediction({ ...inputs, queueWork: 100_000 }).modelVersion).toBe("demo-rules-v1:outside-observed-load");
    expect(demoPrediction({ ...inputs, workMinutes: 600, queueWork: 2400, stations: 1 }).modelVersion).toBe("demo-rules-v1:unsafe-prediction");
  });

  it("requires explicit demo mode or every public Razorpay test opt-in condition", () => {
    expect(demoPreparationEnabled({})).toBe(false);
    expect(demoPreparationEnabled({ DEMO_MODE: "true" })).toBe(true);
    const publicTest = { DEMO_MODE: "false", ALLOW_PUBLIC_TEST_PAYMENTS: "true", PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_test_fixture" };
    expect(demoPreparationEnabled(publicTest)).toBe(true);
    expect(demoPreparationEnabled({ ...publicTest, ALLOW_PUBLIC_TEST_PAYMENTS: "false" })).toBe(false);
    expect(demoPreparationEnabled({ ...publicTest, PAYMENT_PROVIDER: "demo" })).toBe(false);
    expect(demoPreparationEnabled({ ...publicTest, RAZORPAY_KEY_ID: "rzp_live_fixture" })).toBe(false);
    expect(demoPreparationEnabled({ ...publicTest, RAZORPAY_KEY_ID: undefined })).toBe(false);
  });
});
