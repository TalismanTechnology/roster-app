import "server-only";

import fs from "node:fs";
import path from "node:path";

import { AVATAR_EXTENSION, LOCAL_AVATAR_FILE, LOCAL_AVATAR_PREFIX, type AvatarType } from "@/lib/avatars";

import { dataDir } from "./paths";

/**
 * Local-mode avatar files, under `<data dir>/avatars/`. The Supabase adapter
 * keeps the same shape in Storage — one prefix per profile, a versioned file
 * name per upload, older versions removed — so dev and e2e exercise the same
 * flow without a bucket.
 */

function avatarsDir(): string {
  return path.join(dataDir(), "avatars");
}

/** Writes the file and returns the URL to store in `avatar_url`. */
export function writeAvatar(profileId: string, bytes: Uint8Array, type: AvatarType): string {
  const file = `${profileId}-${Date.now().toString(36)}.${AVATAR_EXTENSION[type]}`;
  fs.mkdirSync(avatarsDir(), { recursive: true });
  fs.writeFileSync(path.join(avatarsDir(), file), bytes);
  return `${LOCAL_AVATAR_PREFIX}${file}`;
}

/** Removes every avatar file the profile owns except `keepUrl`. Best effort. */
export function removeAvatars(profileId: string, keepUrl: string | null = null): void {
  const keep = keepUrl?.startsWith(LOCAL_AVATAR_PREFIX) ? keepUrl.slice(LOCAL_AVATAR_PREFIX.length) : null;
  let files: string[];
  try {
    files = fs.readdirSync(avatarsDir());
  } catch {
    return;
  }
  for (const file of files) {
    if (file.startsWith(`${profileId}-`) && file !== keep && LOCAL_AVATAR_FILE.test(file)) {
      fs.rmSync(path.join(avatarsDir(), file), { force: true });
    }
  }
}

const TYPE_OF: Record<string, AvatarType> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** The file behind a local avatar URL's last segment, or null. The name is
 *  matched against the strict pattern first, so no path can escape the dir. */
export function readAvatar(file: string): { bytes: Buffer; type: AvatarType } | null {
  if (!LOCAL_AVATAR_FILE.test(file)) return null;
  try {
    const bytes = fs.readFileSync(path.join(avatarsDir(), file));
    return { bytes, type: TYPE_OF[file.split(".").pop() ?? ""] };
  } catch {
    return null;
  }
}
