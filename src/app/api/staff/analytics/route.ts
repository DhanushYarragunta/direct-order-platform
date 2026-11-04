import { requireUser } from "@/lib/auth";
import { api } from "@/lib/http";
import { getAnalytics, reportDays } from "@/lib/analytics";

export async function GET(request: Request) {
  return api(async () => {
    const user = await requireUser(["ADMIN", "MANAGER", "KITCHEN"]);
    const params = new URL(request.url).searchParams;
    return getAnalytics(user, params.get("outlet"), reportDays(params.get("days")));
  });
}
