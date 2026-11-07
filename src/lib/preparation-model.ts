import { createHash } from "node:crypto";
import { estimatePreparation } from "./domain";

export const MAX_PREPARATION_HISTORY = 300;
export const MIN_PREPARATION_HISTORY = 60;
const MAX_HISTORY_AGE_MS = 90 * 86400_000;
const MODEL_VERSION = "ridge-prep-v1";

export type PreparationInputs = {
  workMinutes: number;
  queueWork: number;
  stations: number;
  minimum: number;
  hour: number;
};
export type PreparationSample = PreparationInputs & {
  source: string;
  placedAt: Date;
  completedAt: Date;
  actualMinutes: number;
};
export type PreparationPrediction = {
  minutes: number;
  rawMinutes: number;
  fallback: boolean;
  modelVersion: string;
  trainingSamples: number;
  validationMae: number | null;
  baselineMae: number | null;
};

export function preparationHour(now: Date) {
  return (now.getUTCHours() + now.getUTCMinutes() / 60 + 5.5) % 24;
}

function validInputs(input: PreparationInputs) {
  return [input.workMinutes, input.queueWork, input.stations, input.minimum, input.hour].every(Number.isFinite) && input.workMinutes >= 0 && input.workMinutes <= 100_000
    && input.queueWork >= 0 && input.queueWork <= 1_000_000 && input.stations >= 1 && input.stations <= 200
    && input.minimum >= 1 && input.minimum <= 180 && input.hour >= 0 && input.hour < 24;
}
const baseline = (input: PreparationInputs) => estimatePreparation(input.workMinutes, input.queueWork, input.minimum, input.stations);
const features = (input: PreparationInputs) => [
  input.workMinutes, input.queueWork / input.stations, 1 / input.stations,
  Math.sin(input.hour * Math.PI / 12), Math.cos(input.hour * Math.PI / 12),
];

type FittedModel = {
  means: number[];
  scales: number[];
  weights: number[];
  samples: PreparationSample[];
};

// Six coefficients, at most 300 rows. The normal equation is regularized and
// solved with partial pivoting; no remote model request or unbounded training.
function solve(matrix: number[][], target: number[]) {
  const rows = matrix.map((row, i) => [...row, target[i]]);
  for (let column = 0; column < target.length; column++) {
    let pivot = column;
    for (let row = column + 1; row < rows.length; row++)
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-9) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let j = column; j <= target.length; j++) rows[column][j] /= divisor;
    for (let row = 0; row < rows.length; row++) {
      if (row === column) continue;
      const multiplier = rows[row][column];
      for (let j = column; j <= target.length; j++) rows[row][j] -= multiplier * rows[column][j];
    }
  }
  const result = rows.map((row) => row[target.length]);
  return result.every(Number.isFinite) ? result : null;
}

function fit(samples: PreparationSample[]): FittedModel | null {
  const x = samples.map(features), dimensions = x[0].length;
  const means = Array.from({ length: dimensions }, (_, i) => x.reduce((sum, row) => sum + row[i], 0) / x.length);
  const scales = means.map((mean, i) => Math.max(1e-3, Math.sqrt(x.reduce((sum, row) => sum + (row[i] - mean) ** 2, 0) / x.length)));
  const normalized = x.map((row) => [1, ...row.map((value, i) => (value - means[i]) / scales[i])]);
  const size = dimensions + 1;
  const matrix = Array.from({ length: size }, () => Array<number>(size).fill(0)), target = Array<number>(size).fill(0);
  for (let row = 0; row < samples.length; row++) for (let i = 0; i < size; i++) {
    target[i] += normalized[row][i] * samples[row].actualMinutes;
    for (let j = 0; j < size; j++) matrix[i][j] += normalized[row][i] * normalized[row][j];
  }
  // The intercept is unpenalized; slope shrinkage prevents a small sample from
  // fitting extreme queue/time coefficients.
  for (let i = 1; i < size; i++) matrix[i][i] += 5;
  const weights = solve(matrix, target);
  return weights ? { means, scales, weights, samples } : null;
}

function outsideHistory(input: PreparationInputs, samples: PreparationSample[]) {
  for (const key of ["workMinutes", "queueWork", "stations"] as const) {
    const values = samples.map((sample) => sample[key]);
    const min = Math.min(...values), max = Math.max(...values);
    const margin = Math.max(key === "stations" ? 0.25 : 1, (max - min) * 0.2);
    if (input[key] < min - margin || input[key] > max + margin) return true;
  }
  // Clock distance is circular, so midnight and 23:30 remain close.
  return !samples.some((sample) => {
    const difference = Math.abs(sample.hour - input.hour);
    return Math.min(difference, 24 - difference) <= 2;
  });
}

function predict(model: FittedModel, input: PreparationInputs) {
  const normalized = [1, ...features(input).map((value, i) => (value - model.means[i]) / model.scales[i])];
  return normalized.reduce((sum, value, i) => sum + value * model.weights[i], 0);
}
const promised = (raw: number, minimum: number) => Math.max(Math.ceil(minimum), Math.ceil(raw));

export function learnedPreparationEstimate(
  input: PreparationInputs, history: PreparationSample[], now = new Date(), allowLearning = true,
): PreparationPrediction {
  return preparationEstimateFromHistory(input, history, now, allowLearning, {
    source: "live", modelVersion: MODEL_VERSION, ruleVersion: "rules-v1",
  });
}

// Synthetic examples have a separate entry point and provenance. They can never
// pass through the live estimator, even if a caller combines both histories.
export function syntheticPreparationEstimate(
  input: PreparationInputs, history: PreparationSample[], now: Date,
): PreparationPrediction {
  return preparationEstimateFromHistory(input, history, now, true, {
    source: "synthetic-demo", modelVersion: "demo-ridge-prep-v1", ruleVersion: "demo-rules-v1",
  });
}

function preparationEstimateFromHistory(
  input: PreparationInputs, history: PreparationSample[], now: Date, allowLearning: boolean,
  profile: { source: "live" | "synthetic-demo"; modelVersion: string; ruleVersion: string },
): PreparationPrediction {
  const safe = baseline(input);
  let samples: PreparationSample[] = [];
  let validationMae: number | null = null, baselineMae: number | null = null;
  const fallback = (reason: string): PreparationPrediction => ({
    minutes: safe.minutes, rawMinutes: safe.minutes, fallback: true,
    modelVersion: `${profile.ruleVersion}:${reason}`, trainingSamples: samples.length, validationMae, baselineMae,
  });
  if (!validInputs(input)) return fallback("invalid-input");
  if (!allowLearning) return fallback("demo-or-test-payment");
  samples = history.filter((sample) => sample.source === profile.source && validInputs(sample)
    && Number.isFinite(sample.actualMinutes) && sample.actualMinutes >= 1 && sample.actualMinutes <= 180
    && Number.isFinite(sample.placedAt.getTime()) && Number.isFinite(sample.completedAt.getTime())
    && sample.placedAt.getTime() >= now.getTime() - MAX_HISTORY_AGE_MS
    && sample.completedAt <= now && sample.completedAt > sample.placedAt)
    .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime()).slice(-MAX_PREPARATION_HISTORY);
  if (samples.length < MIN_PREPARATION_HISTORY) return fallback("insufficient-history");
  const split = Math.floor(samples.length * 0.8), validation = samples.slice(split);
  // A training target must have been known before validation orders arrived.
  // Removing overlapping in-flight orders prevents chronological label leakage.
  const train = samples.slice(0, split).filter((sample) => sample.completedAt <= validation[0].placedAt);
  if (train.length < 40 || validation.length < 12) return fallback("insufficient-chronological-history");
  const candidate = fit(train);
  if (!candidate) return fallback("unstable-fit");
  if (candidate.weights[1] < 0 || candidate.weights[2] < 0) return fallback("non-monotone-load-fit");
  let modelError = 0, baselineError = 0;
  for (const sample of validation) {
    const rule = baseline(sample).minutes, raw = predict(candidate, sample);
    const prediction = outsideHistory(sample, train) || !Number.isFinite(raw) || raw < 1 || raw > 180 ? rule : promised(raw, sample.minimum);
    modelError += Math.abs(prediction - sample.actualMinutes);
    baselineError += Math.abs(rule - sample.actualMinutes);
  }
  validationMae = modelError / validation.length;
  baselineMae = baselineError / validation.length;
  if (validationMae > baselineMae * 0.9 || baselineMae - validationMae < 0.5) return fallback("validation-gate");
  if (outsideHistory(input, samples)) return fallback("outside-observed-load");
  const final = fit(samples);
  if (!final) return fallback("unstable-fit");
  if (final.weights[1] < 0 || final.weights[2] < 0) return fallback("non-monotone-load-fit");
  const rawMinutes = predict(final, input);
  if (!Number.isFinite(rawMinutes) || rawMinutes < 1 || rawMinutes > 180) return fallback("unsafe-prediction");
  const digest = createHash("sha256").update(JSON.stringify(samples.map((sample) => [
    sample.placedAt.toISOString(), sample.completedAt.toISOString(), ...features(sample), sample.minimum, sample.actualMinutes,
  ]))).digest("hex").slice(0, 12);
  return { minutes: promised(rawMinutes, input.minimum), rawMinutes, fallback: false,
    modelVersion: `${profile.modelVersion}:${digest}`, trainingSamples: samples.length, validationMae, baselineMae };
}

export function preparationSampleFromOrder(order: {
  workMinutes: number; placedAt: Date | null; readyAt: Date | null;
  estimateSource: string | null; estimateQueueWork: number | null; estimateStations: number | null;
  estimateMinimumMinutes: number | null; estimateHour: number | null;
}): PreparationSample | null {
  if (!order.placedAt || !order.readyAt || order.estimateQueueWork === null || order.estimateStations === null
    || order.estimateMinimumMinutes === null || order.estimateHour === null || order.estimateSource !== "live") return null;
  return { source: order.estimateSource, placedAt: order.placedAt, completedAt: order.readyAt,
    actualMinutes: (order.readyAt.getTime() - order.placedAt.getTime()) / 60_000,
    workMinutes: order.workMinutes, queueWork: order.estimateQueueWork, stations: order.estimateStations,
    minimum: order.estimateMinimumMinutes, hour: order.estimateHour };
}
