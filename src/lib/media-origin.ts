/** Validate browser origins without trusting forwarded host headers. */
export function isMediaRequestSameOrigin(request: Request, environment: string | undefined, siteUrl?: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const browser = new URL(origin);
    if (origin !== browser.origin || !["http:", "https:"].includes(browser.protocol)) return false;
    if (environment === "production") {
      if (!siteUrl) return false;
      const site = new URL(siteUrl);
      return site.protocol === "https:" && !site.username && !site.password && origin === site.origin;
    }
    const canonical = new URL(request.url);
    if (origin === canonical.origin) return true;
    // Next development builds request.url using its bound hostname rather
    // than the browser's Host. Only permit matching local loopback aliases.
    if (environment !== "development") return false;
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return loopback.has(canonical.hostname) && loopback.has(browser.hostname) &&
      browser.protocol === canonical.protocol && browser.port === canonical.port &&
      request.headers.get("host") === browser.host;
  } catch { return false; }
}
