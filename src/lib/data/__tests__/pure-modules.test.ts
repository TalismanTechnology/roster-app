import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { homePathFor } from "@/lib/accounts";
import { achievementSchema, httpUrl, idSchema } from "@/lib/actions/schemas";
import { latestToday } from "@/lib/dates";
import { dataMode } from "@/lib/env";
import { isReservedHandle, isValidHandle, RESERVED_HANDLES } from "@/lib/handles";
import { recordLinks, safeHttpUrl, socialHandle, socialLinks } from "@/lib/links";
import { toStateCode, US_STATES } from "@/lib/regions";
import { safeNext, signInHref } from "@/lib/safe-next";
import { absoluteUrl, siteHost, siteUrl, verifyUrl } from "@/lib/site";

import { canPinAnother, isSubstantiveEntryChange, MAX_PINNED } from "../rules";
import {
  allowsFuzzy,
  clampPage,
  clampPageSize,
  escapeLike,
  MAX_QUERY_LENGTH,
  normalizeSearchQuery,
  pageCount,
} from "../search-query";

/** Restores any env vars a test sets. */
const saved = new Map<string, string | undefined>();
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (!saved.has(k)) saved.set(k, process.env[k]);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  saved.clear();
});

// ---------------------------------------------------------------------------

describe("reserved handles", () => {
  /** Next's own file conventions inside src/app — not routes. */
  const NOT_ROUTES = new Set(["layout", "page", "error", "global-error", "not-found", "loading", "template", "default", "globals", "route"]);

  it("reserves every top-level route segment in src/app", () => {
    const appDir = path.join(process.cwd(), "src", "app");
    const segments = fs
      .readdirSync(appDir, { withFileTypes: true })
      .map((d) => (d.isDirectory() ? d.name : d.name.replace(/\.[^.]+$/, "")))
      // Dynamic segments ([handle]) and route groups ((marketing)) are not literal paths.
      .filter((name) => !name.startsWith("[") && !name.startsWith("(") && !name.startsWith("_"))
      .filter((name) => !NOT_ROUTES.has(name));

    assert.ok(segments.includes("search"), "sanity: the scan found routes");
    const missing = segments.filter((s) => !RESERVED_HANDLES.has(s));
    assert.deepEqual(missing, [], `add to RESERVED_HANDLES: ${missing.join(", ")}`);
  });

  it("includes the known routes, metadata files, and policy pages", () => {
    for (const h of [
      "lists", "search", "resume", "settings", "onboarding", "preview", "verify", "auth", "sign-in", "sign-up",
      "manifest", "sitemap", "robots", "favicon", "icon", "apple-icon", "privacy", "terms",
    ]) {
      assert.ok(RESERVED_HANDLES.has(h), h);
    }
  });

  it("is case-insensitive and blocks valid-looking reserved handles", () => {
    assert.equal(isReservedHandle("Lists"), true);
    assert.equal(isValidHandle("lists"), false);
    assert.equal(isValidHandle("sitemap"), false);
    assert.equal(isValidHandle("jordanreyes"), true);
  });
});

describe("dataMode in production", () => {
  const unconfigured = {
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    NEXT_PHASE: undefined,
  };

  it("throws when nothing is configured and local was not asked for", () => {
    setEnv({ ...unconfigured, NODE_ENV: "production", ROSTER_DATA: undefined });
    assert.throws(() => dataMode(), /ROSTER_DATA=local/);
  });

  it("treats a blank ROSTER_DATA as unset", () => {
    setEnv({ ...unconfigured, NODE_ENV: "production", ROSTER_DATA: "  " });
    assert.throws(() => dataMode());
  });

  it("throws for placeholder Supabase credentials too", () => {
    setEnv({
      NODE_ENV: "production",
      ROSTER_DATA: undefined,
      NEXT_PHASE: undefined,
      NEXT_PUBLIC_SUPABASE_URL: "https://your-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key",
    });
    assert.throws(() => dataMode());
  });

  it("allows local when it is set explicitly", () => {
    setEnv({ ...unconfigured, NODE_ENV: "production", ROSTER_DATA: "local" });
    assert.equal(dataMode(), "local");
  });

  it("picks supabase when real credentials are present", () => {
    setEnv({
      NODE_ENV: "production",
      ROSTER_DATA: undefined,
      NEXT_PHASE: undefined,
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "real-key",
    });
    assert.equal(dataMode(), "supabase");
  });

  it("lets next build prerender without runtime config", () => {
    setEnv({ ...unconfigured, NODE_ENV: "production", ROSTER_DATA: undefined, NEXT_PHASE: "phase-production-build" });
    assert.equal(dataMode(), "local");
  });

  it("still falls back to local in development", () => {
    setEnv({ ...unconfigured, NODE_ENV: "development", ROSTER_DATA: undefined });
    assert.equal(dataMode(), "local");
  });
});

describe("id schema", () => {
  it("accepts UUIDs", () => {
    assert.equal(idSchema.safeParse("6f1c2a52-6a4b-4d2e-9a77-0c5b0f8d1e23").success, true);
    assert.equal(idSchema.safeParse(crypto.randomUUID()).success, true);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "1", "preview-athlete", "__new__", "6f1c2a52-6a4b-4d2e-9a77", "' or 1=1 --", "6f1c2a52-6a4b-4d2e-9a77-0c5b0f8d1e23x"]) {
      assert.equal(idSchema.safeParse(bad).success, false, bad);
    }
  });
});

describe("achievement schema", () => {
  const base = {
    kind: "personal_record",
    title: "400m",
    detail: "",
    value_display: "53.94",
    competition: "",
    location: "",
    placement: "",
    field_size: "",
    achieved_on: "2026-05-01",
  };

  it("accepts a valid entry and maps blanks to null", () => {
    const parsed = achievementSchema.parse(base);
    assert.equal(parsed.detail, null);
    assert.equal(parsed.placement, null);
  });

  it("accepts today", () => {
    assert.equal(achievementSchema.safeParse({ ...base, achieved_on: new Date().toISOString().slice(0, 10) }).success, true);
  });

  it("rejects a future date", () => {
    const result = achievementSchema.safeParse({ ...base, achieved_on: "2999-01-01" });
    assert.equal(result.success, false);
    assert.match(result.error!.issues[0].message, /future/);
  });

  it("rejects a date two days out", () => {
    const twoDays = new Date(Date.now() + 2 * 86_400_000 + 15 * 3_600_000).toISOString().slice(0, 10);
    assert.equal(achievementSchema.safeParse({ ...base, achieved_on: twoDays }).success, false);
  });

  it("rejects an impossible calendar date", () => {
    assert.equal(achievementSchema.safeParse({ ...base, achieved_on: "2026-13-45" }).success, false);
  });

  it("rejects a placement larger than the field", () => {
    const result = achievementSchema.safeParse({ ...base, placement: "9", field_size: "8" });
    assert.equal(result.success, false);
    assert.match(result.error!.issues[0].message, /field size/);
  });

  it("allows placement equal to the field, or either one alone", () => {
    assert.equal(achievementSchema.safeParse({ ...base, placement: "8", field_size: "8" }).success, true);
    assert.equal(achievementSchema.safeParse({ ...base, placement: "3" }).success, true);
    assert.equal(achievementSchema.safeParse({ ...base, field_size: "30" }).success, true);
  });
});

describe("latestToday", () => {
  it("is the UTC+14 calendar date", () => {
    assert.equal(latestToday(new Date("2026-11-05T09:59:00Z")), "2026-11-05");
    assert.equal(latestToday(new Date("2026-11-05T10:00:00Z")), "2026-11-06");
  });
});

describe("httpUrl", () => {
  it("only lets http(s) through", () => {
    assert.equal(httpUrl.safeParse("https://hudl.com/profile/1").success, true);
    assert.equal(httpUrl.safeParse("javascript:alert(1)").success, false);
    assert.equal(httpUrl.safeParse("ftp://example.com").success, false);
  });
});

describe("search query hygiene", () => {
  it("normalizes whitespace and blanks", () => {
    assert.equal(normalizeSearchQuery("  Jordan   Reyes  "), "Jordan Reyes");
    assert.equal(normalizeSearchQuery("   "), null);
    assert.equal(normalizeSearchQuery(null), null);
  });

  it("caps length", () => {
    const q = normalizeSearchQuery("a".repeat(500))!;
    assert.equal(q.length, MAX_QUERY_LENGTH);
  });

  it("escapes LIKE metacharacters, backslash first", () => {
    assert.equal(escapeLike("100%"), "100\\%");
    assert.equal(escapeLike("o_brien"), "o\\_brien");
    assert.equal(escapeLike("a\\b"), "a\\\\b");
    assert.equal(escapeLike("\\%"), "\\\\\\%");
    assert.equal(escapeLike("Jordan Reyes"), "Jordan Reyes");
  });

  it("requires two characters for fuzzy matching", () => {
    assert.equal(allowsFuzzy(null), false);
    assert.equal(allowsFuzzy("j"), false);
    assert.equal(allowsFuzzy("jo"), true);
  });

  it("clamps pages and sizes", () => {
    assert.equal(pageCount(0, 24), 1);
    assert.equal(pageCount(25, 24), 2);
    assert.equal(clampPage(5, 25, 24), 2);
    assert.equal(clampPage(0, 25, 24), 1);
    assert.equal(clampPage(null, 25, 24), 1);
    assert.equal(clampPage(1.7, 100, 24), 1);
    assert.equal(clampPageSize(undefined), 24);
    assert.equal(clampPageSize(0), 24);
    assert.equal(clampPageSize(-3), 1);
    assert.equal(clampPageSize(5000), 100);
  });
});

describe("entry rules", () => {
  const current = { title: "400m", value_display: "53.94", placement: 2, detail: null, achieved_on: "2026-05-01" };

  it("a changed claim is substantive", () => {
    assert.equal(isSubstantiveEntryChange(current, { value_display: "52.00" }), true);
    assert.equal(isSubstantiveEntryChange(current, { placement: 1 }), true);
    assert.equal(isSubstantiveEntryChange(current, { detail: "now there is a story" }), true);
  });

  it("a repeat of the same values, or an omitted field, is not", () => {
    assert.equal(isSubstantiveEntryChange(current, {}), false);
    assert.equal(isSubstantiveEntryChange(current, { title: "400m", value_display: "53.94" }), false);
    assert.equal(isSubstantiveEntryChange(current, { detail: null }), false);
  });

  it("pin cap", () => {
    const pinned = (n: number) => Array.from({ length: n }, () => ({ is_pinned: true }));
    assert.equal(canPinAnother([...pinned(MAX_PINNED - 1), { is_pinned: false }]), true);
    assert.equal(canPinAnother(pinned(MAX_PINNED)), false);
  });
});

describe("site URL", () => {
  it("defaults to roster.us", () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: undefined });
    assert.equal(siteUrl(), "https://roster.us");
    assert.equal(siteHost(), "roster.us");
  });

  it("uses the configured origin without a trailing slash or path", () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000/" });
    assert.equal(siteUrl(), "http://localhost:3000");
    assert.equal(siteHost(), "localhost:3000");
    assert.equal(absoluteUrl("/search"), "http://localhost:3000/search");
    assert.equal(absoluteUrl("search"), "http://localhost:3000/search");
  });

  it("builds absolute verify links", () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: "https://roster.us" });
    assert.equal(verifyUrl("abc123"), "https://roster.us/verify/abc123");
  });

  it("falls back on a malformed value instead of throwing", () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: "not a url" });
    assert.equal(siteUrl(), "https://roster.us");
  });
});

describe("safe next", () => {
  it("keeps relative paths", () => {
    assert.equal(safeNext("/lists/abc", "/resume"), "/lists/abc");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "evil", "", null, 42]) {
      assert.equal(safeNext(bad, "/resume"), "/resume", String(bad));
    }
  });

  it("signInHref carries next only when it is safe", () => {
    assert.equal(signInHref("/resume"), "/sign-in?next=%2Fresume");
    assert.equal(signInHref("//evil.com"), "/sign-in");
    assert.equal(signInHref(undefined, "/sign-up"), "/sign-up");
  });
});

describe("account home", () => {
  it("only athletes land in the editor", () => {
    assert.equal(homePathFor("athlete"), "/resume");
    assert.equal(homePathFor(null), "/resume");
    for (const kind of ["recruiter", "coach", "brand", "staff"] as const) assert.equal(homePathFor(kind), "/lists");
  });
});

describe("profile links", () => {
  it("accepts handles typed every common way", () => {
    const ig = ["instagram.com"];
    const pattern = /^[A-Za-z0-9._]{1,30}$/;
    assert.equal(socialHandle("avareyes.track", ig, pattern), "avareyes.track");
    assert.equal(socialHandle("@avareyes.track", ig, pattern), "avareyes.track");
    assert.equal(socialHandle("https://www.instagram.com/avareyes.track/", ig, pattern), "avareyes.track");
  });

  it("refuses other sites, scripts, and junk", () => {
    const ig = ["instagram.com"];
    const pattern = /^[A-Za-z0-9._]{1,30}$/;
    assert.equal(socialHandle("https://evil.com/avareyes", ig, pattern), null);
    assert.equal(socialHandle("javascript:alert(1)", ig, pattern), null);
    assert.equal(socialHandle("two words", ig, pattern), null);
    assert.equal(socialHandle("", ig, pattern), null);
  });

  it("builds canonical hrefs", () => {
    assert.deepEqual(
      socialLinks({ instagram: "@ava", x_handle: "https://twitter.com/ava_runs" }).map((l) => l.href),
      ["https://www.instagram.com/ava/", "https://x.com/ava_runs"],
    );
    assert.deepEqual(
      recordLinks({ hudl_url: "https://www.hudl.com/profile/1", results_url: "javascript:alert(1)" }).map((l) => l.kind),
      ["hudl"],
    );
    assert.equal(safeHttpUrl("data:text/html,hi"), null);
  });
});

describe("US states", () => {
  it("has the 50 states and DC, and normalizes codes", () => {
    assert.equal(US_STATES.length, 51);
    assert.equal(toStateCode(" tx "), "TX");
    assert.equal(toStateCode("Texas"), null);
    assert.equal(toStateCode(""), null);
  });
});
