import "server-only";
import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeImage, type MediaPurpose } from "@/lib/media-image";
import { getRepository, isLocalMode } from "@/lib/data";
import { dataDir } from "@/lib/data/local/paths";
import { DataError } from "@/lib/data/types";
import { getNetworkRepository } from "@/lib/network";
import { createClient } from "@/lib/supabase/server";

export { MAX_UPLOAD_BYTES, type MediaPurpose } from "@/lib/media-image";
export const MEDIA_BUCKET = "roster-media";
const MEDIA_PATH = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/;
export function validMediaPath(value: string): boolean { return MEDIA_PATH.test(value); }
function localPath(value: string) {
  if (!validMediaPath(value)) throw new DataError("invalid", "This photo could not be found.");
  return path.join(dataDir(), "media", value);
}

/** Normalize uploaded images, stripping metadata and refusing animated/oversized input. */
export async function storeImage(file: File, purpose: MediaPurpose, ownerId: string): Promise<string> {
  const normalized = await normalizeImage(file, purpose);
  const key = `${ownerId}/${randomUUID()}.webp`;
  if (isLocalMode()) {
    const destination = localPath(key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, normalized, { flag: "wx", mode: 0o600 });
  } else {
    const { error } = await (await createClient()).storage.from(MEDIA_BUCKET).upload(key, normalized, { contentType: "image/webp", upsert: false });
    if (error) throw new DataError("unavailable", "Photo upload failed. Please try again.");
  }
  return key;
}

export async function ownedImageExists(key: string, ownerId: string): Promise<boolean> {
  if (!validMediaPath(key) || key.split("/")[0] !== ownerId) return false;
  if (isLocalMode()) return stat(localPath(key)).then(info => info.isFile()).catch(() => false);
  const { data, error } = await (await createClient()).storage.from(MEDIA_BUCKET).info(key);
  return !error && Boolean(data);
}

/** Exact public profile references are shareable; post attachments require network authorization. */
export async function mayReadImage(key: string, viewerId: string | null): Promise<boolean> {
  if (!validMediaPath(key)) return false;
  const ownerId = key.split("/")[0];
  if (ownerId === viewerId) return true;
  const profile = await (await getRepository()).getProfileById(ownerId);
  if (profile && profile.visibility !== "private" && [profile.avatar_url, profile.cover_url].includes(`/api/media/${key}`)) return true;
  if (!viewerId) return false;
  const network = await getNetworkRepository();
  const membership = await network.getMembership();
  return membership?.status === "active" && await network.canReadMedia(key);
}

export async function readImage(key: string): Promise<Uint8Array | null> {
  if (isLocalMode()) {
    try { return new Uint8Array(await readFile(localPath(key))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  const { data, error } = await (await createClient()).storage.from(MEDIA_BUCKET).download(key);
  if (error) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeLocalAccountMedia(ownerId: string): Promise<void> {
  if (!/^[a-f0-9-]{36}$/.test(ownerId)) throw new Error("Invalid media owner");
  await rm(path.join(dataDir(), "media", ownerId), { recursive: true, force: true });
}
