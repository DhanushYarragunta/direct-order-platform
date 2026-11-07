import { db } from "./db";
import { AppError, staffOutlet, type AuthUser } from "./auth";
import { estimatePreparation } from "./domain";
import { communicationCapabilities } from "./communications";
import { preparationHour } from "./preparation-model";
import { DEMO_PREPARATION_HISTORY_METADATA, demoPrediction, demoPreparationEnabled } from "./preparation-demo";
import { aiScenarioSchema, automationPreview, predictionFallbackReason, type AIScenario } from "./automation-preview";

function requireDemonstration(user: AuthUser) {
  if (!["ADMIN", "MANAGER"].includes(user.role)) throw new AppError(403, "Management access is required");
  if (!demoPreparationEnabled()) throw new AppError(409, "Sample AI scenarios are available only in demonstration or explicitly enabled test checkout mode.");
}

export function evaluateAIScenario(input: AIScenario) {
  const scenario = aiScenarioSchema.parse(input);
  const prediction = demoPrediction(scenario.inputs, { historyLimit: scenario.history === "limited" ? 20 : undefined });
  return { prediction, baselineMinutes: estimatePreparation(scenario.inputs.workMinutes, scenario.inputs.queueWork, scenario.inputs.minimum, scenario.inputs.stations).minutes,
    fallbackReason: prediction.fallback ? predictionFallbackReason(prediction.modelVersion) : null,
    automation: automationPreview(prediction.minutes, scenario.inputs.minimum, scenario.elapsedMinutes, scenario.overrideMinutes),
    input: scenario, dataset: DEMO_PREPARATION_HISTORY_METADATA };
}

export async function getAIWorkspace(user: AuthUser, requestedOutlet: string | null) {
  requireDemonstration(user);
  const outlets = await db.outlet.findMany({
    where: user.role === "ADMIN" ? {} : { id: user.outletId || "" }, orderBy: { name: "asc" },
    select: { id: true, name: true, minPrepMinutes: true, activeStations: true },
  });
  const outletId = requestedOutlet || user.outletId || outlets[0]?.id;
  if (!outletId) throw new AppError(404, "No kitchen is available");
  staffOutlet(user, outletId);
  const outlet = outlets.find(item => item.id === outletId);
  if (!outlet) throw new AppError(404, "Kitchen not found");
  const queue = await db.order.aggregate({ where: { outletId, status: { in: ["PLACED", "PREPARING"] } }, _sum: { workMinutes: true }, _count: true });
  const capabilities = communicationCapabilities();
  const input: AIScenario = { outletId, inputs: { workMinutes: 35, queueWork: queue._sum.workMinutes || 0,
    minimum: outlet.minPrepMinutes, stations: outlet.activeStations, hour: Math.round(preparationHour(new Date()) * 100) / 100 }, history: "full", elapsedMinutes: 0, overrideMinutes: null };
  return { outlets, outletId, queuedOrders: queue._count, checkedAt: new Date().toISOString(), evaluation: evaluateAIScenario(input),
    communications: { email: capabilities.transactionalEmail, sms: capabilities.transactionalSms },
    backgroundEnabled: process.env.RUN_BACKGROUND_JOBS !== "false" };
}

export async function runAIScenario(user: AuthUser, input: AIScenario) {
  requireDemonstration(user);
  const scenario = aiScenarioSchema.parse(input);
  staffOutlet(user, scenario.outletId);
  if (!await db.outlet.count({ where: { id: scenario.outletId } })) throw new AppError(404, "Kitchen not found");
  return evaluateAIScenario(scenario);
}

export type AIWorkspaceData = Awaited<ReturnType<typeof getAIWorkspace>>;
export type AIScenarioResult = ReturnType<typeof evaluateAIScenario>;
