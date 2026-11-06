import { randomUUID } from "node:crypto";

/**
 * Structured logs for the server (#117): one JSON object per line on
 * stdout/stderr, which Vercel's log drains and every log search tool parse
 * without configuration.
 *
 *   logger.info("lists.created", { listId });
 *   logger.error("auth.reset.failed", { error });
 *
 * `event` is a dotted, stable name to search on; fields are context. Values
 * under keys that look like secrets are replaced, and email addresses are
 * masked, before anything is written — a log line is copied around far more
 * than a database row, so it must never carry a password, a token, or a
 * minor's contact details in the clear.
 *
 * Errors are also forwarded, when configured, to Sentry (`SENTRY_DSN`) and/or
 * a webhook (`ROSTER_ALERT_WEBHOOK_URL`, any endpoint that takes a JSON POST —
 * Slack-compatible: the body carries `text`). Both are optional and no-ops
 * when unset. No SDK: one fetch each, with a short timeout, never throwing.
 *
 * Not `server-only`: instrumentation.ts imports it outside the React server
 * graph. It reads nothing a browser could use, and only `process.env`.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel | "silent", number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

/** `ROSTER_LOG_LEVEL`, else `warn` under test (quiet test output) and `info` otherwise. */
function threshold(): number {
  const wanted = process.env.ROSTER_LOG_LEVEL?.trim().toLowerCase();
  if (wanted && wanted in LEVELS) return LEVELS[wanted as LogLevel];
  return process.env.NODE_ENV === "test" ? LEVELS.warn : LEVELS.info;
}

const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|service[-_]?role|^key$|dsn/i;
const EMAIL_KEY = /e-?mail/i;
const EMAIL_VALUE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** `jordan@example.com` → `j***@example.com`. Enough to tell two apart, not to write to one. */
export function maskEmailsIn(text: string): string {
  return text.replace(EMAIL_VALUE, (_m, first: string, domain: string) => `${first}***@${domain}`);
}

/** An error as plain, loggable data. The stack only outside production. */
export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    const out: LogFields = { name: error.name, message: maskEmailsIn(error.message) };
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string") out.digest = digest;
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === "string") out.code = code;
    if (process.env.NODE_ENV !== "production" && error.stack) out.stack = error.stack.split("\n").slice(0, 8).join("\n");
    return out;
  }
  return { message: maskEmailsIn(String(error)) };
}

/** Fields with secrets replaced and emails masked, recursively (to a sane depth). */
export function redact(value: unknown, key = "", depth = 0): unknown {
  if (key && SECRET_KEY.test(key)) return "[redacted]";
  if (value instanceof Error) return serializeError(value);
  if (typeof value === "string") return EMAIL_KEY.test(key) || value.includes("@") ? maskEmailsIn(value) : value;
  if (value === null || typeof value !== "object") return value;
  if (depth >= 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, "", depth + 1));
  const out: LogFields = {};
  for (const [k, v] of Object.entries(value)) out[k] = redact(v, k, depth + 1);
  return out;
}

/** The line written for one log call. Exported for tests. */
export function formatLogLine(level: LogLevel, event: string, fields: LogFields = {}, now = new Date()): string {
  return JSON.stringify({
    time: now.toISOString(),
    level,
    event,
    service: "roster",
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    ...(redact(fields) as LogFields),
  });
}

function write(level: LogLevel, event: string, fields?: LogFields): void {
  if (LEVELS[level] < threshold()) return;
  const line = formatLogLine(level, event, fields);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  /**
   * Logs, then forwards to Sentry / the alert webhook. The returned promise
   * settles when forwarding has (it never rejects): ignore it in a request,
   * await it where the runtime may stop first (instrumentation.ts).
   */
  error: (event: string, fields?: LogFields): Promise<void> => {
    write("error", event, fields);
    return forwardError(event, fields);
  },
};

// ---------------------------------------------------------------------------
// Forwarding
// ---------------------------------------------------------------------------

const FORWARD_TIMEOUT_MS = 2_500;

/** Which sinks are configured. For /api/health — booleans only, never the values. */
export function errorSinks(): { sentry: boolean; webhook: boolean } {
  return { sentry: parseSentryDsn(process.env.SENTRY_DSN) !== null, webhook: Boolean(process.env.ROSTER_ALERT_WEBHOOK_URL?.trim()) };
}

/**
 * `https://<public key>@<host>/<project id>` → the envelope endpoint. Null
 * for anything else, so a malformed DSN disables Sentry instead of throwing.
 */
export function parseSentryDsn(dsn: string | undefined): { endpoint: string; dsn: string } | null {
  if (!dsn?.trim()) return null;
  try {
    const url = new URL(dsn.trim());
    const project = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!url.username || !project || !/^https?:$/.test(url.protocol)) return null;
    return { endpoint: `${url.protocol}//${url.host}/api/${project}/envelope/`, dsn: dsn.trim() };
  } catch {
    return null;
  }
}

/**
 * Sends one error to every configured sink and resolves when they have
 * answered or timed out. Never rejects. Await it where the runtime may stop
 * after the response (instrumentation's onRequestError); fire and forget
 * elsewhere.
 */
export async function forwardError(event: string, fields: LogFields = {}): Promise<void> {
  const sentry = parseSentryDsn(process.env.SENTRY_DSN);
  const webhook = process.env.ROSTER_ALERT_WEBHOOK_URL?.trim();
  if (!sentry && !webhook) return;

  const safe = redact(fields) as LogFields;
  const error = (safe.error ?? {}) as LogFields;
  const message = `${event}${typeof error.message === "string" ? `: ${error.message}` : ""}`;
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
  const sends: Promise<unknown>[] = [];

  if (sentry) {
    const eventId = randomUUID().replace(/-/g, "");
    const payload = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      environment,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      message: { formatted: message },
      tags: { event },
      extra: safe,
    };
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: sentry.dsn }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(payload),
    ].join("\n");
    sends.push(post(sentry.endpoint, body, "application/x-sentry-envelope"));
  }
  if (webhook) {
    sends.push(post(webhook, JSON.stringify({ text: `[roster:${environment}] ${message}`, event, environment, ...safe }), "application/json"));
  }
  await Promise.allSettled(sends);
}

async function post(url: string, body: string, contentType: string): Promise<void> {
  try {
    await fetch(url, { method: "POST", body, headers: { "content-type": contentType }, signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS) });
  } catch (error) {
    // Losing an alert must not become a second error report.
    write("warn", "logger.forward_failed", { host: safeHost(url), reason: error instanceof Error ? error.name : "unknown" });
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}
