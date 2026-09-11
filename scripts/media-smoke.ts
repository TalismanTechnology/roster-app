/** Run against an already running local server: ROSTER_DATA=local npx tsx scripts/media-smoke.ts */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { loadEnvConfig } from "@next/env";
import { LocalRepository } from "../src/lib/data/local/repository";
import { dataDir } from "../src/lib/data/local/paths";
import { SESSION_COOKIE, signSession } from "../src/lib/data/local/session";
import { finalizeDeletedLocalNetworkAccount, LocalNetworkRepository } from "../src/lib/network/local";
import type { AuthUser } from "../src/lib/data/types";

async function main() {
  assert.equal(process.env.ROSTER_DATA, "local", "Explicit ROSTER_DATA=local is required.");
  loadEnvConfig(process.cwd());
  const base = new URL(process.env.ROSTER_MEDIA_SMOKE_BASE ?? "http://127.0.0.1:3000");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Only localhost is allowed.");
  assert.ok(["http:", "https:"].includes(base.protocol));
  assert.equal(base.username + base.password + base.search + base.hash, "");
  assert.equal(base.pathname, "/");
  await access(path.join(dataDir(), "roster.json"));
  // Check connectivity before creating any fictional accounts; never follow redirects.
  await fetch(base, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const repository = new LocalRepository();
  const users: AuthUser[] = [];
  let checks = 0;
  const expectStatus = (response: Response, status: number, label: string) => {
    assert.equal(response.status, status, `${label}: HTTP ${response.status}, expected ${status}`);
    checks++;
  };
  const cookie = (user: AuthUser) => `${SESSION_COOKIE}=${signSession(user.id)}`;
  const request = (route: string, init: RequestInit = {}) => fetch(new URL(route, base), {
    ...init, redirect: "manual", signal: AbortSignal.timeout(30_000),
  });
  try {
    for (const role of ["owner", "reader"]) {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
      const user = await repository.signUp(`media-smoke-${suffix}@example.invalid`, randomUUID());
      users.push(user);
      await repository.createProfile({ id: user.id, handle: `media_${suffix}`, display_name: `Fictional Media ${role}`, level: "club", visibility: "private" });
      await new LocalNetworkRepository(user).joinNetwork("1990-01-01");
    }
    const [owner, reader] = users;
    // JPEG with EXIF exercises decoding, normalization, and metadata removal.
    const source = await sharp({ create: { width: 2100, height: 1100, channels: 3, background: "#326a91" } })
      .jpeg().withExif({ IFD0: { Artist: "Fictional smoke test" } }).toBuffer();
    const upload = (origin: string, user?: AuthUser) => {
      const form = new FormData();
      form.set("purpose", "post");
      form.set("file", new Blob([new Uint8Array(source)], { type: "image/jpeg" }), "fictional.jpg");
      return request("/api/media", { method: "POST", headers: { origin, ...(user ? { cookie: cookie(user) } : {}) }, body: form });
    };
    expectStatus(await upload("https://invalid.example", owner), 403, "Bad origin");
    expectStatus(await upload(base.origin), 401, "Unauthenticated upload");
    const uploaded = await upload(base.origin, owner);
    expectStatus(uploaded, 201, "Valid upload");
    const media = await uploaded.json() as { path: string; url: string };
    assert.match(media.path, new RegExp(`^${owner.id}/[a-f0-9-]{36}\\.webp$`));
    assert.equal(media.url, `/api/media/${media.path}`);
    const ownerRead = await request(media.url, { headers: { cookie: cookie(owner) } });
    expectStatus(ownerRead, 200, "Owner reads unattached upload");
    assert.equal(ownerRead.headers.get("content-type"), "image/webp");
    assert.equal(ownerRead.headers.get("cache-control"), "private, no-store");
    assert.equal(ownerRead.headers.get("x-content-type-options"), "nosniff");
    assert.match(ownerRead.headers.get("vary") ?? "", /cookie/i);
    const normalized = await sharp(Buffer.from(await ownerRead.arrayBuffer())).metadata();
    assert.equal(normalized.format, "webp");
    assert.equal(normalized.width, 1920);
    assert.equal(normalized.exif, undefined);
    expectStatus(await request(media.url), 404, "Anonymous unattached read");
    expectStatus(await request(media.url, { headers: { cookie: cookie(reader) } }), 404, "Other member unattached read");
    const network = new LocalNetworkRepository(owner);
    const post = await network.publishPost({ text: "Fictional media integration fixture", images: [media.path] });
    expectStatus(await request(media.url, { headers: { cookie: cookie(reader) } }), 200, "Active member published read");
    expectStatus(await request(media.url), 404, "Anonymous published read");
    await network.deletePost(post.id);
    expectStatus(await request(media.url, { headers: { cookie: cookie(reader) } }), 404, "Deleted post revokes access");
  } finally {
    const cleanupErrors: unknown[] = [];
    for (const user of users) {
      try {
        await new LocalNetworkRepository(user).deleteAccountData();
        await repository.deleteAccount(user.id);
        await finalizeDeletedLocalNetworkAccount(user.id);
        await rm(path.join(dataDir(), "media", user.id), { recursive: true, force: true });
      } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Fictional media fixture cleanup failed.");
  }
  console.log(`Media HTTP smoke passed: ${checks} status checks plus normalized image and private response headers. Fictional fixtures removed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Media HTTP smoke failed.");
  process.exitCode = 1;
});
