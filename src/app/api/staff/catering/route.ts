import { requireUser } from "@/lib/auth";
import { api } from "@/lib/http";
import { listCatering } from "@/lib/catering";

export async function GET(request: Request) {
  return api(async () =>
    listCatering(
      await requireUser(["ADMIN", "MANAGER"]),
      new URL(request.url).searchParams,
      true,
    ),
  );
}
