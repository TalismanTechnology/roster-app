import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { AVATAR_MAX_BYTES, isSafeAvatarUrl, LOCAL_AVATAR_PREFIX, sniffAvatarType } from "@/lib/avatars";
import { handleFromPath } from "@/lib/handles";
import { absoluteAvatarUrl, profileDescriptor, profileJsonLd, serializeJsonLd } from "@/lib/seo";

import { readAvatar } from "../local/avatars";
import { LocalRepository } from "../local/repository";
import { readDb, resetDb } from "../local/store";
import { isListed } from "../rules";

/**
 * Wave 7: avatars (bytes, URLs, the local adapter's files), the structured
 * data and descriptor a resume publishes, the proxy's handle matcher, and
 * the sitemap's listing.
 */

let dir: string;
const repo = new LocalRepository();

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-w7-"));
  process.env.ROSTER_DATA_DIR = dir;
  resetDb();
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const UUID = "0b5c3a1e-9a4f-4d2b-8c71-1f2e3d4c5b6a";

describe("avatar bytes", () => {
  it("knows an image by its signature, not its name", () => {
    assert.equal(sniffAvatarType(JPEG), "image/jpeg");
    assert.equal(sniffAvatarType(PNG), "image/png");
    assert.equal(sniffAvatarType(WEBP), "image/webp");
  });

  it("refuses anything else — SVG, HTML, GIF, empty", () => {
    const text = (s: string) => new TextEncoder().encode(s);
    assert.equal(sniffAvatarType(text("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
    assert.equal(sniffAvatarType(text("<!doctype html><script>")), null);
    assert.equal(sniffAvatarType(text("GIF89a")), null);
    assert.equal(sniffAvatarType(new Uint8Array()), null);
  });

  it("caps uploads under the Server Action body limit", () => {
    assert.ok(AVATAR_MAX_BYTES < 1024 * 1024);
  });
});

describe("avatar URLs", () => {
  it("renders only what Roster stored: the local route or the public avatars bucket", () => {
    assert.ok(isSafeAvatarUrl(`${LOCAL_AVATAR_PREFIX}${UUID}-abc123.jpg`));
    assert.ok(isSafeAvatarUrl(`https://proj.supabase.co/storage/v1/object/public/avatars/${UUID}/avatar-abc.jpg`));
  });

  it("refuses other hosts, other buckets, traversal, and script URLs", () => {
    for (const url of [
      null,
      "",
      "https://evil.example/storage/v1/object/public/avatars/x.jpg",
      "https://proj.supabase.co/storage/v1/object/public/evidence/x.jpg",
      "http://proj.supabase.co/storage/v1/object/public/avatars/x.jpg",
      `${LOCAL_AVATAR_PREFIX}../session-secret`,
      `${LOCAL_AVATAR_PREFIX}${UUID}-abc.svg`,
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
    ]) {
      assert.equal(isSafeAvatarUrl(url), false, String(url));
    }
  });

  it("makes a local avatar absolute for structured data", () => {
    assert.match(absoluteAvatarUrl(`${LOCAL_AVATAR_PREFIX}${UUID}-a.jpg`) ?? "", /^https?:\/\/[^/]+\/media\/avatars\//);
    assert.equal(absoluteAvatarUrl("https://evil.example/x.jpg"), null);
  });
});

describe("local avatars", () => {
  it("stores a file, serves it back, and replaces the previous upload", async () => {
    const jordan = (await repo.getProfileByHandle("jordanreyes", null))!;
    const first = await repo.setAvatar(jordan.id, JPEG, "image/jpeg");
    assert.ok(isSafeAvatarUrl(first.avatar_url));
    const firstFile = first.avatar_url!.slice(LOCAL_AVATAR_PREFIX.length);
    assert.deepEqual(new Uint8Array(readAvatar(firstFile)!.bytes), JPEG);

    await new Promise((r) => setTimeout(r, 5)); // a new stamp
    const second = await repo.setAvatar(jordan.id, PNG, "image/png");
    assert.notEqual(second.avatar_url, first.avatar_url);
    assert.equal(readAvatar(firstFile), null, "the old file is removed");
    assert.equal(readAvatar(second.avatar_url!.slice(LOCAL_AVATAR_PREFIX.length))!.type, "image/png");
  });

  it("remove clears the column and the files", async () => {
    const jordan = (await repo.getProfileByHandle("jordanreyes", null))!;
    const file = jordan.avatar_url!.slice(LOCAL_AVATAR_PREFIX.length);
    const cleared = await repo.removeAvatar(jordan.id);
    assert.equal(cleared.avatar_url, null);
    assert.equal(readAvatar(file), null);
  });

  it("never reads outside the avatars directory", () => {
    assert.equal(readAvatar("../roster.json"), null);
    assert.equal(readAvatar(`${UUID}-a.jpg/../../roster.json`), null);
  });

  it("refuses an unknown profile", async () => {
    await assert.rejects(repo.setAvatar(UUID, JPEG, "image/jpeg"), /not found/i);
  });
});

describe("structured data", () => {
  it("describes a public resume as a ProfilePage about a Person", async () => {
    const jordan = (await repo.getProfileByHandle("jordanreyes", null))!;
    const ld = profileJsonLd({ ...jordan, avatar_url: `${LOCAL_AVATAR_PREFIX}${UUID}-a.jpg` });
    assert.equal(ld["@type"], "ProfilePage");
    const person = ld.mainEntity as Record<string, unknown>;
    assert.equal(person["@type"], "Person");
    assert.equal(person.name, jordan.display_name);
    assert.equal(person.knowsAbout, "Football");
    assert.match(String(person.url), /\/jordanreyes$/);
    assert.match(String(person.image), /\/media\/avatars\//);
  });

  it("omits the image when there is none", async () => {
    const jordan = (await repo.getProfileByHandle("jordanreyes", null))!;
    const person = profileJsonLd({ ...jordan, avatar_url: null }).mainEntity as Record<string, unknown>;
    assert.equal("image" in person, false);
  });

  it("serializes so a bio can't close the script tag", () => {
    const out = serializeJsonLd({ bio: "</script><script>alert(1)</script>" });
    assert.equal(out.includes("</script>"), false);
    assert.deepEqual(JSON.parse(out), { bio: "</script><script>alert(1)</script>" });
  });

  it("builds the descriptor line from what is set", () => {
    assert.equal(profileDescriptor({ level: "high_school", primary_sport: "football", grad_year: 2027 }), "High School · Football · Class of 2027");
    assert.equal(profileDescriptor({ level: null, primary_sport: null, grad_year: null }), "");
  });
});

describe("handleFromPath", () => {
  it("matches a resume and its share cards", () => {
    assert.equal(handleFromPath("/jordanreyes"), "jordanreyes");
    assert.equal(handleFromPath("/JordanReyes/"), "jordanreyes");
    assert.equal(handleFromPath("/jordanreyes/opengraph-image"), "jordanreyes");
    assert.equal(handleFromPath("/jordanreyes/twitter-image-abc123"), "jordanreyes");
  });

  it("ignores routes, reserved words, deeper paths, and non-handles", () => {
    for (const p of ["/", "/search", "/resume", "/media/avatars/x.jpg", "/jordanreyes/edit", "/a", "/sitemap/0.xml", "/_next/static"]) {
      assert.equal(handleFromPath(p), null, p);
    }
  });
});

describe("sitemap listing", () => {
  it("lists only public, listed resumes with entries, in stable handle order", async () => {
    const { total, profiles } = await repo.listIndexableProfiles(0, 1000);
    const expected = readDb().profiles.filter((p) => isListed(p) && p.entry_count > 0);
    assert.equal(total, expected.length);
    assert.deepEqual(
      profiles.map((p) => p.handle),
      expected.map((p) => p.handle).sort(),
    );
    assert.equal(profiles.some((p) => p.handle === "elijahbrooks"), false, "unlisted is never in the sitemap");
    assert.equal(profiles.some((p) => p.handle === "graceokoro"), false, "private is never in the sitemap");
  });

  it("slices by offset and limit with the same total", async () => {
    const all = await repo.listIndexableProfiles(0, 1000);
    const slice = await repo.listIndexableProfiles(1, 2);
    assert.equal(slice.total, all.total);
    assert.deepEqual(slice.profiles, all.profiles.slice(1, 3));
    assert.deepEqual((await repo.listIndexableProfiles(0, 0)).profiles, []);
  });
});
