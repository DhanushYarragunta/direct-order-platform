import { api, checkOrigin } from "@/lib/http";
import { logout } from "@/lib/auth";
export async function POST(request: Request) {
  return api(async () => {
    checkOrigin(request);
    await logout();
    return { ok: true };
  });
}
