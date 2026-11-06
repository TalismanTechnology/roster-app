/**
 * End-to-end smoke of the product loop, isolated.
 *
 * By default this spawns its own `next start` (build first: `npm run build`)
 * on a free port against a throwaway ROSTER_DATA_DIR, so it never touches the
 * developer's `.data/` and never depends on a server someone left running.
 * The temp directory and the server are torn down on exit, pass or fail.
 * Pass `--base=` to point it at a server you started yourself instead.
 *
 * Runs in local data mode against the seeded roster. Each step asserts the
 * thing a user would notice; a failure prints the step and the page URL.
 *
 * Usage:  node scripts/smoke.mjs [--base=http://127.0.0.1:3000] [--shots=dir]
 */

import { chromium } from "playwright-core";

import { serverFromArgs } from "./lib/server.mjs";

const stamp = Date.now().toString(36);
const { base, dataDir } = await serverFromArgs({ label: "roster-smoke" });
process.stdout.write(`smoke against ${base}${dataDir ? ` (data: ${dataDir})` : ""}\n\n`);

const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// A policy violation is a broken feature the user may not notice: an
// iframe that never loads, a script that never ran. Collected for every page.
const cspViolations = [];
page.on("console", (m) => {
  if (/Content Security Policy/i.test(m.text())) cspViolations.push(`${page.url()}: ${m.text().slice(0, 200)}`);
});

let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    process.stdout.write(`ok   ${name}\n`);
  } catch (error) {
    failures++;
    process.stdout.write(`FAIL ${name}\n     ${String(error.message ?? error).split("\n")[0]}\n     at ${page.url()}\n`);
  }
}

const shotsDir = process.argv.find((a) => a.startsWith("--shots="))?.split("=")[1];
const shot = async (name) => {
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png` });
};

// Auto-waits: routes with a loading boundary change URL before their content
// streams in, so a one-shot visibility check would assert against the shell.
const expectText = async (text, timeout = 10_000) => {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
  } catch {
    throw new Error(`expected to see "${text}"`);
  }
};

await step("security headers: CSP everywhere, no referrer from a verify link", async () => {
  const home = await fetch(`${base}/`);
  const csp = home.headers.get("content-security-policy") ?? "";
  for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "youtube-nocookie.com"]) {
    if (!csp.includes(directive)) throw new Error(`CSP missing ${directive}: ${csp}`);
  }
  const verify = await fetch(`${base}/verify/not-a-real-token`);
  const policy = verify.headers.get("referrer-policy");
  if (policy !== "no-referrer") throw new Error(`verify Referrer-Policy is ${policy}`);
  // `next start` here is not the production deploy: no preload promise.
  if (/preload/.test(home.headers.get("strict-transport-security") ?? "")) throw new Error("HSTS preload outside production deploy");
});

await step("search lists seeded public athletes", async () => {
  await page.goto(`${base}/search`, { waitUntil: "networkidle" });
  await expectText("Jordan Reyes");
  await expectText("Ava Reyes");
});

await step("search filters by sport via the URL", async () => {
  await page.goto(`${base}/search?sport=soccer`, { waitUntil: "networkidle" });
  await expectText("Nina Kowalczyk");
  if (await page.getByText("Jordan Reyes").first().isVisible().catch(() => false)) {
    throw new Error("football athlete shown under sport=soccer");
  }
});

await step("public resume renders with verified entries", async () => {
  await page.goto(`${base}/jordanreyes`, { waitUntil: "networkidle" });
  await expectText("Jordan Reyes");
  await expectText("40-yard dash");
});

await step("unlisted resume opens by link but is not searchable", async () => {
  await page.goto(`${base}/elijahbrooks`, { waitUntil: "networkidle" });
  await expectText("Elijah Brooks");
  await page.goto(`${base}/search?q=Elijah`, { waitUntil: "networkidle" });
  if (await page.getByText("Elijah Brooks").first().isVisible().catch(() => false)) {
    throw new Error("unlisted athlete appeared in search");
  }
});

await step("private resume is not found", async () => {
  const response = await page.goto(`${base}/graceokoro`, { waitUntil: "networkidle" });
  if (response.status() !== 404) throw new Error(`expected 404, got ${response.status()}`);
});

await step("editor redirects signed-out visitors to sign-in", async () => {
  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  if (!page.url().includes("/sign-in")) throw new Error("no redirect");
  if (!page.url().includes("next=%2Fresume") && !page.url().includes("next=/resume")) throw new Error("next param missing");
});

await step("sign in as a seeded athlete lands in the editor", async () => {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("jordanreyes@roster.local");
  await page.getByLabel("Password").fill("roster-demo");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/resume$/, { timeout: 15_000 });
  await expectText("Jordan Reyes");
});

await step("a hostile next= never leaves the site", async () => {
  // Signed in, /sign-in bounces straight to `next` — the sharpest edge.
  for (const next of ["/%5Cevil.com", "//evil.com", "/%09/evil.com", "https://evil.com"]) {
    await page.goto(`${base}/sign-in?next=${next}`, { waitUntil: "networkidle" });
    const landed = new URL(page.url());
    if (landed.origin !== new URL(base).origin) throw new Error(`next=${next} redirected to ${landed.origin}`);
  }
});

await step("adding an entry persists and shows on the public resume", async () => {
  const title = `Smoke entry ${stamp}`;
  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  // The add form is the one entry form without a hidden id (edit forms carry one).
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="achieved_on"]') })
    .filter({ hasNot: page.locator('input[name="id"]') })
    .first();
  await form.locator('input[name="title"]').fill(title);
  await form.locator('input[name="achieved_on"]').fill("2026-06-01");
  await form.locator('input[name="value_display"]').fill("11.11");
  await form.locator('button[type="submit"]').click();
  // The action round-trips through the server; wait for its own verdict
  // rather than a timer, and surface a validation error verbatim.
  const notice = form.locator('[role="status"], [role="alert"]').first();
  await notice.waitFor({ state: "visible", timeout: 20_000 });
  const verdict = (await notice.textContent())?.trim() ?? "";
  if (!/^Saved/.test(verdict)) throw new Error(`form said: ${verdict}`);
  await page.goto(`${base}/jordanreyes`, { waitUntil: "networkidle" });
  await expectText(title);
});

await step("editor shows the live preview and creates a verification link", async () => {
  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  await expectText("Live preview");
  await expectText("views this week");
  await shot("editor");
  // Request verification on the smoke entry itself, so the later steps can
  // edit it without disturbing the seeded record.
  const row = page.locator("li").filter({ hasText: `Smoke entry ${stamp}` }).first();
  const summary = row.locator("summary", { hasText: "Request verification" }).first();
  await summary.click();
  const panel = summary.locator("xpath=ancestor::details[1]");
  await panel.getByRole("button", { name: /create request link/i }).click();
  // After the action the row re-renders as "submitted" and shows the link
  // from server data, outside the disclosure.
  const code = page.locator("li").filter({ hasText: `Smoke entry ${stamp}` }).locator("code", { hasText: "/verify/" }).first();
  await code.waitFor({ timeout: 20_000 });
  // The link is absolute (NEXT_PUBLIC_SITE_URL); visit its path on this server.
  const text = (await code.textContent())?.trim() ?? "";
  const path = text ? new URL(text, base).pathname : "";
  if (!path.startsWith("/verify/")) throw new Error(`no link: ${text}`);
  globalThis.__verifyPath = path;
  await shot("editor-request");
});

await step("the athlete cannot verify their own entry", async () => {
  await page.goto(`${base}${globalThis.__verifyPath}`, { waitUntil: "networkidle" });
  await expectText("can’t verify itself");
});

await step("sign out clears the session", async () => {
  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  if (!page.url().includes("/sign-in")) throw new Error("still signed in");
});

await step("a coach verifies by link with no account; the mark and name appear", async () => {
  await context.clearCookies();
  await page.goto(`${base}${globalThis.__verifyPath}`, { waitUntil: "networkidle" });
  await expectText("says this happened");
  await shot("verify");
  await page.getByLabel("Note", { exact: false }).fill("Timed it myself at the spring combine.");
  await page.getByRole("button", { name: /yes, i verify/i }).click();
  await page.getByText("Verified. Thank you.").waitFor({ timeout: 20_000 });
  await shot("verify-done");
  // Single use: a revisit shows the answered state, never the form.
  await page.goto(`${base}${globalThis.__verifyPath}`, { waitUntil: "networkidle" });
  await expectText("Each link works once.");
  if (await page.getByRole("button", { name: /yes, i verify/i }).isVisible().catch(() => false)) {
    throw new Error("form still offered after answering");
  }
  // The public resume now carries the coach's name on the entry.
  await page.goto(`${base}/jordanreyes`, { waitUntil: "networkidle" });
  const row = page.locator("li").filter({ hasText: `Smoke entry ${stamp}` }).first();
  await row.getByText("Verified by Tom Bradley").waitFor({ timeout: 10_000 });
});

/*
 * Signed out, a verify link cannot tell the athlete from the coach: the link
 * is a bearer token, and by design whoever holds it answers as the coach the
 * athlete named. What keeps that honest is everything around it, asserted
 * here so a regression fails loudly: the response is attributed to the named
 * contact (never a name the respondent types), the link is single-use, and
 * — next step — any later edit to the entry throws the badge away.
 */
await step("signed out, a verify link answers only as the named coach, once", async () => {
  await context.clearCookies();
  await page.goto(`${base}${globalThis.__verifyPath}`, { waitUntil: "networkidle" });
  await expectText("Each link works once.");
  if (await page.locator('input[name="verifier_name"], input[name="name"]').count()) {
    throw new Error("respondent can type the verifier's name");
  }
});

await step("editing a verified entry clears its badge", async () => {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("jordanreyes@roster.local");
  await page.getByLabel("Password").fill("roster-demo");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/resume$/, { timeout: 15_000 });

  const row = page.locator("li").filter({ hasText: `Smoke entry ${stamp}` }).first();
  await row.locator("summary", { hasText: "Edit" }).click();
  const form = row.locator("form").filter({ has: page.locator('input[name="value_display"]') }).first();
  await form.locator('input[name="value_display"]').fill("10.01");
  await form.getByRole("button", { name: /save entry/i }).click();
  const notice = form.locator('[role="status"], [role="alert"]').first();
  await notice.waitFor({ state: "visible", timeout: 20_000 });
  const verdict = (await notice.textContent())?.trim() ?? "";
  if (!/^Saved/.test(verdict)) throw new Error(`form said: ${verdict}`);

  await page.goto(`${base}/jordanreyes`, { waitUntil: "networkidle" });
  const publicRow = page.locator("li").filter({ hasText: `Smoke entry ${stamp}` }).first();
  await publicRow.getByText("Self-reported").first().waitFor({ timeout: 10_000 });
  if (await publicRow.getByText("Verified by").count()) throw new Error("badge survived an edit to the measured value");

  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /sign out/i }).first().click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
});

await step("a recruiter manages lists: create, save from search, open, remove", async () => {
  await context.clearCookies();
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("recruiter@roster.local");
  await page.getByLabel("Password").fill("roster-demo");
  await page.getByRole("button", { name: /sign in/i }).click();
  // A recruiter lands on their lists, not the athlete editor.
  await page.waitForURL(/\/lists$/, { timeout: 15_000 });
  await expectText("Class of 2027 receivers");
  const listName = `Smoke list ${stamp}`;
  await page.locator('input[name="name"]').fill(listName);
  await page.getByRole("button", { name: /create list/i }).click();
  await page.getByRole("link", { name: listName }).waitFor({ timeout: 15_000 });
  await shot("lists");

  // Save Nina from search into the new list, then see her on the list page.
  await page.goto(`${base}/search?sport=soccer`, { waitUntil: "networkidle" });
  const row = page.locator("li").filter({ hasText: "Nina Kowalczyk" }).first();
  await row.getByRole("combobox", { name: "List" }).selectOption({ label: listName });
  await row.getByRole("button", { name: /^save$/i }).click();
  await row.getByText(`In ${listName}`).waitFor({ timeout: 15_000 });

  await page.goto(`${base}/lists`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: listName }).click();
  await page.waitForURL(/\/lists\/[^/]+$/, { timeout: 15_000 });
  await expectText("Nina Kowalczyk");
  await shot("list");
  await page.getByRole("button", { name: /^remove$/i }).first().click();
  await page.getByText("Nobody here yet").waitFor({ timeout: 15_000 });
});

await step("settings: wrong current password is refused, sign out works", async () => {
  await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
  await expectText("recruiter@roster.local");
  await shot("settings");
  await page.locator('input[name="current"]').fill("not-the-password");
  await page.locator('input[name="next"]').fill("password123");
  await page.locator('input[name="confirm"]').fill("password123");
  await page.getByRole("button", { name: /update password/i }).click();
  await page.getByText("did not match").waitFor({ timeout: 15_000 });
  // Header and the Session section both offer it; use the page's own.
  await page.locator("main").getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
});

await step("sign up → three-step onboarding → editor", async () => {
  await page.goto(`${base}/sign-up`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(`smoke-${stamp}@roster.local`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/onboarding$/, { timeout: 15_000 });

  // 01 — a taken handle is refused live, a free one is confirmed live.
  const handle = page.getByLabel("Handle", { exact: false });
  await handle.fill("jordanreyes");
  await page.getByText("That handle is taken.").waitFor({ timeout: 10_000 });
  await handle.fill(`smoke_${stamp}`);
  await page.getByText("is yours.").waitFor({ timeout: 10_000 });
  await shot("onboarding-01");
  await page.getByRole("button", { name: /continue/i }).click();

  // 02 — identity
  await page.getByLabel("Your name").fill("Smoke Tester");
  await page.getByLabel("Class of").fill("2028");
  // No sport is assumed; Continue waits for a choice.
  await page.getByLabel("Sport").selectOption("football");
  await shot("onboarding-02");
  await page.getByRole("button", { name: /continue/i }).click();

  // 03 — visibility, then submit
  // The radio input is visually hidden; click the label like a person would.
  await page.getByText("Unlisted", { exact: true }).click();
  await shot("onboarding-03");
  await page.getByRole("button", { name: /create my resume/i }).click();
  await page.waitForURL(/\/resume$/, { timeout: 15_000 });
  await expectText("Smoke Tester");
  await expectText("Unlisted");
});

await step("reserved handle is refused before submit", async () => {
  await context.clearCookies();
  await page.goto(`${base}/sign-up`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(`smoke2-${stamp}@roster.local`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/onboarding$/, { timeout: 15_000 });
  await page.getByLabel("Handle", { exact: false }).fill("settings");
  await page.getByText("Some words are reserved.").waitFor({ timeout: 10_000 });
  const isDisabled = await page.getByRole("button", { name: /continue/i }).isDisabled();
  if (!isDisabled) throw new Error("Continue should be disabled for a reserved handle");
});

await step("changing the password signs out every other session", async () => {
  // Two devices signed in as the account created above.
  const email = `smoke-${stamp}@roster.local`;
  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const mine = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    for (const ctx of [other, mine]) {
      const p = await ctx.newPage();
      await p.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
      await p.getByLabel("Email").fill(email);
      await p.getByLabel("Password").fill("password123");
      await p.getByRole("button", { name: /sign in/i }).click();
      await p.waitForURL(/\/(resume|onboarding)$/, { timeout: 15_000 });
      await p.close();
    }
    const p = await mine.newPage();
    await p.goto(`${base}/settings`, { waitUntil: "networkidle" });
    await p.locator('input[name="current"]').fill("password123");
    await p.locator('input[name="next"]').fill("password456");
    await p.locator('input[name="confirm"]').fill("password456");
    await p.getByRole("button", { name: /update password/i }).click();
    await p.waitForLoadState("networkidle");
    await p.waitForTimeout(500);

    // This device keeps its session…
    await p.goto(`${base}/settings`, { waitUntil: "networkidle" });
    if (p.url().includes("/sign-in")) throw new Error("the device that changed the password was signed out");
    // …the other one does not, though its cookie still carries a valid signature.
    const q = await other.newPage();
    await q.goto(`${base}/settings`, { waitUntil: "networkidle" });
    if (!q.url().includes("/sign-in")) throw new Error("other session survived the password change");
  } finally {
    await other.close();
    await mine.close();
  }
});

await step("no Content-Security-Policy violations on any page visited", async () => {
  if (cspViolations.length) throw new Error(`${cspViolations.length} violation(s): ${cspViolations[0]}`);
});

await browser.close();
process.stdout.write(failures ? `\n${failures} step(s) failed\n` : "\nall steps passed\n");
process.exit(failures ? 1 : 0);
