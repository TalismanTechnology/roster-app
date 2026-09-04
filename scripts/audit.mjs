/**
 * Cross-breakpoint audit of every route.
 *
 * For each route at 320 / 375 / 768 / 1024 / 1440: horizontal overflow,
 * console errors, and the accessibility checks a linter can do without a
 * human — images without alt, buttons and links without a name, form
 * controls without a label, a missing h1, skipped heading levels. Signed-in
 * routes run under the seeded athlete or recruiter. Writes screenshots to
 * .shots/audit/ and exits non-zero on any finding.
 *
 * Usage:  node scripts/audit.mjs [--base=http://localhost:3000]
 */

import { mkdir } from "node:fs/promises";

import { chromium } from "playwright-core";

const base = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1] ?? "http://localhost:3000";
const WIDTHS = [320, 375, 768, 1024, 1440];

const ROUTES = [
  { path: "/", as: null },
  { path: "/search", as: null },
  { path: "/search?sport=football&state=TX", as: null },
  { path: "/jordanreyes", as: null },
  { path: "/avareyes", as: null },
  { path: "/preview", as: null },
  { path: "/sign-in", as: null },
  { path: "/sign-up", as: null },
  { path: "/nobody-here", as: null, expectStatus: 404 },
  { path: "/resume", as: "athlete" },
  { path: "/settings", as: "athlete" },
  { path: "/lists", as: "recruiter" },
  { path: "/search?sport=soccer", as: "recruiter" },
];

const ACCOUNTS = {
  athlete: ["jordanreyes@roster.local", "roster-demo"],
  recruiter: ["recruiter@roster.local", "roster-demo"],
};

const browser = await chromium.launch({ channel: "chromium" });
await mkdir(".shots/audit", { recursive: true });

const findings = [];

async function signedInContext(as) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (as) {
    const page = await context.newPage();
    await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(ACCOUNTS[as][0]);
    await page.getByLabel("Password").fill(ACCOUNTS[as][1]);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(resume|lists|onboarding)/, { timeout: 15_000 });
    await page.close();
  }
  return context;
}

for (const route of ROUTES) {
  const context = await signedInContext(route.as);
  for (const width of WIDTHS) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
    page.on("console", (m) => {
      if (m.type() !== "error" || /favicon/.test(m.text())) return;
      // A route that is supposed to 404 logs its own status; that's not a finding.
      if (route.expectStatus === 404 && /status of 404/.test(m.text())) return;
      errors.push(m.text().slice(0, 160));
    });

    const response = await page.goto(`${base}${route.path}`, { waitUntil: "networkidle" });
    const status = response?.status();
    if (route.expectStatus && status !== route.expectStatus) findings.push(`${route.path}@${width}: status ${status}, expected ${route.expectStatus}`);
    if (!route.expectStatus && status !== 200) findings.push(`${route.path}@${width}: status ${status}`);

    await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast] { display: none !important; }" });
    await page.waitForTimeout(300);

    const report = await page.evaluate(() => {
      const doc = document.documentElement;
      const issues = [];
      if (doc.scrollWidth > doc.clientWidth + 1) issues.push(`overflow ${doc.scrollWidth}>${doc.clientWidth}`);

      for (const img of document.querySelectorAll("img")) {
        if (!img.hasAttribute("alt")) issues.push(`img without alt: ${img.getAttribute("src")?.slice(0, 40)}`);
      }
      const name = (el) =>
        (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim() ||
        (el.getAttribute("aria-labelledby") ? "labelledby" : "");
      for (const b of document.querySelectorAll("button, a[href]")) {
        if (!name(b) && !b.querySelector("img[alt]")) issues.push(`${b.tagName.toLowerCase()} without name`);
      }
      for (const f of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
        const id = f.getAttribute("id");
        const labelled =
          f.closest("label") || (id && document.querySelector(`label[for="${id}"]`)) || f.getAttribute("aria-label") || f.getAttribute("aria-labelledby");
        if (!labelled) issues.push(`unlabelled ${f.tagName.toLowerCase()}[name=${f.getAttribute("name")}]`);
      }
      const h1s = document.querySelectorAll("h1").length;
      if (h1s !== 1) issues.push(`${h1s} h1 elements`);
      let last = 0;
      for (const h of document.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
        const level = Number(h.tagName[1]);
        if (last && level > last + 1) issues.push(`heading skips h${last}→h${level}: "${h.textContent?.trim().slice(0, 30)}"`);
        last = level;
      }
      return issues;
    });

    for (const issue of report) findings.push(`${route.path}@${width}: ${issue}`);
    for (const e of errors) findings.push(`${route.path}@${width}: console: ${e}`);

    if (width === 320 || width === 1440) {
      const slug = route.path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
      await page.screenshot({ path: `.shots/audit/${slug}-${width}.png` });
    }
    process.stdout.write(`${report.length === 0 && errors.length === 0 ? "ok  " : "FAIL"} ${route.path} @${width}\n`);
    await page.close();
  }
  await context.close();
}

// Print media: the resume as a document.
{
  const context = await browser.newContext({ viewport: { width: 816, height: 1056 } });
  const page = await context.newPage();
  await page.emulateMedia({ media: "print" });
  await page.goto(`${base}/jordanreyes`, { waitUntil: "networkidle" });
  await page.screenshot({ path: ".shots/audit/print-jordanreyes.png", fullPage: true });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (!/255, 255, 255/.test(bg)) findings.push(`print: body background is ${bg}, expected white`);
  process.stdout.write(`${/255, 255, 255/.test(bg) ? "ok  " : "FAIL"} print /jordanreyes\n`);
  await context.close();
}

await browser.close();

if (findings.length) {
  process.stdout.write(`\n${findings.length} finding(s):\n${findings.map((f) => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("\nno findings\n");
