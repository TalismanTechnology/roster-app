/** A host that can never be real; only used as a base to resolve against. */
const PROBE_ORIGIN = "http://roster.invalid";

/**
 * Where to land after auth. Same-origin paths only, or an attacker's sign-in
 * link could bounce a fresh session to their own domain.
 *
 * Rather than pattern-match the string, resolve it the way a browser would
 * and require the origin to survive: `/\evil.com`, `/\t/evil.com` and
 * `\\evil.com` all parse to another host. The resolved path is what comes
 * back, re-checked, because dot segments can collapse into a fresh `//`
 * (`/.//evil.com` resolves to the path `//evil.com`).
 */
export function safeNext(raw: unknown, fallback: string, origin = PROBE_ORIGIN): string {
  const next = typeof raw === "string" ? raw.trim() : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;

  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return fallback;
  }
  if (url.origin !== new URL(origin).origin) return fallback;

  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : fallback;
}

/** `/sign-in`, carrying `next` when there is somewhere safe to return to. */
export function signInHref(next?: string | null, base = "/sign-in"): string {
  const target = safeNext(next, "");
  return target ? `${base}?next=${encodeURIComponent(target)}` : base;
}
