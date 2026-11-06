/**
 * End-to-end smoke of the product loop against a dev server on :3000.
 *
 * Runs in local data mode against the seeded roster. Each step asserts the
 * thing a user would notice; a failure prints the step and the page URL.
 *
 * Usage:  node scripts/smoke.mjs [--base=http://localhost:3000]
 */

import { chromium } from "playwright-core";

const base = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ?? "http://localhost:3000";
const stamp = Date.now().toString(36);

const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

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
  // Open the first "Request verification" disclosure and create a link.
  const summary = page.locator("summary", { hasText: "Request verification" }).first();
  await summary.click();
  const panel = summary.locator("xpath=ancestor::details[1]");
  await panel.getByRole("button", { name: /create request link/i }).click();
  // After the action the row re-renders as "submitted" and shows the link
  // from server data, outside the disclosure.
  const code = page.locator("code", { hasText: "/verify/" }).first();
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
  await expectText("Verified by Tom Bradley");
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

await browser.close();
process.stdout.write(failures ? `\n${failures} step(s) failed\n` : "\nall steps passed\n");
process.exit(failures ? 1 : 0);
