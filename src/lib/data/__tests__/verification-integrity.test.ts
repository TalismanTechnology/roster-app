import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import type { RecordEntry } from "@/lib/database.types";

import { LocalRepository } from "../local/repository";
import { readDb, resetDb } from "../local/store";
import { MAX_PINNED } from "../rules";
import { DataError, type NewEntry } from "../types";

/**
 * A verified badge means "a coach confirmed exactly this". These check that
 * the local adapter never lets the badge outlive the claim it was given for,
 * and the neighbouring write rules that guard the record.
 */

let dir: string;
const repo = new LocalRepository();

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-integrity-"));
  process.env.ROSTER_DATA_DIR = dir;
  resetDb();
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const ENTRY: NewEntry = {
  kind: "personal_record",
  title: "400m",
  detail: "Lane 4, hand-timed backup.",
  value_display: "53.94",
  competition: "Regional Final",
  location: "Austin, TX",
  placement: 2,
  field_size: 8,
  achieved_on: "2026-05-01",
};

let athleteSeq = 0;

/** A fresh athlete with one reference, so tests never share a record. */
async function athlete() {
  athleteSeq += 1;
  const user = await repo.signUp(`integrity${athleteSeq}@roster.local`, "password123");
  const profile = await repo.createProfile({
    id: user.id,
    handle: `integrity_${athleteSeq}`,
    display_name: `Integrity ${athleteSeq}`,
    level: "high_school",
  });
  const coach = await repo.addCoach(profile.id, {
    name: "Tom Bradley",
    role: "Head Coach",
    org_name: null,
    email: "coach@example.org",
    phone: null,
  });
  return { profile, coach };
}

/** Request → coach verifies. Returns the verified entry. */
async function verifiedEntry(profileId: string, coachId: string, input: NewEntry = ENTRY): Promise<RecordEntry> {
  const entry = await repo.addEntry(profileId, input);
  const request = await repo.requestVerification(profileId, entry.id, coachId);
  await repo.respondToVerification(request.token, "verified", null, { name: "Tom Bradley", role: "Head Coach" }, null);
  return find(profileId, entry.id);
}

async function find(profileId: string, entryId: string): Promise<RecordEntry> {
  const entry = (await repo.listEntries(profileId)).find((e) => e.id === entryId);
  assert.ok(entry, "entry exists");
  return entry;
}

describe("editing a verified entry", () => {
  it("clears the badge when the mark changes", async () => {
    const { profile, coach } = await athlete();
    const entry = await verifiedEntry(profile.id, coach.id);
    assert.equal(entry.verification, "verified");
    assert.ok(entry.verified_at);
    assert.equal(entry.verified_by, "Tom Bradley");
    assert.equal((await repo.getProfileById(profile.id))!.verified_count, 1);

    const updated = await repo.updateEntry(profile.id, entry.id, { ...ENTRY, value_display: "52.10" });

    assert.equal(updated.verification, "unverified");
    assert.equal(updated.verified_at, null);
    assert.equal(updated.verified_by, null);
    assert.equal(updated.value_display, "52.10");
    // The counter follows the badge.
    assert.equal((await repo.getProfileById(profile.id))!.verified_count, 0);
    // And it reads the same from a fresh list, not just the returned row.
    assert.equal((await find(profile.id, entry.id)).verification, "unverified");
  });

  for (const [field, value] of [
    ["title", "400m Dash"],
    ["achieved_on", "2026-04-30"],
    ["placement", 1],
    ["field_size", 9],
    ["kind", "result"],
    ["competition", "State Final"],
    ["location", "Dallas, TX"],
    ["detail", "Different story."],
    ["sport", "football"],
  ] as const) {
    it(`clears the badge when ${field} changes`, async () => {
      const { profile, coach } = await athlete();
      const entry = await verifiedEntry(profile.id, coach.id);
      const updated = await repo.updateEntry(profile.id, entry.id, { [field]: value });
      assert.equal(updated.verification, "unverified", field);
      assert.equal(updated.verified_at, null, field);
    });
  }

  it("keeps the badge when the form is saved with nothing changed", async () => {
    const { profile, coach } = await athlete();
    const entry = await verifiedEntry(profile.id, coach.id);
    const updated = await repo.updateEntry(profile.id, entry.id, { ...ENTRY });
    assert.equal(updated.verification, "verified");
    assert.ok(updated.verified_at);
    assert.equal(updated.verified_by, "Tom Bradley");
  });

  it("treats an emptied optional field as the same empty", async () => {
    const { profile, coach } = await athlete();
    const entry = await verifiedEntry(profile.id, coach.id, { ...ENTRY, detail: null });
    // Nothing changed: null stays null.
    assert.equal((await repo.updateEntry(profile.id, entry.id, { detail: null })).verification, "verified");
  });

  it("keeps the badge when only the pin changes", async () => {
    const { profile, coach } = await athlete();
    const entry = await verifiedEntry(profile.id, coach.id);
    await repo.setPinned(profile.id, entry.id, true);
    const pinned = await find(profile.id, entry.id);
    assert.equal(pinned.is_pinned, true);
    assert.equal(pinned.verification, "verified");
    await repo.setPinned(profile.id, entry.id, false);
    assert.equal((await find(profile.id, entry.id)).verification, "verified");
  });

  it("expires a pending request when the claim changes under it", async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const request = await repo.requestVerification(profile.id, entry.id, coach.id);
    assert.equal((await find(profile.id, entry.id)).verification, "submitted");

    await repo.updateEntry(profile.id, entry.id, { value_display: "50.00" });

    assert.equal((await find(profile.id, entry.id)).verification, "unverified");
    const stored = (await repo.listVerificationRequests(profile.id)).find((r) => r.id === request.id);
    assert.equal(stored?.status, "expired");

    // The coach's old link now refuses, as expired — they would otherwise
    // vouch for a number they never saw.
    await assert.rejects(
      repo.respondToVerification(request.token, "verified", null, { name: "Tom Bradley", role: null }, null),
      (e: unknown) => e instanceof DataError && e.code === "forbidden" && /expired/i.test(e.message),
    );
    assert.equal((await find(profile.id, entry.id)).verification, "unverified");
  });

  it("verified → edit → re-request → verify again restores the badge for the new claim", async () => {
    const { profile, coach } = await athlete();
    const entry = await verifiedEntry(profile.id, coach.id);
    await repo.updateEntry(profile.id, entry.id, { value_display: "51.00" });

    const again = await repo.requestVerification(profile.id, entry.id, coach.id);
    await repo.respondToVerification(again.token, "verified", null, { name: "Dana Whitfield", role: null }, null);

    const final = await find(profile.id, entry.id);
    assert.equal(final.verification, "verified");
    assert.equal(final.value_display, "51.00");
    assert.equal(final.verified_by, "Dana Whitfield");
    assert.equal((await repo.getProfileById(profile.id))!.verified_count, 1);
  });

  it("clears a disputed state too, so the athlete can ask again", async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const request = await repo.requestVerification(profile.id, entry.id, coach.id);
    await repo.respondToVerification(request.token, "disputed", "It was 54.9.", { name: "Tom Bradley", role: null }, null);
    assert.equal((await find(profile.id, entry.id)).verification, "disputed");

    await repo.updateEntry(profile.id, entry.id, { value_display: "54.90" });
    assert.equal((await find(profile.id, entry.id)).verification, "unverified");
  });

  it("ignores columns outside the entry form, so a direct POST cannot self-verify", async () => {
    const { profile } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const forged = { title: "400m", verification: "verified", verified_at: "2026-05-02T00:00:00Z" } as unknown as Partial<NewEntry>;
    const updated = await repo.updateEntry(profile.id, entry.id, forged);
    assert.equal(updated.verification, "unverified");
    assert.equal(updated.verified_at, null);
  });

  it("refuses another athlete's entry", async () => {
    const { profile, coach } = await athlete();
    const other = await athlete();
    const entry = await verifiedEntry(profile.id, coach.id);
    await assert.rejects(
      repo.updateEntry(other.profile.id, entry.id, { value_display: "1.00" }),
      (e: unknown) => e instanceof DataError && e.code === "not_found",
    );
    assert.equal((await find(profile.id, entry.id)).verification, "verified");
  });
});

describe("responding to a request", () => {
  it("returns the athlete's handle so the caller can revalidate the resume", async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const request = await repo.requestVerification(profile.id, entry.id, coach.id);
    const result = await repo.respondToVerification(request.token, "verified", null, { name: "Coach", role: null }, null);
    assert.deepEqual(result, { handle: profile.handle, outcome: "verified" });
  });

  it("a superseded link reports expired, not already answered", async () => {
    const { profile, coach } = await athlete();
    const entry = await repo.addEntry(profile.id, ENTRY);
    const first = await repo.requestVerification(profile.id, entry.id, coach.id);
    await repo.requestVerification(profile.id, entry.id, coach.id);
    await assert.rejects(
      repo.respondToVerification(first.token, "verified", null, { name: "Coach", role: null }, null),
      (e: unknown) => e instanceof DataError && /expired/i.test(e.message),
    );
  });
});

describe("pinning", () => {
  it(`caps pinned entries at ${MAX_PINNED} with a DataError, not a crash`, async () => {
    const { profile } = await athlete();
    const entries = [];
    for (let i = 0; i < MAX_PINNED + 1; i++) entries.push(await repo.addEntry(profile.id, { ...ENTRY, title: `Entry ${i}` }));

    for (const e of entries.slice(0, MAX_PINNED)) await repo.setPinned(profile.id, e.id, true);
    await assert.rejects(
      repo.setPinned(profile.id, entries[MAX_PINNED].id, true),
      (e: unknown) => e instanceof DataError && e.code === "invalid",
    );
    assert.equal((await repo.listEntries(profile.id)).filter((e) => e.is_pinned).length, MAX_PINNED);

    // Re-pinning an already pinned entry at the cap is a no-op, not an error.
    await repo.setPinned(profile.id, entries[0].id, true);
    // Unpinning frees a slot.
    await repo.setPinned(profile.id, entries[0].id, false);
    await repo.setPinned(profile.id, entries[MAX_PINNED].id, true);
    assert.equal((await repo.listEntries(profile.id)).filter((e) => e.is_pinned).length, MAX_PINNED);
  });

  it("counts only the athlete's own pins", async () => {
    const a = await athlete();
    const b = await athlete();
    for (let i = 0; i < MAX_PINNED; i++) {
      const e = await repo.addEntry(a.profile.id, { ...ENTRY, title: `A${i}` });
      await repo.setPinned(a.profile.id, e.id, true);
    }
    const mine = await repo.addEntry(b.profile.id, ENTRY);
    await repo.setPinned(b.profile.id, mine.id, true);
    assert.equal((await find(b.profile.id, mine.id)).is_pinned, true);
  });
});

describe("the store", () => {
  it("serializes concurrent writes so none is lost", async () => {
    const { profile } = await athlete();
    // Twenty saves fired at once. Without the lock each would read the same
    // snapshot and the last write would win, leaving one entry, not twenty.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => repo.addEntry(profile.id, { ...ENTRY, title: `Concurrent ${i}` })),
    );
    const titles = (await repo.listEntries(profile.id)).map((e) => e.title).filter((t) => t.startsWith("Concurrent"));
    assert.equal(titles.length, 20);
    assert.equal((await repo.getProfileById(profile.id))!.entry_count, 20);
  });

  it("concurrent views all count", async () => {
    const jordan = (await repo.getProfileByHandle("jordanreyes", null))!;
    const before = await repo.weeklyViews(jordan.id);
    await Promise.all(Array.from({ length: 15 }, () => repo.recordView(jordan.id, null)));
    assert.equal(await repo.weeklyViews(jordan.id), before + 15);
  });

  it("a failed write leaves the file untouched and does not wedge the next one", async () => {
    const { profile } = await athlete();
    const beforeCount = readDb().achievements.length;
    await assert.rejects(repo.updateEntry(profile.id, "00000000-0000-4000-8000-000000000000", { title: "x" }));
    assert.equal(readDb().achievements.length, beforeCount);
    await repo.addEntry(profile.id, ENTRY);
    assert.equal(readDb().achievements.length, beforeCount + 1);
  });
});
