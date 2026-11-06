import "server-only";

import { z } from "zod";

/**
 * Every environment variable the server reads, parsed in one place.
 *
 * Deliberately lazy and uncached: nothing throws at import time, so
 * `next build` never needs real credentials, and tests that point
 * `ROSTER_DATA_DIR` at a temp directory after importing still win. Parsing a
 * handful of strings per call costs nothing next to the request around it.
 *
 * Client Components must keep reading `process.env.NEXT_PUBLIC_*` literally —
 * that is what the bundler inlines — so this module is server-only.
 */

/** "" reads as unset: a blank line in `.env.local` should not override a default. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).catch("development"),
  ROSTER_DATA: optional(z.enum(["local", "supabase"])),
  ROSTER_DATA_DIR: optional(z.string()),
  ROSTER_SESSION_SECRET: optional(z.string()),
  NEXT_PUBLIC_SUPABASE_URL: optional(z.string()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional(z.string()),
  SUPABASE_SERVICE_ROLE_KEY: optional(z.string()),
  NEXT_PUBLIC_SITE_URL: optional(z.url()),
  /** A real handle the landing page may feature in Supabase mode — opt-in, with the athlete's consent. */
  ROSTER_DEMO_HANDLE: optional(z.string()),
});

export type Env = z.infer<typeof schema>;

export function env(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment: ${detail}. See .env.example.`);
  }
  return parsed.data;
}

export const isProduction = () => env().NODE_ENV === "production";

/**
 * Whether real Supabase credentials are present.
 *
 * A fresh clone has `.env.example` values, which point at a hostname that does
 * not resolve. Without this check the proxy's auth call hangs on DNS for every
 * request and the whole app appears broken, which is a miserable first ten
 * minutes for anyone new to the repo. Instead we detect the placeholder and
 * degrade to local mode so the app still renders.
 */
export function isSupabaseConfigured(): boolean {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = env();

  return Boolean(
    url && key && !url.includes("your-project") && key !== "your-anon-key" && url.startsWith("https://"),
  );
}

export type DataMode = "local" | "supabase";

/**
 * Which adapter serves this process. `ROSTER_DATA` forces one; otherwise
 * Supabase when real credentials are present, the local file when not.
 *
 * Production never falls back silently. A Supabase deploy whose credentials
 * went missing would otherwise come up serving the seeded JSON demo —
 * fake athletes, writes to an ephemeral disk — and look healthy doing it.
 * Local mode in production must be asked for by name with
 * `ROSTER_DATA=local`. `next build` is exempt: it runs with
 * NODE_ENV=production on machines that hold no runtime secrets.
 */
export function dataMode(): DataMode {
  const e = env();
  if (e.ROSTER_DATA) return e.ROSTER_DATA;
  if (isSupabaseConfigured()) return "supabase";

  if (e.NODE_ENV === "production" && !isBuildPhase()) {
    throw new Error(
      "No data source configured for production: Supabase credentials are missing or placeholders, " +
        "and ROSTER_DATA is unset. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, " +
        "or set ROSTER_DATA=local explicitly to run the file-backed demo. See .env.example.",
    );
  }
  return "local";
}

/** `next build` sets this while it prerenders; `next start` does not. */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/** The project URL and anon key, or a clear error naming what is missing. */
export function supabaseCredentials(): { url: string; anonKey: string } {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = env();
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(Boolean);

  if (!url || !anonKey) {
    throw new Error(
      `Missing ${missing.join(" and ")}. Copy .env.example to .env.local and fill in your Supabase project values.`,
    );
  }
  return { url, anonKey };
}

export const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * The local-mode cookie signing secret from the environment, or null when the
 * caller should fall back to the generated file in `.data/`.
 *
 * In production there is no fallback: a secret generated on one instance's
 * disk would not verify on the next, and it would vanish with the container.
 * Production in local mode — including a Supabase deploy whose credentials
 * went missing and silently degraded — fails here, loudly.
 */
export function sessionSecret(): string | null {
  const secret = env().ROSTER_SESSION_SECRET;
  if (secret && secret.length >= MIN_SESSION_SECRET_LENGTH) return secret;

  if (isProduction()) {
    throw new Error(
      `ROSTER_SESSION_SECRET must be set to at least ${MIN_SESSION_SECRET_LENGTH} characters in production local mode ` +
        "(or configure Supabase). Generate one with: openssl rand -hex 32",
    );
  }
  return null;
}
