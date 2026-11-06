import { dataMode, env, isProduction, isSupabaseConfigured, sessionSecret } from "@/lib/env";
import { buildHealthReport, httpStatusFor, type HealthCheck, type HealthReport } from "@/lib/health";
import { errorSinks, logger } from "@/lib/logger";
import { limit } from "@/lib/rate-limit";
import { createAnonClient } from "@/lib/supabase/anon";
import { readDb } from "@/lib/data/local/store";

/**
 * Readiness (#117): GET /api/health → JSON, 200 while the app can serve,
 * 503 when it can't. For an uptime monitor and the deploy checklist — see
 * src/lib/health.ts for what each status means. Never cached.
 *
 * The one check that leaves the process is a head-only count on `sports`
 * (public, tiny) with a short timeout; the rest read configuration.
 */

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3_000;
const CHECKS_PER_MINUTE = 120;

export async function GET(request: Request): Promise<Response> {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (!limit({ scope: "health", key: client, limit: CHECKS_PER_MINUTE, windowMs: 60_000 })) {
    return Response.json({ status: "rate_limited" }, { status: 429, headers: { "cache-control": "no-store", "retry-after": "60" } });
  }

  const startedAt = Date.now();
  const checks: Record<string, HealthCheck> = {};
  let mode: HealthReport["dataMode"] = null;

  try {
    env();
    checks.env = { status: "ok" };
  } catch {
    checks.env = { status: "fail", detail: "environment does not parse — see .env.example" };
  }

  try {
    mode = dataMode();
    checks.dataMode = isProduction() && mode === "local" ? { status: "warn", detail: "production is serving local demo data" } : { status: "ok" };
  } catch {
    checks.dataMode = { status: "fail", detail: "no data source configured" };
  }

  if (mode === "local") {
    try {
      sessionSecret();
      checks.session = { status: "ok" };
    } catch {
      checks.session = { status: "fail", detail: "ROSTER_SESSION_SECRET missing" };
    }
    try {
      readDb();
      checks.database = { status: "ok" };
    } catch {
      checks.database = { status: "fail", detail: "local store unreadable" };
    }
  } else if (mode === "supabase") {
    checks.database = await supabaseReachable();
    checks.serviceRole = env().SUPABASE_SERVICE_ROLE_KEY
      ? { status: "ok" }
      : { status: "warn", detail: "SUPABASE_SERVICE_ROLE_KEY unset — account deletion unavailable" };
  }

  const e = safeEnv();
  checks.siteUrl = e?.NEXT_PUBLIC_SITE_URL || !isProduction() ? { status: "ok" } : { status: "warn", detail: "NEXT_PUBLIC_SITE_URL unset" };
  checks.email = e?.RESEND_API_KEY ? { status: "ok" } : { status: isProduction() && mode === "supabase" ? "warn" : "ok", detail: "outbox only" };
  const sinks = errorSinks();
  checks.errorReporting =
    sinks.sentry || sinks.webhook
      ? { status: "ok" }
      : { status: isProduction() && mode === "supabase" ? "warn" : "ok", detail: "logs only" };

  const report = buildHealthReport({ dataMode: mode, checks, startedAt });
  if (report.status === "fail") logger.error("health.fail", { checks });
  return Response.json(report, { status: httpStatusFor(report), headers: { "cache-control": "no-store" } });
}

function safeEnv() {
  try {
    return env();
  } catch {
    return null;
  }
}

async function supabaseReachable(): Promise<HealthCheck> {
  if (!isSupabaseConfigured()) return { status: "fail", detail: "Supabase credentials missing or placeholders" };
  try {
    const { error } = await createAnonClient()
      .from("sports")
      .select("slug", { head: true, count: "exact" })
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    return error ? { status: "fail", detail: "database query failed" } : { status: "ok" };
  } catch {
    return { status: "fail", detail: "database unreachable" };
  }
}
