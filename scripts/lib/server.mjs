/**
 * A throwaway `next start` for the browser scripts: a free port, a temp
 * ROSTER_DATA_DIR seeded on first request, local data mode, and teardown of
 * both on exit — pass, fail, or Ctrl-C. Needs a production build.
 *
 * `serverFromArgs()` honours `--base=` so a script can still be pointed at a
 * server someone started by hand.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

export async function startIsolatedServer({ label = "roster" } = {}) {
  if (!existsSync(".next/BUILD_ID")) {
    process.stderr.write("No production build. Run `npm run build` first, or pass --base=.\n");
    process.exit(2);
  }

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const dataDir = mkdtempSync(path.join(tmpdir(), `${label}-`));
  const secret = process.env.ROSTER_SESSION_SECRET;

  const server = spawn(path.join("node_modules", ".bin", "next"), ["start", "-p", String(port), "-H", "127.0.0.1"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      ROSTER_DATA: "local",
      ROSTER_DATA_DIR: dataDir,
      ROSTER_SESSION_SECRET: secret && secret.length >= 32 ? secret : randomBytes(32).toString("hex"),
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? base,
    },
    // Own process group: `next start` forks, and the whole group must go.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));

  const stop = () => {
    if (server.exitCode === null) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        server.kill("SIGTERM");
      }
    }
    rmSync(dataDir, { recursive: true, force: true });
  };
  process.on("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      if ((await fetch(`${base}/search`)).ok) return { base, dataDir, stop };
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  process.stderr.write(`next start did not come up on ${base}\n${log}\n`);
  process.exit(2);
}

export async function serverFromArgs(options) {
  const given = process.argv.find((a) => a.startsWith("--base="))?.split("=")[1];
  if (given) return { base: given, dataDir: null, stop: () => {} };
  return startIsolatedServer(options);
}
