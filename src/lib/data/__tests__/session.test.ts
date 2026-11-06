import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { parseFilmUrl } from "../local/film";
import { hashPassword, verifyPassword } from "../local/password";
import { LocalRepository } from "../local/repository";
import { SESSION_MAX_AGE_S, signSession, verifySession } from "../local/session";

let dir: string;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-session-"));
  process.env.ROSTER_DATA_DIR = dir;
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("session cookie", () => {
  it("round-trips and rejects tampering", () => {
    const value = signSession("user-1");
    assert.equal(verifySession(value)?.userId, "user-1");
    assert.equal(verifySession(value)?.version, 0);
    assert.equal(verifySession(value.replace("user-1", "user-2")), null);
    assert.equal(verifySession(`${value}x`), null);
    assert.equal(verifySession(""), null);
    assert.equal(verifySession(undefined), null);
  });

  it("signs the version: it cannot be edited forward", () => {
    const value = signSession("user-1", 2);
    assert.equal(verifySession(value)?.version, 2);
    const [id, , iat, mac] = value.split(".");
    assert.equal(verifySession(`${id}.3.${iat}.${mac}`), null);
  });

  it("refuses the pre-versioning two-part format", () => {
    const legacy = signSession("user-1").split(".");
    assert.equal(verifySession(`${legacy[0]}.${legacy[3]}`), null);
  });

  it("expires at the max-age, whatever the browser kept", () => {
    const issuedAt = 1_000_000;
    const value = signSession("user-1", 0, issuedAt);
    assert.equal(verifySession(value, issuedAt + SESSION_MAX_AGE_S)?.userId, "user-1");
    assert.equal(verifySession(value, issuedAt + SESSION_MAX_AGE_S + 1), null);
    assert.equal(verifySession(value, issuedAt - 3600), null, "issued in the future");
  });
});

describe("session version", () => {
  it("a password change retires every cookie issued before it", async () => {
    const repo = new LocalRepository();
    const user = await repo.signUp(`session-${Date.now()}@roster.local`, "first-password");
    const before = verifySession(signSession(user.id, (await repo.sessionVersion(user.id)) ?? 0));
    assert.ok(before);
    assert.equal(await repo.sessionVersion(user.id), before.version);

    await repo.updatePassword(user.id, "first-password", "second-password");
    assert.notEqual(await repo.sessionVersion(user.id), before.version, "old cookie's version is now stale");
  });

  it("a deleted account has no current version", async () => {
    const repo = new LocalRepository();
    const user = await repo.signUp(`gone-${Date.now()}@roster.local`, "first-password");
    await repo.deleteAccount(user.id);
    assert.equal(await repo.sessionVersion(user.id), null);
  });
});

describe("passwords", () => {
  it("hashes with scrypt and verifies", () => {
    const stored = hashPassword("correct horse");
    assert.ok(stored.startsWith("scrypt$"));
    assert.equal(verifyPassword("correct horse", stored), true);
    assert.equal(verifyPassword("wrong", stored), false);
  });
});

describe("film URLs", () => {
  it("matches the migration's parser", () => {
    assert.deepEqual(parseFilmUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), { provider: "youtube", external_id: "dQw4w9WgXcQ" });
    assert.deepEqual(parseFilmUrl("https://youtu.be/dQw4w9WgXcQ"), { provider: "youtube", external_id: "dQw4w9WgXcQ" });
    assert.deepEqual(parseFilmUrl("https://vimeo.com/76979871"), { provider: "vimeo", external_id: "76979871" });
    assert.deepEqual(parseFilmUrl("https://www.hudl.com/video/3/abc123"), { provider: "hudl", external_id: "abc123" });
    assert.deepEqual(parseFilmUrl("https://example.com/clip"), { provider: null, external_id: null });
  });
});
