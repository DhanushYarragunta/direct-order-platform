import { requireUser } from "@/lib/auth";
import { api } from "@/lib/http";
import { serviceReadiness } from "@/lib/service-readiness";

export async function GET() {
  return api(async () => {
    await requireUser(["ADMIN"]);
    return serviceReadiness();
  });
}
