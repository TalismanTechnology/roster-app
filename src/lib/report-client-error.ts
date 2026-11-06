/**
 * Sends a client-side render error to /api/errors (#117), which logs it
 * through lib/logger.ts and on to Sentry / the alert webhook when those are
 * configured. Server errors are already reported by instrumentation.ts;
 * this covers what only the browser sees.
 *
 * Fire and forget: `sendBeacon` survives the user navigating away and never
 * throws into the boundary that is trying to show a friendly page. Only the
 * digest, a capped message, and the path are sent — never the stack, which
 * could carry whatever the component was holding.
 */
export function reportClientError(error: Error & { digest?: string }, boundary: "route" | "global"): void {
  if (typeof window === "undefined" || process.env.NODE_ENV === "development") return;
  try {
    const body = JSON.stringify({
      boundary,
      digest: error.digest ?? null,
      message: String(error.message ?? "").slice(0, 300),
      path: window.location.pathname.slice(0, 200),
    });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/errors", blob)) {
      void fetch("/api/errors", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // Reporting must never be the second failure.
  }
}
