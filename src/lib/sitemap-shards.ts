import "server-only";

import { getPublicRepository } from "@/lib/data";
import { absoluteUrl } from "@/lib/site";

/**
 * How the sitemap is split. Search engines cap a sitemap at 50,000 URLs;
 * shards are far smaller so each one is a cheap, bounded read, and the
 * count is read live so a growing roster adds shards on its own.
 */
export const SITEMAP_SHARD_SIZE = 5000;

/** At least one: shard 0 always exists, carrying the home and search pages. */
export async function sitemapShardCount(): Promise<number> {
  const { total } = await getPublicRepository().listIndexableProfiles(0, 0);
  return Math.max(1, Math.ceil(total / SITEMAP_SHARD_SIZE));
}

/** The URL Next serves shard `id` at (`generateSitemaps` → `/sitemap/<id>.xml`). */
export function sitemapShardUrl(id: number): string {
  return absoluteUrl(`/sitemap/${id}.xml`);
}
