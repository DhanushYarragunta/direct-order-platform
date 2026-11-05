import { requireUser } from "@/lib/auth";
import { baselineSchema, saveBaseline } from "@/lib/business-targets";
import { api, body } from "@/lib/http";

export async function POST(request: Request) {
  return api(async () => saveBaseline(await requireUser(["ADMIN", "MANAGER"]), await body(request, baselineSchema)), 201);
}
