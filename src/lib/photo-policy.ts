import { PHOTOS } from "./domain";

export const MEDIA_FILE = /^[a-f0-9]{32}\.webp$/;
export function isMenuPhoto(value: string) {
  return (PHOTOS as readonly string[]).includes(value)
    || (value.startsWith("/api/media/") && MEDIA_FILE.test(value.slice("/api/media/".length)));
}
