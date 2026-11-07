import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db";
import { getAIWorkspace, runAIScenario } from "../../src/lib/ai-workspace";
import type { AuthUser } from "../../src/lib/auth";
import type { AIScenario } from "../../src/lib/automation-preview";

let admin: AuthUser, manager: AuthUser, customer: AuthUser;
const scenario: AIScenario = { outletId: "kondapur", inputs: { workMinutes: 35, queueWork: 50, stations: 4, minimum: 25, hour: 19 },
  history: "full", elapsedMinutes: 0, overrideMinutes: null };
beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
  [admin, manager, customer] = await Promise.all(["demo-admin", "demo-manager", "demo-customer"].map(id => db.user.findUniqueOrThrow({ where: { id }, include: { outlet: true } })));
});
beforeEach(() => { vi.stubEnv("DEMO_MODE", "true"); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected provider request"))); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
afterAll(() => db.$disconnect());

describe.sequential("management AI demonstration", () => {
  it("reports actual queue context and limits manager access to the assigned kitchen", async () => {
    const overview = await getAIWorkspace(admin, "kondapur");
    const queue = await db.order.aggregate({ where: { outletId: "kondapur", status: { in: ["PLACED", "PREPARING"] } }, _sum: { workMinutes: true } });
    expect(overview.outlets).toHaveLength(3);
    expect(overview.evaluation.input.inputs.queueWork).toBe(queue._sum.workMinutes || 0);
    const scoped = await getAIWorkspace(manager, null);
    expect(scoped.outlets.map(outlet => outlet.id)).toEqual([manager.outletId]);
    await expect(getAIWorkspace(manager, "gachibowli")).rejects.toMatchObject({ status: 403 });
    await expect(runAIScenario(customer, scenario)).rejects.toMatchObject({ status: 403 });
    await expect(runAIScenario(manager, { ...scenario, outletId: "gachibowli" })).rejects.toMatchObject({ status: 403 });
  });
  it("demonstrates learning, fallbacks, late updates and recovery without changing data or sending messages", async () => {
    const counts = () => Promise.all([db.order.count(), db.message.count(), db.audit.count(), db.user.count()]);
    const before = await counts();
    const learned = await runAIScenario(admin, scenario);
    expect(learned.prediction.modelVersion).toMatch(/^demo-ridge-prep-v1:/);
    const limited = await runAIScenario(admin, { ...scenario, history: "limited" });
    expect(limited.prediction.modelVersion).toBe("demo-rules-v1:insufficient-history");
    const outside = await runAIScenario(admin, { ...scenario, inputs: { ...scenario.inputs, queueWork: 10000 } });
    expect(outside.prediction.modelVersion).toBe("demo-rules-v1:outside-observed-load");
    const longWait = await runAIScenario(admin, { ...scenario, inputs: { ...scenario.inputs, queueWork: 10000 }, elapsedMinutes: outside.prediction.minutes + 10 });
    expect(longWait.automation.managerAlert).toBe(true);
    const late = await runAIScenario(admin, { ...scenario, elapsedMinutes: learned.prediction.minutes + 10 });
    expect(late.automation.managerAlert).toBe(true);
    expect(late.automation.delivery).toBe("preview-only");
    const changed = await runAIScenario(admin, { ...scenario, elapsedMinutes: 100, overrideMinutes: 30 });
    expect(changed.automation).toMatchObject({ managerAlert: false, remainingMinutes: 30, overrideApplied: true });
    expect(await counts()).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires explicit demo/test configuration and rejects missing kitchens", async () => {
    vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("ALLOW_PUBLIC_TEST_PAYMENTS", "false");
    await expect(runAIScenario(admin, scenario)).rejects.toMatchObject({ status: 409 });
    vi.stubEnv("ALLOW_PUBLIC_TEST_PAYMENTS", "true"); vi.stubEnv("PAYMENT_PROVIDER", "razorpay"); vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_fixture");
    await expect(runAIScenario(admin, scenario)).rejects.toMatchObject({ status: 409 });
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_fixture");
    expect((await runAIScenario(admin, scenario)).prediction.modelVersion).toMatch(/^demo-ridge/);
    await expect(runAIScenario(admin, { ...scenario, outletId: "missing-kitchen" })).rejects.toMatchObject({ status: 404 });
  });
});
