import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizePhoto } from "../src/lib/media";
import { isMenuPhoto } from "../src/lib/photo-policy";

describe("menu photo safety", () => {
  it("rejects paths, remote URLs, SVG and oversized files", async () => {
    for (const value of ["https://example.com/p.jpg", "/api/media/../../secret", "/api/media/photo.svg", "data:image/png;base64,x"])
      expect(isMenuPhoto(value)).toBe(false);
    expect(isMenuPhoto("/api/media/" + "a".repeat(32) + ".webp")).toBe(true);
    expect(isMenuPhoto("/food/mutton-haleem.jpg")).toBe(true);
    await expect(normalizePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'))).rejects.toThrow("valid, still");
    await expect(normalizePhoto(new Uint8Array(3 * 1024 * 1024 + 1))).rejects.toThrow("under 3 MB");
  });
  it("decodes, resizes and strips metadata before serving WebP", async () => {
    const input = await sharp({ create: { width: 1800, height: 900, channels: 3, background: "red" } }).withMetadata().jpeg().toBuffer();
    const output = await normalizePhoto(input), meta = await sharp(output).metadata();
    expect(meta.format).toBe("webp"); expect(meta.width).toBe(1600); expect(meta.height).toBe(800); expect(meta.exif).toBeUndefined();
  });
});
