/**
 * Where to land after auth. Relative paths only, or an attacker's sign-in
 * link could bounce a fresh session to their own domain. Backslashes are
 * refused too: browsers read `/\evil.com` as `//evil.com`.
 */
export function safeNext(raw: unknown, fallback: string): string {
  const next = typeof raw === "string" ? raw.trim() : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
}

/** `/sign-in`, carrying `next` when there is somewhere safe to return to. */
export function signInHref(next?: string | null, base = "/sign-in"): string {
  const target = safeNext(next, "");
  return target ? `${base}?next=${encodeURIComponent(target)}` : base;
}
