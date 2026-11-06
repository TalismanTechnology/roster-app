/**
 * The readiness report behind /api/health (#117), as a pure function of
 * already-run checks so its shape is unit-tested without a server.
 *
 * Each check is `ok`, `warn` (works, but something a launch should fix — no
 * mail provider, no error sink), or `fail` (requests will break). The
 * overall status is the worst of them, and only `fail` turns the response
 * into a 503, so an uptime monitor pages on breakage, not on a missing
 * nice-to-have. Values are never echoed: a check says "configured", not what
 * it is configured to.
 */

export type CheckStatus = "ok" | "warn" | "fail";
export type HealthCheck = { status: CheckStatus; detail?: string };
export type HealthStatus = "ok" | "degraded" | "fail";

export type HealthReport = {
  status: HealthStatus;
  service: "roster";
  /** `local` or `supabase`; null when it could not be resolved (that check fails). */
  dataMode: "local" | "supabase" | null;
  /** Short commit sha on Vercel, else null. */
  version: string | null;
  environment: string;
  time: string;
  /** Milliseconds spent running the checks. */
  durationMs: number;
  checks: Record<string, HealthCheck>;
};

export function overallStatus(checks: Record<string, HealthCheck>): HealthStatus {
  const statuses = Object.values(checks).map((c) => c.status);
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "degraded";
  return "ok";
}

export function buildHealthReport(input: {
  dataMode: HealthReport["dataMode"];
  checks: Record<string, HealthCheck>;
  startedAt: number;
  now?: Date;
  env?: Record<string, string | undefined>;
}): HealthReport {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  return {
    status: overallStatus(input.checks),
    service: "roster",
    dataMode: input.dataMode,
    version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    environment: env.VERCEL_ENV ?? env.NODE_ENV ?? "development",
    time: now.toISOString(),
    durationMs: Math.max(0, now.getTime() - input.startedAt),
    checks: input.checks,
  };
}

/** HTTP status for a report: 503 only when something is actually broken. */
export function httpStatusFor(report: Pick<HealthReport, "status">): number {
  return report.status === "fail" ? 503 : 200;
}
