import sharp from "sharp";
import { DataError } from "@/lib/data/types";

export type MediaPurpose = "avatar" | "cover" | "post";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Decode and re-encode uploads before storage; never retain supplied image metadata. */
export async function normalizeImage(file: File, purpose: MediaPurpose): Promise<Buffer> {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new DataError("invalid", "Choose a photo smaller than 10 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new DataError("invalid", "Choose a JPEG, PNG, or WebP photo.");
  const input = Buffer.from(await file.arrayBuffer());
  try {
    const source = sharp(input, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await source.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
    const size = purpose === "avatar" ? 800 : 1920;
    return await source.rotate().resize(size, size, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new DataError("invalid", "That photo could not be opened. Choose a still image under 40 megapixels.");
  }
}
