import { describe, expect, it } from "vitest";
import { estimatePreparation } from "../src/lib/domain";
import { learnedPreparationEstimate, preparationHour, preparationSampleFromOrder, syntheticPreparationEstimate,
  type PreparationInputs, type PreparationSample } from "../src/lib/preparation-model";

const now = new Date("2026-11-05T18:00:00Z");
const inputs: PreparationInputs = { workMinutes: 35, queueWork: 50, stations: 4, minimum: 10, hour: 19 };
function history(count = 90): PreparationSample[] {
  return Array.from({ length: count }, (_, i) => {
    const sample = { workMinutes: 20 + (i % 10) * 3, queueWork: i * 17 % 100,
      stations: 3 + i % 3, minimum: 10, hour: 18 + (i % 5) * 0.5 };
    // Only fixture data in this unit test. Never seeded or used for production fitting.
    const actualMinutes = 8 + 0.6 * sample.workMinutes + 0.2 * sample.queueWork / sample.stations
      + 2 * Math.sin(sample.hour * Math.PI / 12);
    const placedAt = new Date(now.getTime() - (count + 2 - i) * 2 * 60 * 60_000);
    return { ...sample, source: "live", actualMinutes, placedAt,
      completedAt: new Date(placedAt.getTime() + actualMinutes * 60_000) };
  });
}

describe("bounded history-trained preparation predictor", () => {
  it("learns from qualifying history only when chronological holdout beats the rule", () => {
    const result = learnedPreparationEstimate(inputs, history(), now);
    expect(result.fallback).toBe(false);
    expect(result.modelVersion).toMatch(/^ridge-prep-v1:[a-f0-9]{12}$/);
    expect(result.trainingSamples).toBe(90);
    expect(result.validationMae).toBeLessThan(result.baselineMae! * 0.9);
    expect(result.minutes).toBeGreaterThanOrEqual(inputs.minimum);
    expect(result.minutes).toBeLessThan(estimatePreparation(35, 50, 10, 4).minutes);
    expect(learnedPreparationEstimate(inputs, history(), now)).toEqual(result);
  });

  it("preserves the outlet floor even when the qualified prediction is lower", () => {
    const result = learnedPreparationEstimate({ ...inputs, minimum: 100 }, history(), now);
    expect(result.fallback).toBe(false);
    expect(result.rawMinutes).toBeLessThan(100);
    expect(result.minutes).toBe(100);
  });

  it("does not fit demo data, seed rows without snapshots, or sparse live history", () => {
    const demos = history().map((sample) => ({ ...sample, source: "demo" }));
    expect(learnedPreparationEstimate(inputs, demos, now).trainingSamples).toBe(0);
    const sparse = learnedPreparationEstimate(inputs, history(59), now);
    expect(sparse.modelVersion).toBe("rules-v1:insufficient-history");
    expect(sparse.minutes).toBe(estimatePreparation(35, 50, 10, 4).minutes);
    expect(learnedPreparationEstimate(inputs, history(), now, false).modelVersion).toBe("rules-v1:demo-or-test-payment");
    expect(preparationSampleFromOrder({ workMinutes: 30, placedAt: now, readyAt: now,
      estimateSource: null, estimateQueueWork: null, estimateStations: null,
      estimateMinimumMinutes: null, estimateHour: null })).toBeNull();
  });

  it("keeps synthetic and live training sources separate even in a mixed history", () => {
    const realHistory = history();
    const synthetic = realHistory.map((sample) => ({ ...sample, source: "synthetic-demo" }));
    expect(learnedPreparationEstimate(inputs, synthetic, now).trainingSamples).toBe(0);
    expect(syntheticPreparationEstimate(inputs, realHistory, now).trainingSamples).toBe(0);
    expect(learnedPreparationEstimate(inputs, [...realHistory, ...synthetic], now)).toEqual(learnedPreparationEstimate(inputs, realHistory, now));
    expect(syntheticPreparationEstimate(inputs, [...synthetic, ...realHistory], now)).toEqual(syntheticPreparationEstimate(inputs, synthetic, now));
  });

  it("keeps the rule when it is as accurate as the proposed model", () => {
    const samples = history().map((sample) => {
      const actualMinutes = estimatePreparation(sample.workMinutes, sample.queueWork, sample.minimum, sample.stations).minutes;
      return { ...sample, actualMinutes, completedAt: new Date(sample.placedAt.getTime() + actualMinutes * 60_000) };
    });
    const result = learnedPreparationEstimate(inputs, samples, now);
    expect(result.fallback).toBe(true);
    expect(result.modelVersion).toBe("rules-v1:validation-gate");
    expect(result.baselineMae).toBe(0);
  });

  it("falls back for unseen queue sizes, staffing and times of day", () => {
    for (const changed of [{ queueWork: 1000 }, { stations: 20 }, { hour: 7 }]) {
      const result = learnedPreparationEstimate({ ...inputs, ...changed }, history(), now);
      expect(result.fallback).toBe(true);
      expect(result.modelVersion).toBe("rules-v1:outside-observed-load");
    }
  });

  it("ignores future outcomes and orders outside the recent history window", () => {
    const future = history().map((sample) => ({ ...sample, completedAt: new Date(now.getTime() + 60_000) }));
    expect(learnedPreparationEstimate(inputs, future, now).trainingSamples).toBe(0);
    const stale = history().map((sample) => ({ ...sample, placedAt: new Date("2026-01-01"), completedAt: new Date("2026-01-02") }));
    expect(learnedPreparationEstimate(inputs, stale, now).trainingSamples).toBe(0);
  });

  it("purges training labels that were unknown when holdout orders arrived", () => {
    const samples = history().map((sample, i) => ({ ...sample,
      placedAt: new Date(now.getTime() - (180 - i) * 60_000),
      completedAt: new Date(now.getTime() - (180 - i - 100) * 60_000), actualMinutes: 100,
    }));
    expect(learnedPreparationEstimate(inputs, samples, now).modelVersion).toBe("rules-v1:insufficient-chronological-history");
  });

  it("bounds training to 300 observations and retains a stable safe numeric fallback", () => {
    expect(learnedPreparationEstimate(inputs, history(360), now).trainingSamples).toBe(300);
    const invalid = learnedPreparationEstimate({ ...inputs, stations: 0 }, history(), now);
    expect(invalid.fallback).toBe(true);
    expect(invalid.minutes).toBe(inputs.minimum);
    expect(preparationHour(new Date("2026-11-05T20:15:00Z"))).toBe(1.75);
  });

  it("converts real order snapshots without confusing zero queue with missing data", () => {
    const row = { workMinutes: 30, placedAt: new Date("2026-11-05T12:00:00Z"), readyAt: new Date("2026-11-05T12:30:00Z"),
      estimateSource: "live", estimateQueueWork: 0, estimateStations: 4, estimateMinimumMinutes: 25, estimateHour: 17.5 };
    expect(preparationSampleFromOrder(row)).toMatchObject({ actualMinutes: 30, queueWork: 0 });
    expect(preparationSampleFromOrder({ ...row, estimateSource: "demo" })).toBeNull();
  });
});
