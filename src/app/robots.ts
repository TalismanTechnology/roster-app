import type { MetadataRoute } from "next";

/**
 * The site is public and meant to be found; only the surfaces that belong
 * to a signed-in person are kept out. Unlisted and private resumes protect
 * themselves with per-page robots metadata, since they can't be enumerated
 * here without leaking the very handles they hide.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/resume", "/settings", "/lists", "/onboarding", "/verify/", "/sign-in", "/sign-up", "/auth/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://roster.us";
}
