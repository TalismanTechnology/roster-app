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

import { readFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

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

await step("an unknown verify link explains itself instead of a bare 404", async () => {
  await page.goto(`${base}/verify/not-a-real-token`, { waitUntil: "networkidle" });
  await expectText("This link doesn’t work.");
  await expectText("Nothing was recorded.");
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

await step("public resume: share card, Twitter card, and ProfilePage JSON-LD", async () => {
  const html = await (await fetch(`${base}/jordanreyes`)).text();
  const meta = (attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]+)"`))?.[1] ?? null;
  const ogImage = meta("property", "og:image");
  if (!ogImage || !/^https?:\/\/[^/]+\/jordanreyes\/opengraph-image/.test(ogImage)) throw new Error(`og:image is ${ogImage}`);
  if (meta("name", "twitter:card") !== "summary_large_image") throw new Error(`twitter:card is ${meta("name", "twitter:card")}`);
  if (!meta("name", "twitter:image")) throw new Error("no twitter:image");
  const ld = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/)?.[1];
  const data = ld ? JSON.parse(ld) : null;
  if (data?.["@type"] !== "ProfilePage" || data.mainEntity?.name !== "Jordan Reyes") throw new Error(`JSON-LD: ${ld}`);

  const card = await fetch(`${base}${new URL(ogImage).pathname}${new URL(ogImage).search}`);
  if (!card.ok || card.headers.get("content-type") !== "image/png") throw new Error(`card: ${card.status} ${card.headers.get("content-type")}`);
  if ((await card.arrayBuffer()).byteLength < 5000) throw new Error("card is suspiciously small");
  if ((await fetch(`${base}/graceokoro/opengraph-image`)).status !== 404) throw new Error("a private resume has a share card");
});

await step("public resume explains verification; the printout carries a QR and an as-of date", async () => {
  await page.goto(`${base}/jordanreyes`, { waitUntil: "networkidle" });
  await expectText("How verification works");
  await page.locator("li").filter({ hasText: "Verified by" }).first().locator("time").first().waitFor({ timeout: 10_000 });
  const colophon = page.locator('aside[aria-label="Printed record"]');
  if (await colophon.isVisible()) throw new Error("print colophon shows on screen");
  await page.emulateMedia({ media: "print" });
  try {
    await colophon.waitFor({ state: "visible", timeout: 5_000 });
    if (!/Verified as of/.test((await colophon.textContent()) ?? "")) throw new Error("no as-of line");
    const qr = colophon.locator('svg[role="img"][aria-label*="/jordanreyes"] path');
    if ((await qr.getAttribute("d"))?.length < 200) throw new Error("QR path missing");
  } finally {
    await page.emulateMedia({ media: null });
  }
});

await step("sitemap is sharded, robots lists the shards, unlisted stays out", async () => {
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  const shard = robots.match(/Sitemap: (\S+\/sitemap\/0\.xml)/)?.[1];
  if (!shard) throw new Error(`robots.txt lists no shard:\n${robots}`);
  const xml = await (await fetch(`${base}${new URL(shard).pathname}`)).text();
  if (!xml.includes("/jordanreyes</loc>")) throw new Error("public athlete missing from sitemap");
  if (xml.includes("/elijahbrooks<")) throw new Error("unlisted athlete in sitemap");
});

await step("unlisted resume opens by link but is not searchable", async () => {
  await page.goto(`${base}/elijahbrooks`, { waitUntil: "networkidle" });
  await expectText("Elijah Brooks");
  await page.goto(`${base}/search?q=Elijah`, { waitUntil: "networkidle" });
  if (await page.getByText("Elijah Brooks").first().isVisible().catch(() => false)) {
    throw new Error("unlisted athlete appeared in search");
  }
});

await step("unlisted resume is X-Robots-Tag noindex and carries no JSON-LD", async () => {
  const unlisted = await fetch(`${base}/elijahbrooks`);
  if (unlisted.headers.get("x-robots-tag") !== "noindex, noarchive") throw new Error(`X-Robots-Tag: ${unlisted.headers.get("x-robots-tag")}`);
  if ((await unlisted.text()).includes("application/ld+json")) throw new Error("unlisted resume emits structured data");
  const listed = await fetch(`${base}/jordanreyes`);
  if (listed.headers.get("x-robots-tag")) throw new Error(`public resume has X-Robots-Tag ${listed.headers.get("x-robots-tag")}`);
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

/** A solid-colour PNG, built by hand so the smoke needs no image library. */
function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await step("an athlete uploads a photo: resized in the browser, shown on the resume and the card", async () => {
  await page.goto(`${base}/resume?section=identity`, { waitUntil: "networkidle" });
  await page.locator('input[type="file"][name="avatar"]').setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: png(900, 600, [200, 40, 40]),
  });
  const notice = page.locator("#identity").locator('[role="status"], [role="alert"]').first();
  await notice.waitFor({ state: "visible", timeout: 20_000 });
  const verdict = (await notice.textContent())?.trim() ?? "";
  if (!/^Saved/.test(verdict)) throw new Error(`upload said: ${verdict}`);
  await page.getByRole("img", { name: "Photo of Jordan Reyes" }).first().waitFor({ timeout: 10_000 });

  await page.goto(`${base}/jordanreyes`, { waitUntil: "networkidle" });
  const img = page.getByRole("img", { name: "Photo of Jordan Reyes" }).first();
  await img.waitFor({ timeout: 10_000 });
  const src = await img.getAttribute("src");
  if (!src?.startsWith("/media/avatars/")) throw new Error(`avatar src ${src}`);
  const file = await fetch(`${base}${src}`);
  if (file.headers.get("content-type") !== "image/jpeg") throw new Error(`stored as ${file.headers.get("content-type")}`);
  // Cropped square and scaled down on the client: a 900×600 PNG arrives as a 512² JPEG.
  const { width, height } = await img.evaluate((el) => ({ width: el.naturalWidth, height: el.naturalHeight }));
  if (width !== height || width > 512) throw new Error(`stored avatar is ${width}×${height}`);
  const html = await (await fetch(`${base}/jordanreyes`)).text();
  if (!/"image":"https?:\/\/[^"]+\/media\/avatars\//.test(html)) throw new Error("JSON-LD has no image");
});

await step("a hostile next= never leaves the site", async () => {
  // Signed in, /sign-in bounces straight to `next` — the sharpest edge.
  for (const next of ["/%5Cevil.com", "//evil.com", "/%09/evil.com", "https://evil.com"]) {
    await page.goto(`${base}/sign-in?next=${next}`, { waitUntil: "networkidle" });
    const landed = new URL(page.url());
    if (landed.origin !== new URL(base).origin) throw new Error(`next=${next} redirected to ${landed.origin}`);
  }
});

/** The editor's add-entry form, filled and saved. */
async function addEntry(title, value) {
  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="achieved_on"]') })
    .filter({ hasNot: page.locator('input[name="id"]') })
    .first();
  await form.locator('input[name="title"]').fill(title);
  await form.locator('input[name="achieved_on"]').fill("2026-06-01");
  await form.locator('input[name="value_display"]').fill(value);
  await form.locator('button[type="submit"]').click();
  const notice = form.locator('[role="status"], [role="alert"]').first();
  await notice.waitFor({ state: "visible", timeout: 20_000 });
  const verdict = (await notice.textContent())?.trim() ?? "";
  if (!/^Saved/.test(verdict)) throw new Error(`form said: ${verdict}`);
}

/** Opens the row's request form (labelled `summaryText`), creates a link, returns its path. */
async function requestLink(title, summaryText = "Request verification") {
  const row = page.locator("li").filter({ hasText: title }).first();
  const summary = row.locator("summary", { hasText: summaryText }).first();
  await summary.click();
  const panel = summary.locator("xpath=ancestor::details[1]");
  await panel.getByRole("button", { name: /create request link/i }).click();
  // The one moment the link exists: the action's result, on the row.
  const code = page.locator("li").filter({ hasText: title }).locator("code", { hasText: "/verify/" }).first();
  await code.waitFor({ timeout: 20_000 });
  const text = (await code.textContent())?.trim() ?? "";
  const linkPath = text ? new URL(text, base).pathname : "";
  if (!linkPath.startsWith("/verify/")) throw new Error(`no link: ${text}`);
  return linkPath;
}

/** Messages the server wrote instead of sending (no RESEND_API_KEY in tests). */
function outbox() {
  if (!dataDir) return null;
  try {
    return JSON.parse(readFileSync(path.join(dataDir, "email-outbox.json"), "utf8"));
  } catch {
    return [];
  }
}

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
  globalThis.__verifyPath = await requestLink(`Smoke entry ${stamp}`);
  await shot("editor-request");
});

await step("the coach is emailed the link; the link is never shown again", async () => {
  const messages = outbox();
  if (messages) {
    const sent = messages.find((m) => m.tag === "verification_request" && m.text.includes(globalThis.__verifyPath));
    if (!sent) throw new Error(`no outbox email carries ${globalThis.__verifyPath}`);
    if (sent.to !== "tbradley@example.org") throw new Error(`emailed ${sent.to}`);
  }
  // Only the hash is stored: a fresh visit says "waiting", never the link.
  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  const row = page.locator("li").filter({ hasText: `Smoke entry ${stamp}` }).first();
  await row.getByText("Waiting on").waitFor({ timeout: 10_000 });
  if (await row.locator("code", { hasText: "/verify/" }).count()) throw new Error("stored link replayed after reload");
});

await step("a second entry to the same coach joins the coach's batch", async () => {
  await addEntry(`Batch entry ${stamp}`, "22.22");
  globalThis.__batchPath = await requestLink(`Batch entry ${stamp}`);
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
  await expectText("Also waiting on you");
  await shot("verify");
  const main = page.locator('form:has(input[name="token"]):not(:has(input[name="request_id"]))');
  // #78: no verifying without the attestation.
  if (!(await main.getByRole("button", { name: /yes, i verify/i }).isDisabled())) {
    throw new Error("Verify enabled before the attestation was ticked");
  }
  await main.getByLabel("Note", { exact: false }).fill("Timed it myself at the spring combine.");
  await main.getByLabel(/I coached or saw/).check();
  await main.getByRole("button", { name: /yes, i verify/i }).click();
  await page.getByText("Verified. Thank you.").waitFor({ timeout: 20_000 });
  await shot("verify-done");

  // #81: the other entry, answered from the same page with the same link.
  const batch = page.locator('section[aria-labelledby="batch-heading"]');
  await batch.getByText(`Batch entry ${stamp}`).first().waitFor({ timeout: 10_000 });
  await batch.getByRole("button", { name: /this isn.t right/i }).click();
  await batch.getByText("Recorded as disputed.").waitFor({ timeout: 20_000 });

  // #80: the athlete hears both answers.
  const messages = outbox();
  if (messages) {
    const answered = messages.filter((m) => m.tag === "verification_answered" && m.to === "jordanreyes@example.com");
    if (answered.length < 2) throw new Error(`expected 2 answer emails to the athlete, saw ${answered.length}`);
  }
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

await step("a disputed entry offers fix & request again; revoke closes the new link", async () => {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("jordanreyes@roster.local");
  await page.getByLabel("Password").fill("roster-demo");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/resume$/, { timeout: 15_000 });

  const title = `Batch entry ${stamp}`;
  const row = page.locator("li").filter({ hasText: title }).first();
  await row.getByText("says this isn’t right").waitFor({ timeout: 10_000 });
  const again = await requestLink(title, "Request again");

  await page.goto(`${base}/resume`, { waitUntil: "networkidle" });
  const fresh = page.locator("li").filter({ hasText: title }).first();
  await fresh.getByRole("button", { name: /^revoke$/i }).click();
  await fresh.locator("summary", { hasText: "Request verification" }).waitFor({ timeout: 15_000 });

  await page.getByRole("button", { name: /sign out/i }).first().click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
  await context.clearCookies();
  await page.goto(`${base}${again}`, { waitUntil: "networkidle" });
  await expectText("This link has expired.");
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

  // Rename in place; the heading follows.
  await page.locator("summary", { hasText: "Rename list" }).click();
  await page.locator('input[name="name"]').fill(`${listName} renamed`);
  await page.getByRole("button", { name: /save name/i }).click();
  await page.getByRole("heading", { name: `${listName} renamed` }).waitFor({ timeout: 15_000 });
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

await step("forgot password: one answer for any email; the emailed link resets once", async () => {
  const email = `smoke-${stamp}@roster.local`;
  await context.clearCookies();
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /forgot password/i }).click();
  await page.waitForURL(/\/forgot-password$/, { timeout: 15_000 });

  // The answer must not depend on whether the account exists.
  const answerFor = async (address) => {
    await page.goto(`${base}/forgot-password`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(address);
    await page.getByRole("button", { name: /send reset link/i }).click();
    const status = page.locator('[role="status"]').filter({ hasText: "Check your email." });
    await status.waitFor({ timeout: 15_000 });
    return ((await status.textContent()) ?? "").replace(address, "<email>");
  };
  const unknown = await answerFor(`nobody-${stamp}@roster.local`);
  const known = await answerFor(email);
  if (unknown !== known) throw new Error(`reset answer differs for an unknown email: "${unknown}" vs "${known}"`);

  const messages = outbox();
  if (!messages) return; // --base= run: no outbox to read
  if (messages.some((m) => m.tag === "password_reset" && m.to === `nobody-${stamp}@roster.local`)) {
    throw new Error("a reset email went to an address with no account");
  }
  const mail = messages.filter((m) => m.tag === "password_reset" && m.to === email).at(-1);
  const link = mail?.text.match(/https?:\/\/\S+\/reset-password\?token=\S+/)?.[0];
  if (!link) throw new Error(`no reset link emailed to ${email}`);
  const resetPath = `${new URL(link).pathname}${new URL(link).search}`;

  const reset = await fetch(`${base}${resetPath}`);
  if (reset.headers.get("referrer-policy") !== "no-referrer") throw new Error("reset page leaks its token in a Referer");

  await page.goto(`${base}${resetPath}`, { waitUntil: "networkidle" });
  await page.locator('input[name="password"]').fill("password789");
  await page.locator('input[name="confirm"]').fill("password789");
  await page.getByRole("button", { name: /set new password/i }).click();
  await page.waitForURL(/\/settings\?password=reset$/, { timeout: 15_000 });
  await expectText("Password reset");

  // Single use.
  await page.locator("main").getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
  await page.goto(`${base}${resetPath}`, { waitUntil: "networkidle" });
  await expectText("Link expired.");

  // The old password is gone; the new one works.
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password456");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expectText("did not work");
  await page.getByLabel("Password").fill("password789");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/resume$/, { timeout: 15_000 });
});

await step("deleting the account removes it and signs out", async () => {
  await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
  await page.locator('input[name="confirm_handle"]').fill(`smoke_${stamp}`);
  await page.getByRole("button", { name: /delete my account/i }).click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
  const gone = await page.goto(`${base}/smoke_${stamp}`, { waitUntil: "networkidle" });
  if (gone.status() !== 404) throw new Error(`deleted resume still serves ${gone.status()}`);
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(`smoke-${stamp}@roster.local`);
  await page.getByLabel("Password").fill("password789");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expectText("did not work");
});

await step("no Content-Security-Policy violations on any page visited", async () => {
  if (cspViolations.length) throw new Error(`${cspViolations.length} violation(s): ${cspViolations[0]}`);
});

await browser.close();
process.stdout.write(failures ? `\n${failures} step(s) failed\n` : "\nall steps passed\n");
process.exit(failures ? 1 : 0);
