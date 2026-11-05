import { readFile } from "node:fs/promises";
import path from "node:path";
import { uploadDirectory } from "@/lib/media";
import { MEDIA_FILE } from "@/lib/photo-policy";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (!MEDIA_FILE.test(file)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(uploadDirectory(), file));
    return new Response(bytes, { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
