import { requireUser } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { aiScenarioSchema } from "@/lib/automation-preview";
import { getAIWorkspace, runAIScenario } from "@/lib/ai-workspace";

export async function GET(request: Request) {
  return api(async () => getAIWorkspace(await requireUser(["ADMIN", "MANAGER"]), new URL(request.url).searchParams.get("outlet")));
}

export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser(["ADMIN", "MANAGER"]);
    return runAIScenario(user, await body(request, aiScenarioSchema));
  });
}
