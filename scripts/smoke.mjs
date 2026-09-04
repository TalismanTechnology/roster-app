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

const expectText = async (text) => {
  const found = await page.getByText(text, { exact: false }).first().isVisible().catch(() => false);
  if (!found) throw new Error(`expected to see "${text}"`);
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
  const form = page.locator("form").filter({ has: page.locator('input[name="achieved_on"]') }).first();
  await form.locator('input[name="title"]').fill(title);
  await form.locator('input[name="achieved_on"]').fill("2026-06-01");
  await form.locator('input[name="value_display"]').fill("11.11");
  await form.locator('button[type="submit"]').click();
  // The action round-trips through the server; wait for its own verdict
  // rather than a timer, and surface a validation error verbatim.
  const notice = form.locator('[role="status"], [role="alert"]').first();
  await notice.waitFor({ state: "visible", timeout: 20_000 });
  const verdict = (await notice.textContent())?.trim() ?? "";
  if (verdict !== "Saved.") throw new Error(`form said: ${verdict}`);
  await page.goto(`${base}/jordanreyes`, { waitUntil: "networkidle" });
  await expectText(title);
});

await step("sign out clears the session", async () => {
  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  if (!page.url().includes("/sign-in")) throw new Error("still signed in");
});

const shotsDir = process.argv.find((a) => a.startsWith("--shots="))?.split("=")[1];
const shot = async (name) => {
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png` });
};

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
