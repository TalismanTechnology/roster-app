import type { MetadataRoute } from "next";

import { sitemapShardCount, sitemapShardUrl } from "@/lib/sitemap-shards";

/**
 * The site is public and meant to be found; only the surfaces that belong
 * to a signed-in person are kept out. Unlisted and private resumes protect
 * themselves with per-page robots metadata, since they can't be enumerated
 * here without leaking the very handles they hide.
 *
 * The sitemap is sharded (see app/sitemap.ts); every shard is listed, so
 * this follows the shard count and shares the sitemap's revalidation.
 */
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const shards = await sitemapShardCount();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/resume", "/settings", "/lists", "/onboarding", "/verify/", "/sign-in", "/sign-up", "/auth/"],
    },
    sitemap: Array.from({ length: shards }, (_, id) => sitemapShardUrl(id)),
  };
}
