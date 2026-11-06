/**
 * Visual check across breakpoints.
 *
 * Screenshots a route at the widths the design is actually built for and
 * reports horizontal overflow at each — the failure that is invisible in a
 * desktop browser and immediately obvious on somebody's phone.
 *
 * Usage:
 *   node scripts/shots.mjs [route] [--section=film] [--base=url] [--out=dir] [--dark]
 *
 * `--section` opens one editor section through its `?section=` query param,
 * the same URL the editor's own navigation uses (`--tab` is accepted as an
 * old alias). The server is `--base`, else `BASE_URL`, else
 * `http://localhost:$PORT` (PORT defaults to 3000).
 *
 * Requires a running server and the Playwright browser cache that
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
const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const route = args.find((arg) => !arg.startsWith("--")) ?? "/preview";
const section = flag("section") ?? flag("tab");
const outDir = flag("out") ?? "./.shots";
const base = (flag("base") ?? process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");

const target = new URL(route, base);
if (section) target.searchParams.set("section", section);
const colorScheme = args.includes("--dark") ? "dark" : "light";

const browser = await chromium.launch({ channel: "chromium" });
await mkdir(outDir, { recursive: true });

for (const { name, width, height } of BREAKPOINTS) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme });
  await page.goto(target.href, { waitUntil: "networkidle" });

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

  const suffix = `${section ? `-${section}` : ""}${colorScheme === "dark" ? "-dark" : ""}`;
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
