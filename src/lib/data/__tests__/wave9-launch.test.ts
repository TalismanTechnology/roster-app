import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import { athleteOnboardingSchema, reportSchema } from "@/lib/actions/schemas";
import { canRevealContact, contactGate, maskEmail, maskPhone, offersContact, redactForViewer } from "@/lib/contact";
import type { CoachContact, Profile } from "@/lib/database.types";
import { buildHealthReport, httpStatusFor, overallStatus } from "@/lib/health";
import { formatLogLine, maskEmailsIn, parseSentryDsn, redact, serializeError } from "@/lib/logger";
import { hit, limit, limitAll, rateLimitsEnabled, remaining, resetRateLimits } from "@/lib/rate-limit";

import { LocalRepository } from "../local/repository";
import { mutate, readDb, resetDb } from "../local/store";
import { canReportProfile, DAILY_REPORT_CAP } from "../rules";
import { DataError } from "../types";

/**
 * Wave 9: launch hardening — the rate limiter's window and burst behaviour
 * and its bypass, contact masking for minors (#44), profile reports and
 * suspension against the local adapter (#50), the onboarding attestation,
 * and the health and logger payloads (#117).
 */

let dir: string;
const repo = new LocalRepository();

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-wave9-"));
  process.env.ROSTER_DATA_DIR = dir;
  resetDb();
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const profileId = (handle: string) => readDb().profiles.find((p) => p.handle === handle)!.id;

async function rejectsWith(promise: Promise<unknown>, code: DataError["code"]): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof DataError, `expected DataError, got ${error}`);
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected ${code}`);
}

/** Restores any env vars a test sets. */
const saved = new Map<string, string | undefined>();
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (!saved.has(k)) saved.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
function restoreEnv() {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  saved.clear();
}

// ---------------------------------------------------------------------------
// #39 rate limiting
// ---------------------------------------------------------------------------

describe("rate limiter (#39)", () => {
  beforeEach(() => resetRateLimits());
  afterEach(() => restoreEnv());

  it("allows a burst up to the limit, then refuses until the oldest hit ages out", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) assert.equal(hit("burst", "ip", 5, 60_000, t + i), true);
    assert.equal(hit("burst", "ip", 5, 60_000, t + 10), false);
    // Sliding, not fixed: one slot frees when the first hit is a window old.
    assert.equal(hit("burst", "ip", 5, 60_000, t + 60_000), true);
    assert.equal(hit("burst", "ip", 5, 60_000, t + 60_000), false);
    // A full window after the burst, the whole budget is back.
    for (let i = 0; i < 4; i++) assert.equal(hit("burst", "ip", 5, 60_000, t + 120_010 + i), true);
  });

  it("does not record refused hits, so backing off recovers", () => {
    const t = 2_000_000;
    assert.equal(hit("backoff", "ip", 1, 1000, t), true);
    for (let i = 1; i < 50; i++) assert.equal(hit("backoff", "ip", 1, 1000, t + i * 10), false);
    assert.equal(hit("backoff", "ip", 1, 1000, t + 1000), true);
  });

  it("is on by default and bypassed by NODE_ENV=test, ROSTER_DATA=local, or ROSTER_RATE_LIMIT=off", () => {
    setEnv({ ROSTER_RATE_LIMIT: undefined, NODE_ENV: "production", ROSTER_DATA: "supabase" });
    assert.equal(rateLimitsEnabled(), true);
    setEnv({ NODE_ENV: "test" });
    assert.equal(rateLimitsEnabled(), false);
    setEnv({ NODE_ENV: "production", ROSTER_DATA: "local" });
    assert.equal(rateLimitsEnabled(), false);
    setEnv({ ROSTER_DATA: "supabase", ROSTER_RATE_LIMIT: "off" });
    assert.equal(rateLimitsEnabled(), false);
    setEnv({ ROSTER_DATA: "local", NODE_ENV: "test", ROSTER_RATE_LIMIT: "on" });
    assert.equal(rateLimitsEnabled(), true);
  });

  it("limit() always passes while bypassed, and counts once enabled", () => {
    const budget = { scope: "bypass", key: "ip", limit: 2, windowMs: 60_000 };
    setEnv({ ROSTER_RATE_LIMIT: "off" });
    for (let i = 0; i < 10; i++) assert.equal(limit(budget, 5_000_000), true);
    assert.equal(remaining(budget, 5_000_000), 2, "nothing was charged while bypassed");
    setEnv({ ROSTER_RATE_LIMIT: "on" });
    assert.equal(limit(budget, 5_000_000), true);
    assert.equal(limit(budget, 5_000_001), true);
    assert.equal(limit(budget, 5_000_002), false);
  });

  it("limitAll() checks every budget before charging any", () => {
    setEnv({ ROSTER_RATE_LIMIT: "on" });
    const t = 6_000_000;
    const client = { scope: "sign-in:client", key: "1.2.3.4", limit: 30, windowMs: 600_000 };
    const email = { scope: "sign-in:email", key: "a@x.com", limit: 2, windowMs: 600_000 };
    assert.equal(limitAll([client, email], t), true);
    assert.equal(limitAll([client, email], t + 1), true);
    // The mailbox is out; the client's own allowance must not shrink for it.
    assert.equal(limitAll([client, email], t + 2), false);
    assert.equal(limitAll([client, email], t + 3), false);
    assert.equal(remaining(client, t + 3), 28);
    // Another mailbox from the same client still works.
    assert.equal(limitAll([client, { ...email, key: "b@x.com" }], t + 4), true);
  });

  it("keeps clients and scopes apart", () => {
    setEnv({ ROSTER_RATE_LIMIT: "on" });
    const t = 7_000_000;
    const a = { scope: "report:client", key: "10.0.0.1", limit: 1, windowMs: 60_000 };
    assert.equal(limit(a, t), true);
    assert.equal(limit(a, t + 1), false);
    assert.equal(limit({ ...a, key: "10.0.0.2" }, t + 1), true);
    assert.equal(limit({ ...a, scope: "verify:client" }, t + 1), true);
  });
});

// ---------------------------------------------------------------------------
// #44 contact masking
// ---------------------------------------------------------------------------

const athlete = (over: Partial<Profile> = {}): Profile =>
  ({
    id: "athlete-1",
    handle: "jordanreyes",
    account_kind: "athlete",
    visibility: "public",
    is_recruitable: true,
    contact_email: "jordanreyes@example.com",
    phone: "(616) 555-0142",
    suspended_at: null,
    ...over,
  }) as Profile;

const coach: CoachContact = {
  id: "c1", profile_id: "athlete-1", name: "Tom Bradley", role: "Head Coach", org_name: "Westlake",
  email: "tb@school.edu", phone: "555-0100", is_visible: true, position: 0, created_at: "",
} as CoachContact;

describe("contact masking (#44)", () => {
  it("masks an email to its first letter and domain, a phone to its last four", () => {
    assert.equal(maskEmail("jordanreyes@example.com"), "j••••••••••@example.com");
    assert.equal(maskEmail("ab@x.io"), "a•••@x.io");
    assert.equal(maskEmail(null), null);
    assert.equal(maskEmail("   "), null);
    assert.equal(maskPhone("(616) 555-0142"), "•••-•••-0142");
    assert.equal(maskPhone("12"), "•••");
    assert.equal(maskPhone(null), null);
    for (const masked of [maskEmail("jordanreyes@example.com")!, maskPhone("(616) 555-0142")!]) {
      assert.ok(!masked.includes("jordanreyes") && !masked.includes("555"), masked);
    }
  });

  it("reveals to the owner and to any non-athlete account, never to signed-out visitors or other athletes", () => {
    const p = athlete();
    assert.equal(canRevealContact(p, null), false);
    assert.equal(canRevealContact(p, { id: "other", account_kind: "athlete" }), false);
    assert.equal(canRevealContact(p, { id: "athlete-1", account_kind: "athlete" }), true);
    for (const kind of ["recruiter", "coach", "brand", "staff"] as const) {
      assert.equal(canRevealContact(p, { id: "x", account_kind: kind }), true, kind);
    }
  });

  it("offers contact only on a public resume that is open to recruiting", () => {
    assert.equal(offersContact(athlete()), true);
    assert.equal(offersContact(athlete({ visibility: "unlisted" })), false);
    assert.equal(offersContact(athlete({ is_recruitable: false })), false);
    assert.equal(offersContact(athlete({ contact_email: null, phone: null })), false);
    assert.deepEqual(contactGate(athlete({ visibility: "private" }), { id: "r", account_kind: "recruiter" }), { state: "none" });
  });

  it("gates a signed-out visitor with masked hints and reveals to a recruiter", () => {
    assert.deepEqual(contactGate(athlete(), null), { state: "gated", maskedEmail: "j••••••••••@example.com", maskedPhone: "•••-•••-0142" });
    assert.deepEqual(contactGate(athlete(), { id: "r", account_kind: "recruiter" }), {
      state: "revealed",
      email: "jordanreyes@example.com",
      phone: "(616) 555-0142",
    });
  });

  it("redacts the profile and references before rendering for a viewer who may not see them", () => {
    const out = redactForViewer(athlete(), [coach], null);
    assert.equal(out.profile.contact_email, null);
    assert.equal(out.profile.phone, null);
    assert.equal(out.coaches[0].email, null);
    assert.equal(out.coaches[0].phone, null);
    assert.equal(out.coaches[0].name, "Tom Bradley", "the reference itself stays");
    assert.equal(out.coachContactHidden, true);
    assert.ok(!JSON.stringify(out).includes("@example.com") && !JSON.stringify(out).includes("tb@school.edu"));

    const recruiter = redactForViewer(athlete(), [coach], { id: "r", account_kind: "recruiter" });
    assert.equal(recruiter.profile.contact_email, "jordanreyes@example.com");
    assert.equal(recruiter.coaches[0].email, "tb@school.edu");
    assert.equal(recruiter.coachContactHidden, false);
  });
});

// ---------------------------------------------------------------------------
// #44 onboarding attestation
// ---------------------------------------------------------------------------

describe("age / guardian consent (#44)", () => {
  const base = { handle: "new_athlete", display_name: "Pat Lee", level: "high_school", primary_sport: "football", grad_year: "2028", visibility: "public" };

  it("is required on athlete onboarding, as adult or guardian", () => {
    assert.equal(athleteOnboardingSchema.safeParse({ ...base, age_consent: "" }).success, false);
    assert.equal(athleteOnboardingSchema.safeParse({ ...base, age_consent: "maybe" }).success, false);
    assert.equal(athleteOnboardingSchema.safeParse({ ...base, age_consent: "guardian" }).data?.age_consent, "guardian");
    const missing = athleteOnboardingSchema.safeParse(base);
    assert.equal(missing.success, false);
    assert.match(missing.error!.issues[0].message, /18 or older|parent or guardian/);
  });

  it("is stored with a timestamp at creation and cannot be rewritten by the owner", async () => {
    const user = await repo.signUp(`consent-${Date.now()}@roster.local`, "password123");
    const created = await repo.createProfile({
      id: user.id, handle: `consent_${Date.now().toString(36)}`, display_name: "Pat Lee", level: "high_school", age_consent: "guardian",
    });
    assert.equal(created.age_consent, "guardian");
    assert.ok(created.consent_at);
    const updated = await repo.updateProfile(user.id, { age_consent: "adult", consent_at: "2020-01-01T00:00:00.000Z", bio: "Hi" });
    assert.equal(updated.age_consent, "guardian");
    assert.equal(updated.consent_at, created.consent_at);
    assert.equal(updated.bio, "Hi");
  });

  it("may be given once by an account created before it existed", async () => {
    const user = await repo.signUp(`legacy-${Date.now()}@roster.local`, "password123");
    await repo.createProfile({ id: user.id, handle: `legacy_${Date.now().toString(36)}`, display_name: "Old Timer", level: "high_school" });
    assert.equal((await repo.getProfileById(user.id))!.age_consent, null);
    const given = await repo.updateProfile(user.id, { age_consent: "adult" });
    assert.equal(given.age_consent, "adult");
    assert.ok(given.consent_at);
  });
});

// ---------------------------------------------------------------------------
// #50 reports and suspension
// ---------------------------------------------------------------------------

describe("profile reports and suspension (#50)", () => {
  let staffId: string;

  before(async () => {
    const staff = await repo.signUp(`staff-${Date.now()}@roster.local`, "password123");
    await repo.createProfile({ id: staff.id, handle: `staff_${Date.now().toString(36)}`, display_name: "Mod Erator", level: null, visibility: "private" });
    // Staff is granted, never chosen — as an operator would, in the store.
    await mutate((db) => {
      db.profiles.find((p) => p.id === staff.id)!.account_kind = "staff";
    });
    staffId = staff.id;
  });

  it("validates the report form", () => {
    const id = profileId("jordanreyes");
    assert.equal(reportSchema.safeParse({ profile_id: id, reason: "spam", detail: "" }).data?.detail, null);
    assert.equal(reportSchema.safeParse({ profile_id: id, reason: "", detail: "" }).success, false);
    assert.equal(reportSchema.safeParse({ profile_id: "nope", reason: "spam", detail: "" }).success, false);
    assert.equal(reportSchema.safeParse({ profile_id: id, reason: "spam", detail: "x".repeat(1001) }).success, false);
  });

  it("accepts a signed-out report on a visible resume and refuses private ones and self-reports", async () => {
    const before = readDb().profile_reports.length;
    await repo.reportProfile(profileId("jordanreyes"), null, { reason: "impersonation", detail: "Not him." });
    assert.equal(readDb().profile_reports.length, before + 1);
    const row = readDb().profile_reports.at(-1)!;
    assert.equal(row.status, "open");
    assert.equal(row.reporter_id, null);

    await rejectsWith(repo.reportProfile(profileId("graceokoro"), null, { reason: "spam", detail: null }), "not_found");
    const ava = profileId("avareyes");
    await rejectsWith(repo.reportProfile(ava, ava, { reason: "spam", detail: null }), "not_found");
    assert.equal(canReportProfile(readDb().profiles.find((p) => p.id === ava), ava), false);
  });

  it("drops a signed-in reporter's duplicate while open, and caps them per day", async () => {
    const reporter = profileId("scout_morgan");
    const target = profileId("devinokafor");
    await repo.reportProfile(target, reporter, { reason: "false_record", detail: null });
    const count = readDb().profile_reports.length;
    await repo.reportProfile(target, reporter, { reason: "false_record", detail: "again" });
    assert.equal(readDb().profile_reports.length, count, "duplicate accepted silently, not stored");

    const today = new Date().toISOString();
    await mutate((db) => {
      for (let i = 0; i < DAILY_REPORT_CAP; i++) {
        db.profile_reports.push({
          id: `cap-${i}`, profile_id: profileId("jordanreyes"), reporter_id: reporter, reason: "spam", detail: null,
          status: "dismissed", created_at: today, resolved_at: today, resolved_by: null,
        });
      }
    });
    await rejectsWith(repo.reportProfile(profileId("samwhitfield"), reporter, { reason: "spam", detail: null }), "rate_limited");
  });

  it("lists reports and suspends for staff only", async () => {
    const athleteId = profileId("jordanreyes");
    await rejectsWith(repo.listProfileReports(profileId("scout_morgan")), "forbidden");
    await rejectsWith(repo.setProfileSuspended(athleteId, athleteId, true), "forbidden");
    await rejectsWith(repo.setProfileSuspended(profileId("scout_morgan"), athleteId, true), "forbidden");
    const reports = await repo.listProfileReports(staffId);
    assert.ok(reports.length > 0);
    assert.ok(!("resolved_by" in reports[0]));
  });

  it("a suspended resume is gone to everyone but its owner and staff, and its open reports are actioned", async () => {
    const id = profileId("jordanreyes");
    const suspended = await repo.setProfileSuspended(staffId, id, true);
    assert.ok(suspended.suspended_at);

    assert.equal(await repo.getProfileByHandle("jordanreyes", null), null);
    assert.equal(await repo.getProfileByHandle("jordanreyes", profileId("scout_morgan")), null);
    assert.ok(await repo.getProfileByHandle("jordanreyes", id), "the owner still sees it");
    assert.ok(await repo.getProfileByHandle("jordanreyes", staffId), "staff still see it");
    const search = await repo.searchAthletes({ q: "Jordan" });
    assert.ok(!search.athletes.some((a) => a.id === id), "not in search");
    assert.ok(!(await repo.listIndexableProfiles(0, 1000)).profiles.some((p) => p.handle === "jordanreyes"), "not in the sitemap");
    await rejectsWith(repo.reportProfile(id, null, { reason: "spam", detail: null }), "not_found");

    const open = readDb().profile_reports.filter((r) => r.profile_id === id && r.status === "open");
    assert.equal(open.length, 0);
    assert.ok(readDb().profile_reports.some((r) => r.profile_id === id && r.status === "actioned" && r.resolved_by === staffId));

    // Suspending twice keeps the original time; reinstating restores everything.
    assert.equal((await repo.setProfileSuspended(staffId, id, true)).suspended_at, suspended.suspended_at);
    assert.equal((await repo.setProfileSuspended(staffId, id, false)).suspended_at, null);
    assert.ok(await repo.getProfileByHandle("jordanreyes", null));
  });

  it("the owner cannot lift their own suspension through a profile update", async () => {
    const id = profileId("avareyes");
    await repo.setProfileSuspended(staffId, id, true);
    await repo.updateProfile(id, { suspended_at: null });
    assert.ok((await repo.getProfileById(id))!.suspended_at);
    await repo.setProfileSuspended(staffId, id, false);
  });

  it("deleting an account removes reports against it and anonymises reports it filed", async () => {
    const user = await repo.signUp(`reporter-${Date.now()}@roster.local`, "password123");
    await repo.createProfile({ id: user.id, handle: `rep_${Date.now().toString(36)}`, display_name: "Rep Orter", level: null, account_kind: "recruiter" });
    await repo.reportProfile(profileId("noahlindqvist"), user.id, { reason: "other", detail: "hm" });
    await repo.reportProfile(user.id, null, { reason: "spam", detail: null });
    await repo.deleteAccount(user.id);
    const db = readDb();
    assert.ok(!db.profile_reports.some((r) => r.profile_id === user.id));
    assert.ok(!db.profile_reports.some((r) => r.reporter_id === user.id));
    assert.ok(db.profile_reports.some((r) => r.profile_id === profileId("noahlindqvist") && r.detail === "hm" && r.reporter_id === null));
  });
});

// ---------------------------------------------------------------------------
// #117 health and logging
// ---------------------------------------------------------------------------

describe("health payload (#117)", () => {
  it("rolls checks up to the worst status and 503s only on fail", () => {
    assert.equal(overallStatus({ a: { status: "ok" } }), "ok");
    assert.equal(overallStatus({ a: { status: "ok" }, b: { status: "warn" } }), "degraded");
    assert.equal(overallStatus({ a: { status: "warn" }, b: { status: "fail" } }), "fail");
    assert.equal(httpStatusFor({ status: "ok" }), 200);
    assert.equal(httpStatusFor({ status: "degraded" }), 200);
    assert.equal(httpStatusFor({ status: "fail" }), 503);
  });

  it("has a stable shape, with a short version and no configuration values", () => {
    const report = buildHealthReport({
      dataMode: "supabase",
      checks: { env: { status: "ok" }, database: { status: "ok" }, email: { status: "warn", detail: "outbox only" } },
      startedAt: 1_000,
      now: new Date(1_042),
      env: { VERCEL_GIT_COMMIT_SHA: "abcdef1234567890", VERCEL_ENV: "production", RESEND_API_KEY: "re_secret" },
    });
    assert.deepEqual(Object.keys(report).sort(), ["checks", "dataMode", "durationMs", "environment", "service", "status", "time", "version"]);
    assert.equal(report.status, "degraded");
    assert.equal(report.service, "roster");
    assert.equal(report.version, "abcdef1");
    assert.equal(report.environment, "production");
    assert.equal(report.durationMs, 42);
    assert.equal(report.time, new Date(1_042).toISOString());
    assert.ok(!JSON.stringify(report).includes("re_secret"));
  });
});

describe("structured logger (#117)", () => {
  it("writes one JSON object with level, event, and time", () => {
    const line = formatLogLine("info", "lists.created", { listId: "l1" }, new Date(0));
    const parsed = JSON.parse(line);
    assert.equal(parsed.level, "info");
    assert.equal(parsed.event, "lists.created");
    assert.equal(parsed.time, "1970-01-01T00:00:00.000Z");
    assert.equal(parsed.service, "roster");
    assert.equal(parsed.listId, "l1");
    assert.ok(!line.includes("\n"));
  });

  it("redacts secrets and masks emails, at any depth", () => {
    const out = redact({
      password: "hunter22",
      token: "abc",
      nested: { apiKey: "k", authorization: "Bearer x", note: "mail jordan@example.com now" },
      email: "ava@example.com",
      count: 3,
    }) as Record<string, unknown>;
    assert.equal(out.password, "[redacted]");
    assert.equal(out.token, "[redacted]");
    assert.deepEqual(out.nested, { apiKey: "[redacted]", authorization: "[redacted]", note: "mail j***@example.com now" });
    assert.equal(out.email, "a***@example.com");
    assert.equal(out.count, 3);
    assert.equal(maskEmailsIn("no address here"), "no address here");
  });

  it("serializes errors without leaking addresses, keeping digest and code", () => {
    const error = Object.assign(new Error("no account for kim@school.edu"), { digest: "123", code: "conflict" });
    const out = serializeError(error);
    assert.equal(out.message, "no account for k***@school.edu");
    assert.equal(out.digest, "123");
    assert.equal(out.code, "conflict");
    assert.deepEqual(serializeError("plain"), { message: "plain" });
  });

  it("parses a Sentry DSN to its envelope endpoint and ignores malformed ones", () => {
    assert.deepEqual(parseSentryDsn("https://pub123@o42.ingest.sentry.io/77"), {
      endpoint: "https://o42.ingest.sentry.io/api/77/envelope/",
      dsn: "https://pub123@o42.ingest.sentry.io/77",
    });
    assert.equal(parseSentryDsn(undefined), null);
    assert.equal(parseSentryDsn(""), null);
    assert.equal(parseSentryDsn("not a url"), null);
    assert.equal(parseSentryDsn("https://o42.ingest.sentry.io/77"), null, "no public key");
  });
});
