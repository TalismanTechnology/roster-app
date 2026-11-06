import type { Instrumentation } from "next";

/**
 * Server-side error reporting (#117). Next calls `onRequestError` for every
 * error it captures while rendering, in a Route Handler, a Server Action,
 * or the proxy. It is logged as one structured line and, when configured,
 * forwarded to Sentry (`SENTRY_DSN`) and/or the alert webhook
 * (`ROSTER_ALERT_WEBHOOK_URL`) — see src/lib/logger.ts. Awaited, so a
 * serverless instance does not freeze before the report leaves.
 *
 * `notFound()` and `redirect()` are control flow, not errors, and Next
 * does not route them here.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // Node only: the logger uses node:crypto. Nothing here runs on the edge.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/lib/logger");
  const fields = {
    error,
    method: request.method,
    // The path without its query: a verify or reset link carries its token there.
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
  };
  await logger.error("request.error", fields);
};
