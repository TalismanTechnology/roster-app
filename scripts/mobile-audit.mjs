/**
 * Phone regression suite. Every key route at 320×568, 375×812, 390×844 and
 * 430×932, as an iPhone (touch, mobile viewport, 2× DPR), asserting:
 *
 *   1. no horizontal overflow — `scrollWidth <= width + 1`, against the
 *      device width itself: a mobile browser widens its layout viewport to
 *      fit overflowing content, so `innerWidth` alone would hide it;
 *   2. no visible input / select / textarea under 16px at widths ≤ 390
 *      (iOS zooms into anything smaller on focus);
 *   3. primary controls at least 40px tall — `header a`, `header button`,
 *      `.btn-primary`, `.btn-outline`, and every `form button[type=submit]`;
 *   4. no uncaught page errors.
 *
 * Plus two behaviours that only matter on a phone: at 390×844 the first
 * search result starts above the fold, and the editor's Preview drawer
 * opens the live resume and its Edit button returns to the same scroll
 * position.
 *
 * Signed-in routes run under the seeded athlete or recruiter, `/onboarding`
 * under a fresh sign-up; a verify token and a list id are created or looked
 * up first. Spawns its own isolated server (it writes: a sign-up, a request
 * link) unless pointed elsewhere with --base=. Writes a JSON report and five
 * 390×844 screenshots to /workspace/mobile-shots/ (outside the repo) and
 * exits non-zero on any finding.
 *
 * Usage:  node scripts/mobile-audit.mjs [--base=http://127.0.0.1:3000]
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright-core";

import { serverFromArgs } from "./lib/server.mjs";

const OUT = "/workspace/mobile-shots";
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

/** Controls held to the 40px floor. Kept narrow on purpose: these are the ones a thumb aims for. */
const TAP_SELECTOR = "header a, header button, .btn-primary, .btn-outline, form button[type=submit]";
const MIN_TAP = 40;
const MIN_FIELD_FONT = 16;
/** At 390×844, where the first search result must start (px from the top of the page). */
const SEARCH_FOLD = 460;

/**
 * Known, intentional exceptions — each one a selector the overflow check
 * ignores, and why. Marquees (the landing ticker, ScrollVelocity) are wider
 * than the screen by design but clip inside their own `overflow: hidden`
 * band, so they never widen the document and need no entry here. Keep this
 * list empty unless something genuinely has to bleed.
 */
const OVERFLOW_EXCEPTIONS = [];

const ACCOUNTS = {
  athlete: ["jordanreyes@roster.local", "roster-demo"],
  recruiter: ["recruiter@roster.local", "roster-demo"],
};

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const { base } = await serverFromArgs({ label: "roster-mobile-audit" });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const stamp = Date.now().toString(36);
const findings = [];
const report = { base, generatedAt: new Date().toISOString(), routes: [], checks: {} };

/** Two tries at anything that waits on a server action — a cold route can be slow once. */
async function retry(label, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 2) throw new Error(`${label}: ${e.message ?? e}`);
      process.stderr.write(`${label}: retrying after ${String(e.message ?? e).split("\n")[0]}\n`);
    }
  }
}

/** One phone context per role; every viewport opens its own page in it. */
async function phoneContext(as) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
  });
  if (!as) return context;

  await retry(`sign-in as ${as}`, async () => {
    const page = await context.newPage();
    try {
      await page.goto(`${base}${as === "fresh" ? "/sign-up" : "/sign-in"}`, { waitUntil: "networkidle" });
      if (as === "fresh") {
        // A new account with no profile yet: the only way onto /onboarding.
        await page.getByLabel("Email").fill(`maudit-${stamp}-${Math.random().toString(36).slice(2, 7)}@roster.local`);
        await page.getByLabel("Password").fill("password123");
        await page.getByRole("button", { name: /create account/i }).click();
        await page.waitForURL(/\/onboarding$/, { timeout: 30_000 });
      } else {
        await page.getByLabel("Email").fill(ACCOUNTS[as][0]);
        await page.getByLabel("Password").fill(ACCOUNTS[as][1]);
        await page.getByRole("button", { name: /sign in/i }).click();
        await page.waitForURL(/\/(resume|lists|search|onboarding)/, { timeout: 30_000 });
      }
    } finally {
      await page.close().catch(() => {});
    }
  });
  return context;
}

const contexts = {
  public: await phoneContext(null),
  athlete: await phoneContext("athlete"),
  recruiter: await phoneContext("recruiter"),
  fresh: await phoneContext("fresh"),
};

// A live verify link: the athlete asks for one in the editor.
let verifyPath = null;
await retry("verify link", async () => {
  const page = await contexts.athlete.newPage();
  try {
    await page.goto(`${base}/resume?section=record`, { waitUntil: "networkidle" });
    const existing = page.locator("code", { hasText: "/verify/" }).first();
    if (!(await existing.count())) {
      const summary = page.locator("summary", { hasText: "Request verification" }).first();
      await summary.click();
      await summary.locator("xpath=ancestor::details[1]").getByRole("button", { name: /create request link/i }).click();
      await existing.waitFor({ timeout: 20_000 });
    }
    verifyPath = new URL((await existing.textContent()).trim(), base).pathname;
  } finally {
    await page.close();
  }
});

// One of the recruiter's own lists, by id.
let listPath = null;
{
  const page = await contexts.recruiter.newPage();
  await page.goto(`${base}/lists`, { waitUntil: "networkidle" });
  listPath = await page.locator('a[href^="/lists/"]').first().getAttribute("href");
  await page.close();
}

const ROUTES = [
  { path: "/", as: "public", shot: "landing.png" },
  { path: "/preview", as: "public", shot: "profile-preview.png" },
  { path: "/jordanreyes", as: "public" },
  { path: "/search", as: "public", shot: "search.png", searchFold: true },
  { path: "/search?sport=football&state=TX", as: "public" },
  { path: "/search", as: "recruiter" },
  { path: "/sign-in", as: "public" },
  { path: "/sign-up", as: "public" },
  { path: "/forgot-password", as: "public" },
  { path: "/privacy", as: "public" },
  { path: "/terms", as: "public" },
  { path: "/resume", as: "athlete", shot: "resume-editor.png", previewDrawer: true },
  { path: "/resume?section=record", as: "athlete" },
  { path: "/settings", as: "athlete" },
  { path: "/lists", as: "recruiter" },
  { path: () => listPath, as: "recruiter" },
  { path: "/onboarding", as: "fresh" },
  { path: () => verifyPath, as: "public", shot: "verify.png" },
];

const counts = { pages: 0, overflow: 0, smallFields: 0, smallTaps: 0, pageErrors: 0, behaviours: 0 };

for (const entry of ROUTES) {
  const routePath = typeof entry.path === "function" ? entry.path() : entry.path;
  if (!routePath) {
    findings.push(`setup: could not resolve a ${entry.as} dynamic route`);
    continue;
  }

  for (const vp of VIEWPORTS) {
    const label = `${routePath} [${entry.as}] @${vp.width}×${vp.height}`;
    const page = await contexts[entry.as].newPage();
    await page.setViewportSize(vp);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message ?? e).slice(0, 200)));

    let status = 0;
    try {
      const response = await page.goto(`${base}${routePath}`, { waitUntil: "networkidle", timeout: 45_000 });
      status = response?.status() ?? 0;
    } catch (e) {
      findings.push(`${label}: navigation failed: ${String(e.message ?? e).split("\n")[0]}`);
      await page.close();
      continue;
    }
    if (status !== 200) findings.push(`${label}: status ${status}`);
    // The dev-overlay portal is not the page.
    await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast] { display: none !important; }" });
    await page.waitForTimeout(250);

    const m = await page.evaluate(
      ({ tapSelector, minTap, minFont, checkFonts, exceptions, deviceWidth }) => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          if (r.width <= 1 || r.height <= 1) return false;
          const s = getComputedStyle(el);
          if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
          if (s.clipPath === "inset(50%)" || s.clip === "rect(0px, 0px, 0px, 0px)") return false;
          return !el.closest("[aria-hidden=true], [inert]");
        };
        const describe = (el) =>
          `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;

        // 1. Overflow, minus documented exceptions (measured with them hidden).
        const hidden = [];
        for (const sel of exceptions) for (const el of document.querySelectorAll(sel)) {
          hidden.push([el, el.style.display]);
          el.style.display = "none";
        }
        const doc = document.documentElement;
        const scrollWidth = Math.max(doc.scrollWidth, document.body.scrollWidth);
        const overflow = scrollWidth > deviceWidth + 1 || window.innerWidth > deviceWidth + 1;
        const culprits = [];
        if (overflow) {
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > deviceWidth + 1 && culprits.length < 5) culprits.push(`${describe(el)} right=${Math.round(r.right)}`);
          }
        }
        for (const [el, display] of hidden) el.style.display = display;

        // 2. Fields under 16px.
        const smallFields = [];
        if (checkFonts) {
          for (const el of document.querySelectorAll("input, select, textarea")) {
            const type = (el.getAttribute("type") || "").toLowerCase();
            if (["hidden", "checkbox", "radio", "range", "file"].includes(type) || !visible(el)) continue;
            const size = parseFloat(getComputedStyle(el).fontSize);
            if (size > 0 && size < minFont) smallFields.push(`${el.tagName.toLowerCase()}[name=${el.getAttribute("name") ?? "?"}] ${size}px`);
          }
        }

        // 3. Primary controls under 40px tall.
        const smallTaps = [];
        for (const el of document.querySelectorAll(tapSelector)) {
          if (!visible(el)) continue;
          const h = el.getBoundingClientRect().height;
          if (h < minTap) smallTaps.push(`${describe(el)} ${Math.round(h)}px`);
        }

        return { scrollWidth, innerWidth: window.innerWidth, overflow, culprits, smallFields, smallTaps: [...new Set(smallTaps)] };
      },
      { tapSelector: TAP_SELECTOR, minTap: MIN_TAP, minFont: MIN_FIELD_FONT, checkFonts: vp.width <= 390, exceptions: OVERFLOW_EXCEPTIONS, deviceWidth: vp.width },
    );

    const result = { route: routePath, as: entry.as, viewport: `${vp.width}x${vp.height}`, status, ...m, pageErrors: errors };

    if (m.overflow) {
      counts.overflow++;
      findings.push(`${label}: overflow ${Math.max(m.scrollWidth, m.innerWidth)}>${vp.width} (${m.culprits.join("; ")})`);
    }
    for (const f of m.smallFields) {
      counts.smallFields++;
      findings.push(`${label}: field under ${MIN_FIELD_FONT}px: ${f}`);
    }
    for (const t of m.smallTaps) {
      counts.smallTaps++;
      findings.push(`${label}: tap target under ${MIN_TAP}px: ${t}`);
    }

    // At 390×844: the results, not the filters, fill the first screen.
    if (entry.searchFold && vp.width === 390) {
      const top = await page.evaluate(() => {
        const row = document.querySelector('section[aria-label="Results"] ol > li');
        return row ? Math.round(row.getBoundingClientRect().top + window.scrollY) : null;
      });
      result.firstResultTop = top;
      report.checks.searchFirstResultTop = top;
      counts.behaviours++;
      if (top === null) findings.push(`${label}: no search result rendered`);
      else if (top > SEARCH_FOLD) findings.push(`${label}: first result at ${top}px, expected ≤ ${SEARCH_FOLD}px`);
    }

    if (entry.shot && vp.width === 390) await page.screenshot({ path: path.join(OUT, entry.shot) });

    // At 390×844: Preview lays the resume over the editor; Edit comes back to the same place.
    if (entry.previewDrawer && vp.width === 390) {
      counts.behaviours++;
      try {
        await page.evaluate(() => window.scrollTo(0, 600));
        await page.waitForTimeout(150);
        const before = await page.evaluate(() => window.scrollY);
        await page.getByRole("button", { name: "Preview", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Live preview" });
        await dialog.waitFor({ state: "visible", timeout: 5_000 });
        if (!(await dialog.getByRole("heading", { level: 1 }).isVisible())) throw new Error("drawer shows no resume heading");
        const drawerOverflow = await page.evaluate((w) => document.documentElement.scrollWidth > w + 1, vp.width);
        if (drawerOverflow) throw new Error("drawer overflows horizontally");
        await page.screenshot({ path: path.join(OUT, "resume-preview-drawer.png") });
        await dialog.getByRole("button", { name: /edit/i }).click();
        await dialog.waitFor({ state: "hidden", timeout: 5_000 });
        const after = await page.evaluate(() => window.scrollY);
        result.previewDrawer = { before, after };
        report.checks.previewDrawer = { scrollBefore: before, scrollAfter: after };
        if (Math.abs(after - before) > 2) throw new Error(`scroll moved ${before}→${after}`);
      } catch (e) {
        findings.push(`${label}: preview drawer: ${String(e.message ?? e).split("\n")[0]}`);
      }
    }

    for (const e of errors) {
      counts.pageErrors++;
      findings.push(`${label}: pageerror: ${e}`);
    }

    counts.pages++;
    report.routes.push(result);
    const bad = m.overflow || m.smallFields.length || m.smallTaps.length || errors.length;
    process.stdout.write(`${bad ? "FAIL" : "ok  "} ${label}\n`);
    await page.close();
  }
}

await browser.close();

report.counts = counts;
report.findings = findings;
report.exceptions = OVERFLOW_EXCEPTIONS;
await writeFile(path.join(OUT, "mobile-audit-report.json"), JSON.stringify(report, null, 2));

process.stdout.write(
  `\n${counts.pages} page loads · overflow ${counts.overflow} · fields <${MIN_FIELD_FONT}px ${counts.smallFields} · taps <${MIN_TAP}px ${counts.smallTaps} · pageerrors ${counts.pageErrors} · behaviour checks ${counts.behaviours}` +
    (report.checks.searchFirstResultTop != null ? ` · first search result @390: ${report.checks.searchFirstResultTop}px` : "") +
    `\nreport: ${OUT}/mobile-audit-report.json\n`,
);

if (findings.length) {
  process.stdout.write(`\n${findings.length} finding(s):\n${findings.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("\nno findings\n");
// Explicitly, like the smoke: the server child's pipes keep the event loop alive.
process.exit(0);
