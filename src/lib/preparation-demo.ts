import {
  preparationHour, syntheticPreparationEstimate,
  type PreparationInputs, type PreparationPrediction, type PreparationSample,
} from "./preparation-model";

export const DEMO_PREPARATION_HISTORY_METADATA = Object.freeze({
  source: "synthetic-demo" as const,
  datasetVersion: "synthetic-kitchen-v1",
  sampleCount: 300,
  trainingSampleCount: 240,
  validationSampleCount: 60,
  evaluationLabel: "Synthetic demo evaluation — not measured restaurant accuracy",
  workMinutesRange: [0, 600] as const,
  queueWorkRange: [0, 2400] as const,
  stationsRange: [1, 12] as const,
  hourRange: [0, 24] as const,
});

type DemoPreparationEnvironment = {
  [key: string]: string | undefined;
  DEMO_MODE?: string;
  ALLOW_PUBLIC_TEST_PAYMENTS?: string;
  PAYMENT_PROVIDER?: string;
  RAZORPAY_KEY_ID?: string;
};

export function demoPreparationEnabled(env: DemoPreparationEnvironment = process.env) {
  return env.DEMO_MODE === "true" || (env.ALLOW_PUBLIC_TEST_PAYMENTS === "true"
    && env.PAYMENT_PROVIDER === "razorpay" && env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") === true);
}

// Fixed dates and a seeded generator make the training data and model digest
// reproducible. These are illustrative contexts and simulated durations, never
// database orders or evidence about a real kitchen's performance.
const evaluationTime = new Date("2026-01-15T00:00:00.000Z");
function generateDemoHistory(): PreparationSample[] {
  let state = 0xdec0cafe;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return Array.from({ length: DEMO_PREPARATION_HISTORY_METADATA.sampleCount }, (_, index) => {
    const stations = index === 0 ? 1 : index === 1 ? 12 : 1 + Math.floor(random() * 12);
    const workMinutes = index === 0 ? 0 : index === 1 ? 600 : Math.round(random() * 600);
    const queueWork = stations * (index === 0 ? 0 : index === 1 ? 200 : Math.round(random() * 200));
    const placedAt = new Date(evaluationTime.getTime() - (301 - index) * 3 * 60 * 60_000);
    const hour = preparationHour(placedAt);
    const actualMinutes = 9 + 0.19 * workMinutes + 0.22 * queueWork / stations + 4 / stations
      + 1.5 * Math.sin(hour * Math.PI / 12) - 0.5 * Math.cos(hour * Math.PI / 12) + (random() - 0.5) * 2;
    return { source: "synthetic-demo", workMinutes, queueWork, stations, minimum: 1, hour,
      placedAt, completedAt: new Date(placedAt.getTime() + actualMinutes * 60_000), actualMinutes };
  });
}

const demoHistory = generateDemoHistory();

/** Fits the bounded ridge model to synthetic data without I/O, env reads or DB writes. */
export function demoPrediction(input: PreparationInputs, options: { historyLimit?: number } = {}): PreparationPrediction {
  const limit = options.historyLimit === undefined ? demoHistory.length
    : Number.isFinite(options.historyLimit) ? Math.max(0, Math.min(demoHistory.length, Math.trunc(options.historyLimit))) : 0;
  return syntheticPreparationEstimate(input, limit === 0 ? [] : demoHistory.slice(-limit), evaluationTime);
}
