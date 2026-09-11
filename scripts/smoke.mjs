/**
 * Local-only product smoke. Uses disposable fictional accounts and content.
 * Start the app with ROSTER_DATA=local, then npm run e2e.
 * Optional: --base=http://127.0.0.1:3000 --shots=.shots/smoke
 * This CLI is for developer/CI use. In-app browser validation uses its supported
 * browser runtime instead; do not launch this CLI to control that browser.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = argument("base", "http://127.0.0.1:3000");
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname), "Smoke only supports a local server");
const shots = argument("shots", ".shots/smoke");
await mkdir(shots, { recursive: true });
const stamp = Date.now().toString(36);
const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const results = [];
const visible = async text => page.getByText(text, { exact: false }).first().waitFor({ state: "visible" });
const screenshot = name => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
const go = path => page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
const signOut = async () => {
  await go("/app");
  const button = page.getByRole("button", { name: "Sign out", exact: true });
  if (await button.isVisible()) {
    await button.click();
    await page.waitForURL(`${base}/`);
  }
};
const login = async (email, next = "/app") => {
  await go(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: false }).fill("roster-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${base}${next}`);
};
const signup = async (role, birth = "1990-01-01") => {
  await context.clearCookies();
  await go("/sign-up");
  await page.getByLabel("Email", { exact: true }).fill(`smoke-${role}-${stamp}@roster.local`);
  await page.getByLabel("Date of birth", { exact: false }).fill(birth);
  await page.getByLabel("Password", { exact: false }).fill("roster-demo");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Handle", { exact: false }).fill(`smoke_${role}_${stamp}`);
  await visible("is yours.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Account type").selectOption(role);
  await page.getByLabel("School or organization").fill("Fictional smoke academy");
  await page.getByLabel("Your name").fill(`Smoke ${role}`);
  if (role === "athlete") await page.getByLabel("Class of", { exact: false }).fill("2028");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Date of birth", { exact: false }).fill(birth);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: role === "athlete" ? "Create my resume" : "Create my profile", exact: true }).click();
  await page.waitForURL(`${base}/app`);
  await visible("Your next chapter");
};
const step = async (name, action) => {
  await action();
  results.push(name);
  process.stdout.write(`ok ${name}\n`);
};

try {
  await step("public search, sport filtering, and private visibility", async () => {
    await go("/search");
    await visible("Jordan Reyes");
    await go("/search?sport=soccer");
    await visible("Nina Kowalczyk");
    assert.equal(await page.getByRole("link", { name: "Jordan Reyes", exact: true }).count(), 0);
    const response = await go("/graceokoro");
    assert.equal(response.status(), 404);
  });
  await step("under-13 signup is refused", async () => {
    await go("/sign-up");
    await page.getByLabel("Email", { exact: true }).fill(`smoke-young-${stamp}@roster.local`);
    await page.getByLabel("Date of birth", { exact: false }).fill("2020-01-01");
    await page.getByLabel("Password", { exact: false }).fill("roster-demo");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "You must be at least 13" }).waitFor();
    assert.match(page.url(), /\/sign-up/);
  });
  await step("coach signup and role-specific workspace", async () => {
    await signup("coach");
    await page.getByRole("link", { name: "Coach workspace", exact: true }).waitFor();
  });
  await step("failed post retains editable draft; correction publishes", async () => {
    const body = `Smoke corrected post ${stamp}`;
    await page.getByText("Add a film link", { exact: true }).click();
    await page.getByLabel("What’s moving you forward?").fill(body);
    await page.getByLabel("YouTube, Vimeo, or Hudl URL").fill("https://example.com/unsupported");
    await page.getByRole("button", { name: "Publish post", exact: true }).click();
    await visible("Use a supported HTTPS film link.");
    assert.equal(await page.getByLabel("What’s moving you forward?").inputValue(), body);
    assert.equal(await page.getByLabel("YouTube, Vimeo, or Hudl URL").inputValue(), "https://example.com/unsupported");
    await page.getByLabel("YouTube, Vimeo, or Hudl URL").fill("");
    assert.equal(await page.getByLabel("YouTube, Vimeo, or Hudl URL").inputValue(), "");
    await page.getByRole("button", { name: "Publish post", exact: true }).click();
    await page.getByRole("article").filter({ hasText: body }).waitFor();
    assert.equal(await page.getByLabel("What’s moving you forward?").inputValue(), "");
    await screenshot("published-post");
  });
  await step("athlete signup and authenticated verification", async () => {
    await signup("athlete");
    await go("/resume?section=references");
    await page.getByLabel("Name", { exact: true }).fill("Smoke coach");
    await page.getByLabel("Role", { exact: true }).fill("Coach");
    await page.getByLabel("Email", { exact: true }).fill(`smoke-coach-${stamp}@roster.local`);
    await page.getByRole("button", { name: "Add reference", exact: true }).click();
    await visible("Smoke coach");
    await go("/resume?section=record");
    await page.getByLabel("Title", { exact: false }).fill(`Smoke verified claim ${stamp}`);
    await page.getByLabel("Date", { exact: true }).fill("2026-09-01");
    await page.getByRole("button", { name: "Add entry", exact: true }).click();
    await visible(`Smoke verified claim ${stamp}`);
    await page.getByText("Request verification", { exact: true }).click();
    await page.getByRole("button", { name: "Create request link", exact: true }).click();
    const code = page.locator("code").filter({ hasText: "/verify/" });
    await code.waitFor();
    const path = (await code.textContent()).trim();
    assert.match(path, /^\/verify\/[A-Za-z0-9_-]+$/);
    await go(path);
    await visible("You cannot verify your own record");
    await signOut();
    await go(path);
    await page.getByRole("link", { name: "Sign in to review", exact: true }).waitFor();
    await login(`smoke-coach-${stamp}@roster.local`, path);
    await page.getByRole("button", { name: "Yes, I verify this", exact: true }).click();
    await visible("already answered: verified");
    await page.reload();
    await visible("already answered: verified");
    assert.equal(await page.getByRole("button", { name: "Yes, I verify this", exact: true }).count(), 0);
    await screenshot("verification-complete");
  });
  await step("recruiter signup, saved list and private note", async () => {
    await signup("recruiter");
    await page.getByRole("link", { name: "Recruiting lists", exact: true }).click();
    const name = `Smoke list ${stamp}`;
    await page.getByLabel("Name", { exact: false }).fill(name);
    await page.getByRole("button", { name: "Create list", exact: true }).click();
    await page.getByRole("link", { name, exact: true }).waitFor();
    await go("/search?q=Nina");
    await page.getByRole("combobox", { name: "List", exact: true }).selectOption({ label: name });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await visible(`In ${name}`);
    await go("/lists");
    await page.getByRole("link", { name, exact: true }).click();
    await visible("Nina Kowalczyk");
    await page.getByText("Add private note", { exact: true }).click();
    const note = `Fictional scouting note ${stamp}`;
    await page.getByLabel("Your private scouting note", { exact: false }).fill(note);
    await page.getByRole("button", { name: "Save private note", exact: true }).click();
    await page.getByText("Edit your private note", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("Edit your private note", { exact: true }).click();
    assert.equal(await page.getByLabel("Your private scouting note", { exact: false }).inputValue(), note);
    await screenshot("private-note");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await visible("Nobody here yet");
  });
  await step("mobile feed fits viewport", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go("/app");
    await visible("Your next chapter");
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert(dimensions.scroll <= dimensions.width, "Horizontal overflow in mobile feed");
    await screenshot("mobile-feed");
  });
  process.stdout.write(`\n${results.length} journeys passed\n`);
} catch (error) {
  await screenshot("failure").catch(() => {});
  process.stderr.write(`FAIL after ${results.length} journeys at ${page.url()}\n${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
