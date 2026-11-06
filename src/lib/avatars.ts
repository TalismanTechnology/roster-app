/**
 * Athlete avatars: the rules both adapters, the upload action, and every
 * place that renders one agree on. Isomorphic and pure — the editor's resize
 * step reads the same limits the server enforces, and the unit tests run
 * exactly this.
 *
 * The browser does the heavy lifting: it crops to a square, scales to
 * `AVATAR_SIZE_PX`, and re-encodes as JPEG before anything is sent, so the
 * server only ever checks bytes it could have produced itself.
 */

/** Square edge, in pixels, the editor scales every upload to. */
export const AVATAR_SIZE_PX = 512;

/** Comfortably above a 512px JPEG at q≈0.85, well under the 1 MB Server Action body limit. */
export const AVATAR_MAX_BYTES = 512 * 1024;

export type AvatarType = "image/jpeg" | "image/png" | "image/webp";

export const AVATAR_EXTENSION: Record<AvatarType, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * The image type from its leading bytes, or null for anything else. The
 * declared Content-Type of an upload is the client's claim; the signature
 * is what the file is.
 */
export function sniffAvatarType(bytes: Uint8Array): AvatarType | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 &&
    at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && // RIFF
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50 // WEBP
  ) {
    return "image/webp";
  }
  return null;
}

/** Where local mode serves avatars from (src/app/media/avatars/[file]). */
export const LOCAL_AVATAR_PREFIX = "/media/avatars/";

/** `<profile uuid>-<stamp>.<ext>` — versioned, so a new upload is a new URL and caches never go stale. */
export const LOCAL_AVATAR_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9]{1,16}\.(jpg|png|webp)$/;

/**
 * Whether a stored `avatar_url` may be rendered. An athlete can write the
 * column directly through PostgREST, so the page trusts only the two places
 * Roster itself puts avatars: the local media route, and the public
 * `avatars` bucket in Supabase Storage. Anything else renders as no avatar
 * rather than as an arbitrary image host (CSP would block most of them
 * anyway; this keeps the page from showing a broken frame).
 */
export function isSafeAvatarUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith(LOCAL_AVATAR_PREFIX)) return LOCAL_AVATAR_FILE.test(url.slice(LOCAL_AVATAR_PREFIX.length));
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".supabase.co") &&
      parsed.pathname.startsWith("/storage/v1/object/public/avatars/") &&
      !parsed.pathname.includes("..")
    );
  } catch {
    return false;
  }
}
