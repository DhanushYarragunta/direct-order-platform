import { NextResponse } from "next/server";
import { requireUser, rateLimit } from "@/lib/auth";
import { api } from "@/lib/http";
import { exportAccount } from "@/lib/privacy";

export async function GET() {
  let data: Awaited<ReturnType<typeof exportAccount>> | undefined;
  const error = await api(async () => {
    const user = await requireUser();
    await rateLimit(`export:${user.id}`, 3);
    data = await exportAccount(user.id);
    return { ok: true };
  });
  if (!data) return error;
  return NextResponse.json(data, { headers: {
    "Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="deccan-account-data.json"',
  } });
}
