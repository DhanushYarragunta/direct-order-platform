import { currentUser } from "@/lib/auth";
import { api } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => ({ user: await currentUser() }));
}
