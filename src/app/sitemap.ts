import type { MetadataRoute } from "next";

import { getPublicRepository } from "@/lib/data";
import { SITEMAP_SHARD_SIZE, sitemapShardCount } from "@/lib/sitemap-shards";
import { siteUrl } from "@/lib/site";

/**
 * Every public resume with something on it, in shards of
 * SITEMAP_SHARD_SIZE (`/sitemap/0.xml`, `/sitemap/1.xml`, …; robots.txt
 * lists them all). Uses the listing rule search uses, so an unlisted resume
 * never appears here even though it opens by link, and an empty one — which
 * is noindex (see [handle]/page.tsx) — is left out rather than handed to a
 * crawler that is then told to drop it.
 *
 * Read as the anonymous visitor, so the result is the same for everyone and
 * may be cached; an hour is plenty for a crawler.
 */

export const revalidate = 3600;

export async function generateSitemaps() {
  const count = await sitemapShardCount();
  return Array.from({ length: count }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const shard = Math.max(0, Math.trunc(Number(await id)) || 0);
  const origin = siteUrl();
  const { profiles } = await getPublicRepository().listIndexableProfiles(shard * SITEMAP_SHARD_SIZE, SITEMAP_SHARD_SIZE);

  return [
    ...(shard === 0
      ? [
          { url: `${origin}/`, changeFrequency: "weekly" as const, priority: 1 },
          { url: `${origin}/search`, changeFrequency: "daily" as const, priority: 0.8 },
        ]
      : []),
    ...profiles.map((p) => ({
      url: `${origin}/${p.handle}`,
      lastModified: p.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
