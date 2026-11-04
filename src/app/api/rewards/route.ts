import { api } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { rewardsSummary } from "@/lib/rewards";

export async function GET() {
  return api(async () => rewardsSummary((await requireUser(["CUSTOMER"])).id));
}
