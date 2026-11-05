import { requireUser, AppError, rateLimit } from "@/lib/auth";
import { api, checkOrigin } from "@/lib/http";
import { storePhoto } from "@/lib/media";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser(["ADMIN"]); checkOrigin(request);
    await rateLimit(`photo:${user.id}`, 20);
    const reader = request.body?.getReader();
    if (!reader) throw new AppError(400, "Choose a photo");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 3 * 1024 * 1024) { await reader.cancel(); throw new AppError(413, "Choose a photo under 3 MB"); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    return { photo: await storePhoto(Buffer.concat(chunks)) };
  }, 201);
}
