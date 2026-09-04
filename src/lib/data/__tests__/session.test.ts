import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { parseFilmUrl } from "../local/film";
import { hashPassword, verifyPassword } from "../local/password";
import { signSession, verifySession } from "../local/session";

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
    assert.equal(verifySession(value), "user-1");
    assert.equal(verifySession(value.replace("user-1", "user-2")), null);
    assert.equal(verifySession(`${value}x`), null);
    assert.equal(verifySession(""), null);
    assert.equal(verifySession(undefined), null);
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
