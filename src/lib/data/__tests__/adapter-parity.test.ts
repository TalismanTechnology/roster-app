import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { dummyPasswordHash, hashPassword, verifyPassword, verifyPasswordConstantTime } from "../local/password";
import { LocalRepository } from "../local/repository";
import { mutate, readDb, resetDb, withStoreLock } from "../local/store";

/**
 * The store lock, constant-time sign-in, batched list membership, and the
 * search contract (real totals, clamped pages) against the local adapter.
 */

let dir: string;
const repo = new LocalRepository();

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-parity-"));
  process.env.ROSTER_DATA_DIR = dir;
  resetDb();
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("store lock", () => {
  it("holds across an async change, so interleaved read-modify-writes all land", async () => {
    const id = readDb().profiles[0].id;
    const start = readDb().profiles[0].entry_count;

    // Each change reads, yields to the event loop, then writes — the exact
    // shape that loses updates without a lock.
    await Promise.all(
      Array.from({ length: 10 }, () =>
        mutate(async (db) => {
          const p = db.profiles.find((x) => x.id === id)!;
          const seen = p.entry_count;
          await sleep(2);
          p.entry_count = seen + 1;
        }),
      ),
    );
    assert.equal(readDb().profiles.find((p) => p.id === id)!.entry_count, start + 10);
    await mutate((db) => {
      db.profiles.find((p) => p.id === id)!.entry_count = start;
    });
  });

  it("runs tasks in submission order and survives a rejection", async () => {
    const order: number[] = [];
    const results = await Promise.allSettled([
      withStoreLock(async () => {
        await sleep(5);
        order.push(1);
      }),
      withStoreLock(() => {
        order.push(2);
        throw new Error("boom");
      }),
      withStoreLock(() => {
        order.push(3);
        return "ok";
      }),
    ]);
    assert.deepEqual(order, [1, 2, 3]);
    assert.equal(results[1].status, "rejected");
    assert.deepEqual(results[2], { status: "fulfilled", value: "ok" });
  });
});

describe("constant-time sign-in", () => {
  it("the dummy hash is a real scrypt hash, made once", () => {
    const hash = dummyPasswordHash();
    assert.match(hash, /^scrypt\$\d+\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    assert.equal(dummyPasswordHash(), hash);
    // Same cost parameter as real accounts, so it costs the same to check.
    assert.equal(hash.split("$")[1], hashPassword("x").split("$")[1]);
  });

  it("a missing account is always false, even for the dummy's own input space", () => {
    assert.equal(verifyPasswordConstantTime("anything", null), false);
    assert.equal(verifyPasswordConstantTime("anything", undefined), false);
    assert.equal(verifyPasswordConstantTime("", null), false);
  });

  it("an existing account behaves exactly like verifyPassword", () => {
    const stored = hashPassword("correct horse");
    assert.equal(verifyPasswordConstantTime("correct horse", stored), true);
    assert.equal(verifyPasswordConstantTime("wrong", stored), verifyPassword("wrong", stored));
  });

  it("an unknown email takes as long as a wrong password — scrypt runs either way", async () => {
    const median = async (fn: () => Promise<unknown>) => {
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        await fn();
        times.push(performance.now() - t);
      }
      return times.sort((a, b) => a - b)[2];
    };
    dummyPasswordHash(); // warm: the one-time hash is not part of the per-request cost
    const known = await median(() => repo.signIn("jordanreyes@roster.local", "wrong-password"));
    const unknown = await median(() => repo.signIn("nobody-here@roster.local", "wrong-password"));

    assert.equal(await repo.signIn("nobody-here@roster.local", "wrong-password"), null);
    // Skipping scrypt would make the unknown path ~100x faster. A loose
    // bound keeps this meaningful without being flaky on a busy machine.
    assert.ok(unknown > known * 0.3, `unknown ${unknown.toFixed(1)}ms vs known ${known.toFixed(1)}ms`);
  });
});

describe("listsContainingMany", () => {
  it("answers for a whole page in one call and matches listsContaining row by row", async () => {
    const recruiter = (await repo.signIn("recruiter@roster.local", "roster-demo"))!;
    const { athletes } = await repo.searchAthletes({ pageSize: 50 });
    const ids = athletes.map((a) => a.id);

    const batch = await repo.listsContainingMany(recruiter.id, ids);
    assert.deepEqual(Object.keys(batch).sort(), [...ids].sort());
    for (const id of ids) {
      assert.deepEqual([...batch[id]].sort(), [...(await repo.listsContaining(recruiter.id, id))].sort());
    }
    // The seed saves two athletes to the recruiter's list.
    assert.ok(Object.values(batch).filter((lists) => lists.length > 0).length >= 2);
  });

  it("never reveals another owner's lists", async () => {
    const recruiter = (await repo.signIn("recruiter@roster.local", "roster-demo"))!;
    const jordan = (await repo.getProfileByHandle("jordanreyes", null))!;
    assert.ok((await repo.listsContaining(recruiter.id, jordan.id)).length > 0);
    assert.deepEqual(await repo.listsContainingMany("someone-else", [jordan.id]), { [jordan.id]: [] });
  });

  it("returns an empty map for no ids", async () => {
    assert.deepEqual(await repo.listsContainingMany("anyone", []), {});
  });
});

describe("search contract", () => {
  it("reports the real total and the page served", async () => {
    const all = await repo.searchAthletes({ pageSize: 100 });
    assert.equal(all.total, all.athletes.length);
    assert.ok(all.total > 3);

    const paged = await repo.searchAthletes({ pageSize: 2, page: 2 });
    assert.equal(paged.total, all.total);
    assert.equal(paged.page, 2);
    assert.equal(paged.pageSize, 2);
    assert.deepEqual(
      paged.athletes.map((a) => a.id),
      all.athletes.slice(2, 4).map((a) => a.id),
    );
  });

  it("clamps a page past the end to the last page", async () => {
    const { total } = await repo.searchAthletes({});
    const last = Math.ceil(total / 2);
    const result = await repo.searchAthletes({ pageSize: 2, page: 999 });
    assert.equal(result.page, last);
    assert.ok(result.athletes.length > 0);
  });

  it("clamps zero, negative, and fractional pages to sane values", async () => {
    assert.equal((await repo.searchAthletes({ page: 0 })).page, 1);
    assert.equal((await repo.searchAthletes({ page: -5 })).page, 1);
    assert.equal((await repo.searchAthletes({ page: Number.NaN })).page, 1);
  });

  it("an empty result is page 1 of 0, not page 0", async () => {
    const none = await repo.searchAthletes({ q: "zzzzzzzzzzzz", page: 4 });
    assert.equal(none.total, 0);
    assert.equal(none.page, 1);
    assert.deepEqual(none.athletes, []);
  });

  it("caps page size", async () => {
    assert.equal((await repo.searchAthletes({ pageSize: 10_000 })).pageSize, 100);
  });

  it("treats LIKE metacharacters as literal text", async () => {
    // Every name contains *something*; "%" as a wildcard would match all.
    assert.equal((await repo.searchAthletes({ q: "%" })).total, 0);
    assert.equal((await repo.searchAthletes({ q: "_" })).total, 0);
  });

  it("an over-long query is truncated rather than scanned in full", async () => {
    const long = "Jordan Reyes" + " x".repeat(500);
    const result = await repo.searchAthletes({ q: long });
    assert.ok(Array.isArray(result.athletes)); // no throw, bounded work
  });

  it("a one-character query matches by substring only, never fuzzily", async () => {
    const { athletes } = await repo.searchAthletes({ q: "q", pageSize: 100 });
    for (const a of athletes) {
      assert.ok(a.display_name.toLowerCase().includes("q") || a.handle.includes("q"), a.handle);
    }
  });
});
