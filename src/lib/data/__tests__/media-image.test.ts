import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { normalizeImage, MAX_UPLOAD_BYTES, type MediaPurpose } from "@/lib/media-image";
import { DataError } from "@/lib/data/types";

function upload(bytes: Uint8Array, type = "image/png") {
  return new File([new Uint8Array(bytes)], "untrusted-photo.png", { type });
}

function rejectedImage(error: unknown) {
  assert.ok(error instanceof DataError);
  assert.equal(error.code, "invalid");
  return true;
}

function fixture(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#527ca3" } });
}

test("rejects empty and oversized uploads before reading their bytes", async () => {
  for (const size of [0, MAX_UPLOAD_BYTES + 1]) {
    const file = upload(new Uint8Array());
    Object.defineProperty(file, "size", { value: size });
    file.arrayBuffer = async () => { assert.fail("Rejected uploads must not be read"); };
    await assert.rejects(normalizeImage(file, "post"), rejectedImage);
  }
});

test("does not trust a permitted MIME type when the payload is SVG or GIF", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>');
  const gif = await fixture(10, 10).gif().toBuffer();
  for (const bytes of [svg, gif]) {
    await assert.rejects(normalizeImage(upload(bytes, "image/png"), "avatar"), rejectedImage);
  }
  const png = await fixture(10, 10).png().toBuffer();
  await assert.rejects(normalizeImage(upload(png, "image/svg+xml"), "avatar"), rejectedImage);
});

test("rejects corrupt image bytes and truncated JPEG data", async () => {
  const jpeg = await fixture(120, 80).jpeg().toBuffer();
  for (const bytes of [Buffer.from("not an image"), jpeg.subarray(0, Math.floor(jpeg.length / 2))]) {
    await assert.rejects(normalizeImage(upload(bytes, "image/jpeg"), "post"), rejectedImage);
  }
});

test("rejects compressed images whose decoded dimensions exceed 40 megapixels", async () => {
  const png = await fixture(8000, 5001).png().toBuffer();
  assert.ok(png.length < MAX_UPLOAD_BYTES, "The pixel limit must reject a byte-size-compliant upload");
  await assert.rejects(normalizeImage(upload(png), "cover"), rejectedImage);
});

test("rejects animated WebP uploads", async () => {
  const raw = Buffer.concat([Buffer.alloc(12 * 12 * 3, 0), Buffer.alloc(12 * 12 * 3, 255)]);
  const animated = await sharp(raw, { raw: { width: 12, height: 24, channels: 3, pageHeight: 12 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(normalizeImage(upload(animated, "image/webp"), "post"), rejectedImage);
});

test("applies EXIF orientation and strips identifying metadata from output", async () => {
  const jpeg = await fixture(120, 80).jpeg().withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: "Private person", Copyright: "Private location" } }).toBuffer();
  const inputMetadata = await sharp(jpeg).metadata();
  assert.equal(inputMetadata.orientation, 6);
  assert.ok(inputMetadata.exif);
  const result = await normalizeImage(upload(jpeg, "image/jpeg"), "avatar");
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.width, 80);
  assert.equal(metadata.height, 120);
  assert.equal(metadata.orientation, undefined);
  for (const key of ["exif", "icc", "iptc", "xmp"] as const) assert.equal(metadata[key], undefined);
});

test("emits decodable WebP at purpose limits and never enlarges small uploads", async () => {
  const png = await fixture(2400, 1200).png().toBuffer();
  for (const [purpose, width, height] of [["avatar", 800, 400], ["cover", 1920, 960], ["post", 1920, 960]] as const) {
    const output = await normalizeImage(upload(png), purpose satisfies MediaPurpose);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    await sharp(output).raw().toBuffer();
  }
  for (const format of ["jpeg", "png", "webp"] as const) {
    const small = await fixture(32, 16).toFormat(format).toBuffer();
    const output = await normalizeImage(upload(small, `image/${format}`), "cover");
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 32);
    assert.equal(metadata.height, 16);
  }
});
