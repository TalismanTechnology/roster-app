import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { LocalRepository } from "../local/repository";
import { mutate, readDb, resetDb } from "../local/store";
import { canActForSibling, DAILY_REQUEST_CAP, isLiveRequest, isOverDailyCap, utcDayStart } from "../rules";
import { generateToken, hashToken } from "../tokens";
import { DataError, type NewEntry } from "../types";

/**
 * Wave 5: hashed tokens at rest, the daily cap, revoke, "I don't know this
 * athlete", and the coach's batch — against the local adapter, which must
 * answer the way the 0017 functions do (supabase/tests/schema_test.sql 37–43).
 */

let dir: string;
const repo = new LocalRepository();

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-requests-"));
  process.env.ROSTER_DATA_DIR = dir;
  resetDb();
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const ENTRY: NewEntry = {
  kind: "personal_record",
  title: "400m",
  detail: null,
  value_display: "53.94",
  competition: null,
  location: null,
  placement: null,
  field_size: null,
  achieved_on: "2026-05-01",
};

let seq = 0;
async function athlete(coachEmail = "coach@example.org") {
  seq += 1;
  const user = await repo.signUp(`requests${seq}@roster.local`, "password123");
  const profile = await repo.createProfile({ id: user.id, handle: `requests_${seq}`, display_name: `Requests ${seq}`, level: "high_school" });
  const coach = await repo.addCoach(profile.id, { name: "Tom Bradley", role: "Head Coach", org_name: "Westlake", email: coachEmail, phone: null });
  return { user, profile, coach };
}

const verdict = (code: string, pattern?: RegExp) => (e: unknown) =>
  e instanceof DataError && e.code === code && (!pattern || pattern.test(e.message));

describe("tokens", () => {
  it("hashes to sha256 hex, the digest verification_token_hash() computes", () => {
    assert.equal(hashToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("mints 32-character base64url tokens that do not repeat", () => {
    const a = generateToken();
    assert.match(a, /^[A-Za-z0-9_-]{32}$/);
    assert.notEqual(a, generateToken());
  });
});

describe("request rules", () => {
  const at = new Date("2026-11-05T15:00:00Z");
  it("the UTC day starts at midnight UTC", () => {
    assert.equal(utcDayStart(at), "2026-11-05T00:00:00.000Z");
  });
  it("the cap counts today's requests for this athlete only", () => {
    const today = Array.from({ length: DAILY_REQUEST_CAP - 1 }, () => ({ profile_id: "p1", created_at: "2026-11-05T01:00:00Z" }));
    const noise = [{ profile_id: "p1", created_at: "2026-11-04T23:59:59Z" }, { profile_id: "p2", created_at: "2026-11-05T02:00:00Z" }];
    assert.equal(isOverDailyCap([...today, ...noise], "p1", at), false);
    assert.equal(isOverDailyCap([...today, { profile_id: "p1", created_at: "2026-11-05T14:00:00Z" }], "p1", at), true);
  });
  it("a pending request past its date is not live", () => {
    assert.equal(isLiveRequest({ status: "pending", expires_at: "2026-11-06T00:00:00Z" }, at), true);
    assert.equal(isLiveRequest({ status: "pending", expires_at: "2026-11-05T00:00:00Z" }, at), false);
    assert.equal(isLiveRequest({ status: "verified", expires_at: "2026-11-06T00:00:00Z" }, at), false);
  });
  it("siblings are the same athlete's, to the same coach — never another athlete's", () => {
    const authority = { id: "a", status: "verified" as const, expires_at: "2026-12-01T00:00:00Z", profile_id: "p1", coach_contact_id: "c1" };
    const emails = { authority: "coach@x.org", sibling: "Coach@X.org " };
    assert.equal(canActForSibling(authority, { id: "b", profile_id: "p1", coach_contact_id: "c1" }, emails, at), true);
    assert.equal(canActForSibling(authority, { id: "b", profile_id: "p1", coach_contact_id: "c2" }, emails, at), true);
    assert.equal(canActForSibling(authority, { id: "b", profile_id: "p2", coach_contact_id: "c9" }, emails, at), false);
    assert.equal(canActForSibling(authority, { id: "a", profile_id: "p1", coach_contact_id: "c1" }, emails, at), false);
    assert.equal(
      canActForSibling({ ...authority, status: "expired" }, { id: "b", profile_id: "p1", coach_contact_id: "c1" }, emails, at),
      false,
    );
    assert.equal(
      canActForSibling(authority, { id: "b", profile_id: "p1", coach_contact_id: "c2" }, { authority: null, sibling: null }, at),
      false,
    );
  });
});

describe("hashed tokens at rest", () => {
  it("stores only the hash, and the hash does not open the link", async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const request = await repo.requestVerification(profile.id, entry.id, coach.id);

    const raw = fs.readFileSync(path.join(dir, "roster.json"), "utf8");
    assert.equal(raw.includes(request.token), false, "the raw token is not on disk");
    assert.equal(readDb().verification_requests.find((r) => r.id === request.id)?.token_hash, hashToken(request.token));

    assert.ok(await repo.getVerificationRequest(request.token));
    assert.equal(await repo.getVerificationRequest(hashToken(request.token)), null);
    const listed = (await repo.listVerificationRequests(profile.id))[0] as unknown as Record<string, unknown>;
    assert.equal("token" in listed || "token_hash" in listed, false, "the list carries neither");
  });

  it("upgrades a request written with a raw token by an older build", async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const request = await repo.requestVerification(profile.id, entry.id, coach.id);
    const legacy = "legacy-token-0123456789";
    await mutate((db) => {
      const row = db.verification_requests.find((r) => r.id === request.id) as unknown as Record<string, unknown>;
      delete row.token_hash;
      delete row.flagged_unknown_athlete;
      row.token = legacy;
    });
    const detail = await repo.getVerificationRequest(legacy);
    assert.equal(detail?.id, request.id);
    assert.equal(detail?.flagged_unknown_athlete, false);
  });

  it("shows a link holder no contact details", async () => {
    const { profile, coach } = await athlete();
    await repo.updateProfile(profile.id, { contact_email: "athlete@example.org", phone: "555" });
    const entry = await repo.addEntry(profile.id, ENTRY);
    const request = await repo.requestVerification(profile.id, entry.id, coach.id);
    const detail = (await repo.getVerificationRequest(request.token))!;
    assert.deepEqual(Object.keys(detail.athlete).sort(), ["display_name", "grad_year", "handle", "id", "primary_sport", "school"]);
    assert.deepEqual(Object.keys(detail.coach).sort(), ["id", "name", "org_name", "role"]);
  });
});

describe("answering", () => {
  it("refuses the athlete's own session (#37)", async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const request = await repo.requestVerification(profile.id, entry.id, coach.id);
    await assert.rejects(
      repo.respondToVerification(request.token, "verified", null, { name: "Me", role: null }, profile.id),
      verdict("forbidden", /your own record/),
    );
  });

  it("returns what the athlete's email needs", async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const request = await repo.requestVerification(profile.id, entry.id, coach.id);
    const result = await repo.respondToVerification(request.token, "verified", null, { name: "Tom Bradley", role: null }, null);
    assert.equal(result.athleteEmail, `requests${seq}@roster.local`, "falls back to the account email");
    assert.equal(result.entryTitle, "400m");
    assert.equal(result.requestId, request.id);
  });

  it("records 'I don't know this athlete' as a flagged dispute (#83)", async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const request = await repo.requestVerification(profile.id, entry.id, coach.id);
    const result = await repo.respondToVerification(request.token, "verified", null, { name: "Tom Bradley", role: null }, null, {
      flagUnknownAthlete: true,
    });
    assert.equal(result.outcome, "disputed", "a flag is a dispute whatever button sent it");
    assert.equal(result.flaggedUnknownAthlete, true);
    const stored = (await repo.listVerificationRequests(profile.id)).find((r) => r.id === request.id)!;
    assert.equal(stored.status, "disputed");
    assert.equal(stored.flagged_unknown_athlete, true);
    assert.equal((await repo.listEntries(profile.id))[0].verification, "disputed");
  });
});

describe("the daily cap", () => {
  it(`allows ${DAILY_REQUEST_CAP} requests a UTC day, then refuses`, async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    for (let i = 0; i < DAILY_REQUEST_CAP; i++) await repo.requestVerification(profile.id, entry.id, coach.id);
    await assert.rejects(repo.requestVerification(profile.id, entry.id, coach.id), verdict("rate_limited", /a day/));

    // Yesterday's requests do not count.
    await mutate((db) => {
      for (const r of db.verification_requests) {
        if (r.profile_id === profile.id) r.created_at = "2020-01-01T00:00:00.000Z";
      }
    });
    await repo.requestVerification(profile.id, entry.id, coach.id);
  });
});

describe("revoke (#41)", () => {
  it("closes the link and takes the entry back to unverified", async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const request = await repo.requestVerification(profile.id, entry.id, coach.id);
    await repo.revokeVerificationRequest(profile.id, request.id);

    assert.equal((await repo.listEntries(profile.id))[0].verification, "unverified");
    await assert.rejects(
      repo.respondToVerification(request.token, "verified", null, { name: "Tom Bradley", role: null }, null),
      verdict("forbidden", /expired/),
    );
    await assert.rejects(repo.revokeVerificationRequest(profile.id, request.id), verdict("conflict"));
  });

  it("is the owner's alone", async () => {
    const a = await athlete();
    const b = await athlete();
    const entry = await repo.addEntry(a.profile.id, ENTRY);
    const request = await repo.requestVerification(a.profile.id, entry.id, a.coach.id);
    await assert.rejects(repo.revokeVerificationRequest(b.profile.id, request.id), verdict("not_found"));
  });
});

describe("the coach's batch (#81)", () => {
  it("lists the athlete's other live requests to the same coach and answers them with one link", async () => {
    const { profile, coach } = await athlete();
    const first = await repo.addEntry(profile.id, ENTRY);
    const second = await repo.addEntry(profile.id, { ...ENTRY, title: "200m" });
    const a = await repo.requestVerification(profile.id, first.id, coach.id);
    const b = await repo.requestVerification(profile.id, second.id, coach.id);

    const batch = await repo.getCoachBatchRequests(a.token);
    assert.deepEqual(batch.map((r) => r.id), [b.id]);
    assert.equal(batch[0].entry.title, "200m");

    // Answer the current one, then the sibling with the same (now used) link.
    await repo.respondToVerification(a.token, "verified", null, { name: "Tom Bradley", role: null }, null);
    await repo.respondToVerification(a.token, "verified", null, { name: "Tom Bradley", role: null }, null, { requestId: b.id });
    const entries = await repo.listEntries(profile.id);
    assert.equal(entries.find((e) => e.id === second.id)?.verification, "verified");
    assert.deepEqual(await repo.getCoachBatchRequests(a.token), [], "nothing left waiting");

    // Still single-use per request.
    await assert.rejects(
      repo.respondToVerification(a.token, "verified", null, { name: "Tom Bradley", role: null }, null, { requestId: b.id }),
      verdict("forbidden", /already been used/),
    );
  });

  it("never reaches another athlete's requests, even to the same coach email", async () => {
    const mine = await athlete("shared@example.org");
    const theirs = await athlete("shared@example.org");
    const e1 = await repo.addEntry(mine.profile.id, ENTRY);
    const e2 = await repo.addEntry(theirs.profile.id, ENTRY);
    const a = await repo.requestVerification(mine.profile.id, e1.id, mine.coach.id);
    const b = await repo.requestVerification(theirs.profile.id, e2.id, theirs.coach.id);

    assert.deepEqual(await repo.getCoachBatchRequests(a.token), []);
    await assert.rejects(
      repo.respondToVerification(a.token, "disputed", null, { name: "Tom Bradley", role: null }, null, { requestId: b.id }),
      verdict("not_found"),
    );
  });

  it("a revoked link lists nothing and answers nothing", async () => {
    const { profile, coach } = await athlete();
    const first = await repo.addEntry(profile.id, ENTRY);
    const second = await repo.addEntry(profile.id, { ...ENTRY, title: "200m" });
    const a = await repo.requestVerification(profile.id, first.id, coach.id);
    const b = await repo.requestVerification(profile.id, second.id, coach.id);
    await repo.revokeVerificationRequest(profile.id, a.id);

    assert.deepEqual(await repo.getCoachBatchRequests(a.token), []);
    await assert.rejects(
      repo.respondToVerification(a.token, "verified", null, { name: "Tom Bradley", role: null }, null, { requestId: b.id }),
      verdict("forbidden", /expired/),
    );
  });
});
