import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { passwordResetEmail } from "@/lib/email/templates";
import { hit, resetRateLimits } from "@/lib/rate-limit";

import { filmThumbnailUrl, parseFilmUrl } from "../local/film";
import { LocalRepository } from "../local/repository";
import { mutate, readDb, resetDb } from "../local/store";
import {
  emailChangeError,
  holdsPosition,
  isRecentRecovery,
  newPasswordError,
  PASSWORD_RESET_TTL_MINUTES,
  SIGN_UP_CONFLICT_COPY,
  signUpError,
} from "../rules";
import { hashToken } from "../tokens";
import { DataError } from "../types";

/**
 * Wave 6: recruiter lists (rename), the account lifecycle (password reset,
 * email change, non-enumerating sign-up), film and entry defaults, search
 * by position, and the throttle on anonymous endpoints — the local adapter
 * plus the pure rules the Supabase adapter shares.
 */

let dir: string;
const repo = new LocalRepository();

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-wave6-"));
  process.env.ROSTER_DATA_DIR = dir;
  resetDb();
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const userId = (email: string) => readDb().users.find((u) => u.email === email)!.id;
const profileId = (handle: string) => readDb().profiles.find((p) => p.handle === handle)!.id;

async function rejectsWith(promise: Promise<unknown>, code: DataError["code"]): Promise<DataError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof DataError, `expected DataError, got ${error}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected ${code}`);
}

describe("recruiter lists", () => {
  it("renames a list, refuses a duplicate name, and hides other owners' lists", async () => {
    const owner = userId("recruiter@roster.local");
    const a = await repo.createList(owner, "Rename me", null);
    await repo.createList(owner, "Taken name", null);

    const renamed = await repo.renameList(owner, a.id, "Renamed");
    assert.equal(renamed.name, "Renamed");
    assert.equal(renamed.member_count, 0);
    assert.equal((await repo.getList(owner, a.id))?.list.name, "Renamed");

    await rejectsWith(repo.renameList(owner, a.id, "Taken name"), "conflict");
    // Renaming to its own name is not a conflict with itself.
    assert.equal((await repo.renameList(owner, a.id, "Renamed")).name, "Renamed");
    await rejectsWith(repo.renameList(profileId("jordanreyes"), a.id, "Mine now"), "not_found");
  });

  it("counts members and keeps add idempotent", async () => {
    const owner = userId("recruiter@roster.local");
    const list = await repo.createList(owner, "Counted", null);
    const nina = profileId("ninakowalczyk");
    await repo.addToList(owner, list.id, nina, null);
    await repo.addToList(owner, list.id, nina, null);
    const lists = await repo.listLists(owner);
    assert.equal(lists.find((l) => l.id === list.id)?.member_count, 1);
    assert.deepEqual(await repo.listsContaining(owner, nina), [list.id]);
    await repo.removeFromList(owner, list.id, nina);
    assert.deepEqual(await repo.listsContaining(owner, nina), []);
  });
});

describe("password reset (local stand-in for Supabase recovery)", () => {
  const email = "jordanreyes@roster.local";

  it("answers null for an unknown email, a token for a known one", async () => {
    assert.equal(await repo.requestPasswordReset("nobody@roster.local"), null);
    const issued = await repo.requestPasswordReset(` ${email.toUpperCase()} `);
    assert.ok(issued);
    assert.equal(issued.email, email);
    // Only the hash is stored.
    const rows = readDb().password_resets;
    assert.ok(rows.some((r) => r.token_hash === hashToken(issued.token)));
    assert.ok(!JSON.stringify(rows).includes(issued.token));
    const ttl = Date.parse(issued.expiresAt) - Date.now();
    assert.ok(ttl > 0 && ttl <= PASSWORD_RESET_TTL_MINUTES * 60_000);
  });

  it("sets the password once, signs out every session, and retires older links", async () => {
    const first = (await repo.requestPasswordReset(email))!;
    const second = (await repo.requestPasswordReset(email))!;
    assert.equal(await repo.canResetPassword(first.token), false, "asking again retires the earlier link");
    assert.equal(await repo.canResetPassword(second.token), true);
    assert.equal(await repo.canResetPassword(null), false);

    const before = (await repo.sessionVersion(userId(email))) ?? 0;
    const user = await repo.resetPassword(second.token, "brand-new-pass");
    assert.equal(user.email, email);
    assert.equal(await repo.sessionVersion(user.id), before + 1);
    assert.ok(await repo.signIn(email, "brand-new-pass"));
    assert.equal(await repo.signIn(email, "roster-demo"), null);

    await rejectsWith(repo.resetPassword(second.token, "again-again"), "forbidden");
    await rejectsWith(repo.resetPassword(null, "again-again"), "forbidden");
  });

  it("refuses an expired link", async () => {
    const issued = (await repo.requestPasswordReset(email))!;
    await mutate((db) => {
      const row = db.password_resets.find((r) => r.token_hash === hashToken(issued.token))!;
      row.expires_at = new Date(Date.now() - 1000).toISOString();
    });
    assert.equal(await repo.canResetPassword(issued.token), false);
    await rejectsWith(repo.resetPassword(issued.token, "too-late-pass"), "forbidden");
  });

  it("deleting the account takes its reset links with it", async () => {
    const created = await repo.signUp("doomed@roster.local", "password123");
    await repo.requestPasswordReset("doomed@roster.local");
    await repo.deleteAccount(created.id);
    assert.ok(!readDb().password_resets.some((r) => r.user_id === created.id));
  });
});

describe("account changes", () => {
  it("a local email change is immediate", async () => {
    const created = await repo.signUp("mover@roster.local", "password123");
    assert.equal(await repo.updateEmail(created.id, "Moved@Roster.local"), "updated");
    assert.equal((await repo.getUser(created.id))?.email, "moved@roster.local");
  });

  it("a duplicate sign-up hears the shared non-enumerating copy", async () => {
    const error = await rejectsWith(repo.signUp("jordanreyes@roster.local", "password123"), "conflict");
    assert.equal(error.message, SIGN_UP_CONFLICT_COPY);
    assert.doesNotMatch(error.message, /already (exists|registered)/i);
  });

  it("a wrong current password is refused with the shared copy", async () => {
    const created = await repo.signUp("careful@roster.local", "password123");
    const error = await rejectsWith(repo.updatePassword(created.id, "nope-nope", "password456"), "forbidden");
    assert.match(error.message, /did not match/);
  });
});

describe("Supabase auth errors map to safe copy (#33)", () => {
  it("never passes the raw message through", () => {
    const dup = signUpError({ code: "user_already_exists", status: 422, message: "User already registered" });
    assert.equal(dup.code, "conflict");
    assert.equal(dup.message, SIGN_UP_CONFLICT_COPY);
    assert.equal(signUpError({ message: "User already registered" }).code, "conflict");
    assert.equal(signUpError({ code: "email_exists", status: 422 }).code, "conflict");
  });

  it("rate limits, validation, and the rest", () => {
    assert.equal(signUpError({ status: 429, message: "x" }).code, "rate_limited");
    assert.equal(signUpError({ code: "over_email_send_rate_limit", status: 400 }).code, "rate_limited");
    assert.equal(signUpError({ code: "weak_password", status: 422 }).code, "invalid");
    assert.equal(signUpError({ code: "email_address_invalid", status: 400 }).code, "invalid");
    const other = signUpError({ status: 500, message: "database error saving new user" });
    assert.equal(other.code, "unavailable");
    assert.doesNotMatch(other.message, /database/);
  });

  it("email and password changes get the same treatment", () => {
    assert.equal(emailChangeError({ code: "email_exists", status: 422, message: "A user with this email address has already been registered" }).code, "conflict");
    assert.doesNotMatch(emailChangeError({ code: "email_exists" }).message, /registered/);
    assert.equal(emailChangeError({ status: 429 }).code, "rate_limited");
    assert.equal(newPasswordError({ code: "same_password", status: 422 }).code, "invalid");
    assert.equal(newPasswordError({ code: "weak_password", status: 422 }).code, "invalid");
  });

  it("a recovery session counts for an hour after the link was used", () => {
    const now = 1_800_000_000;
    assert.equal(isRecentRecovery([{ method: "recovery", timestamp: now - 60 }], now), true);
    assert.equal(isRecentRecovery([{ method: "recovery", timestamp: now - PASSWORD_RESET_TTL_MINUTES * 60 - 1 }], now), false);
    assert.equal(isRecentRecovery([{ method: "password", timestamp: now }], now), false);
    assert.equal(isRecentRecovery(["recovery"], now), false, "no timestamp, no trust");
    assert.equal(isRecentRecovery(undefined, now), false);
  });
});

describe("film and entry defaults (#12, #27)", () => {
  it("derives the YouTube thumbnail, as parse_film_url does in 0018", () => {
    assert.equal(
      filmThumbnailUrl(parseFilmUrl("https://youtu.be/aqz-KE-bpKQ")),
      "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",
    );
    assert.equal(filmThumbnailUrl(parseFilmUrl("https://vimeo.com/76979871")), null);
    assert.equal(filmThumbnailUrl(parseFilmUrl("https://www.youtube.com/watch?v=short")), null);
  });

  it("featuring a clip leaves exactly one featured", async () => {
    const owner = profileId("jordanreyes");
    const a = await repo.addFilm(owner, { title: "A", url: "https://youtu.be/aqz-KE-bpKQ", season: null });
    const b = await repo.addFilm(owner, { title: "B", url: "https://vimeo.com/76979871", season: null });
    assert.equal(a.thumbnail_url, "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg");
    await repo.featureFilm(owner, b.id);
    const featured = (await repo.listFilm(owner)).filter((c) => c.is_featured);
    assert.deepEqual(featured.map((c) => c.id), [b.id]);
    await rejectsWith(repo.featureFilm(profileId("ninakowalczyk"), a.id), "not_found");
  });

  it("an entry without a sport takes the athlete's primary sport", async () => {
    const owner = profileId("ninakowalczyk");
    const entry = await repo.addEntry(owner, {
      kind: "award",
      title: "Defaulted sport",
      detail: null,
      value_display: null,
      competition: null,
      location: null,
      placement: null,
      field_size: null,
      achieved_on: "2026-01-01",
    });
    assert.equal(entry.sport, "soccer");
  });
});

describe("search by position (#31)", () => {
  it("matches any of the athlete's positions, case-insensitively", async () => {
    assert.equal(holdsPosition(["WR", "DB"], "wr"), true);
    assert.equal(holdsPosition(["WR"], " "), true, "blank means no filter");
    assert.equal(holdsPosition(["WR"], "QB"), false);

    const lower = await repo.searchAthletes({ position: "wr", pageSize: 100 });
    const upper = await repo.searchAthletes({ position: "WR", pageSize: 100 });
    assert.ok(lower.total > 0);
    assert.equal(lower.total, upper.total);
    assert.ok(lower.athletes.every((a) => a.positions.some((p) => p.toLowerCase() === "wr")));
    assert.equal((await repo.searchAthletes({ position: "nonexistent-position" })).total, 0);
  });

  it("LIKE metacharacters in the query match literally", async () => {
    assert.equal((await repo.searchAthletes({ q: "%" })).total, 0);
    assert.equal((await repo.searchAthletes({ q: "_" })).total, 0);
  });
});

describe("rate limit (#40)", () => {
  it("allows the limit within a window, refuses beyond it, and recovers as hits age out", () => {
    resetRateLimits();
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) assert.equal(hit("test", "1.2.3.4", 3, 1000, t + i), true);
    assert.equal(hit("test", "1.2.3.4", 3, 1000, t + 10), false);
    // Another client and another scope have their own budgets.
    assert.equal(hit("test", "5.6.7.8", 3, 1000, t + 10), true);
    assert.equal(hit("other", "1.2.3.4", 3, 1000, t + 10), true);
    // The first hit ages out; one more fits.
    assert.equal(hit("test", "1.2.3.4", 3, 1000, t + 1000), true);
    assert.equal(hit("test", "1.2.3.4", 3, 1000, t + 1000), false);
    resetRateLimits();
  });
});

describe("password reset email", () => {
  it("carries the link and the window, escaped", () => {
    const url = "https://roster.test/reset-password?token=abc&x=<y>";
    const mail = passwordResetEmail({ url, expiresInMinutes: 60 });
    assert.equal(mail.subject, "Reset your Roster password");
    assert.ok(mail.text.includes(url));
    assert.match(mail.text, /within 1 hour/);
    assert.ok(mail.html.includes("token=abc&amp;x=&lt;y&gt;"));
    assert.ok(!mail.html.includes("<y>"));
  });
});
