/**
 * Visual check across breakpoints.
 *
 * Screenshots a route at the widths the design is actually built for and
 * reports horizontal overflow at each — the failure that is invisible in a
 * desktop browser and immediately obvious on somebody's phone.
 *
 * Usage:
 *   node scripts/shots.mjs [route] [--tab=film] [--out=dir]
 *
 * Requires a dev server on :3000 and the Playwright browser cache that
 * `npx playwright install chromium` populates.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright-core";

const BREAKPOINTS = [
  { name: "mobile", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
];

const args = process.argv.slice(2);
const route = args.find((arg) => !arg.startsWith("--")) ?? "/preview";
const tab = args.find((arg) => arg.startsWith("--tab="))?.split("=")[1];
const outDir = args.find((arg) => arg.startsWith("--out="))?.split("=")[1] ?? "./.shots";

const browser = await chromium.launch({ channel: "chromium" });
await mkdir(outDir, { recursive: true });

for (const { name, width, height } of BREAKPOINTS) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`http://localhost:3000${route}`, { waitUntil: "networkidle" });

  if (tab) {
    await page.getByRole("tab", { name: new RegExp(tab, "i") }).click();
    await page.waitForTimeout(400);
  }

  // Next's dev-mode indicator floats over the bottom-left corner, which is
  // exactly where the rail's footer sits. Hide it so shots show the design.
  await page.addStyleTag({
    content: "nextjs-portal, [data-nextjs-toast] { display: none !important; }",
  });

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [...document.querySelectorAll("*")]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .slice(0, 5)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} → right:${Math.round(rect.right)}`;
      });

    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
  });

  const suffix = tab ? `-${tab}` : "";
  await page.screenshot({ path: path.join(outDir, `${name}${suffix}.png`) });

  const isOverflowing = overflow.scrollWidth > overflow.clientWidth;
  console.log(
    `${name} ${width}×${height}  ${isOverflowing ? "OVERFLOW" : "ok"}  ` +
      `scroll=${overflow.scrollWidth} client=${overflow.clientWidth}`,
  );
  if (isOverflowing) {
    for (const offender of overflow.offenders) console.log(`    ${offender}`);
  }

  await page.close();
}

await browser.close();
