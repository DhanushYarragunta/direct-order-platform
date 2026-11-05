import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { mkdir, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./auth";
import { MEDIA_FILE } from "./photo-policy";

export const uploadDirectory = () => path.resolve(process.env.UPLOAD_DIR || ".local/uploads");
export async function normalizePhoto(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new AppError(413, "Choose a photo under 3 MB");
  try {
    const image = sharp(bytes, { limitInputPixels: 16000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1)
      throw new Error("Unsupported format");
    // Decode and re-encode; embedded metadata and arbitrary file payloads are not preserved.
    return await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw new AppError(400, "Choose a valid, still JPEG, PNG or WebP photo under 16 megapixels"); }
}
export async function storePhoto(bytes: Uint8Array) {
  const output = await normalizePhoto(bytes), file = `${randomBytes(16).toString("hex")}.webp`;
  await mkdir(uploadDirectory(), { recursive: true });
  await writeFile(path.join(uploadDirectory(), file), output, { flag: "wx", mode: 0o644 });
  return `/api/media/${file}`;
}
export async function requireStoredPhoto(photo: string | null) {
  if (!photo?.startsWith("/api/media/")) return;
  const file = photo.slice("/api/media/".length);
  if (!MEDIA_FILE.test(file)) throw new AppError(400, "Invalid photo");
  try { await access(path.join(uploadDirectory(), file)); }
  catch { throw new AppError(400, "Upload the selected photo again; it is no longer available"); }
}
