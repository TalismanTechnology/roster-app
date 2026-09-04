import type { MetadataRoute } from "next";

import { getRepository } from "@/lib/data";

import { siteUrl } from "./robots";

/**
 * Every public resume, plus the two pages a crawler should start from.
 * Uses the same listing rule as search, so an unlisted resume never
 * appears here even though it opens by link.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repo = await getRepository();
  const origin = siteUrl();
  const athletes = await repo.searchAthletes({ pageSize: 100 });

  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/search`, changeFrequency: "daily", priority: 0.8 },
    ...athletes.map((p) => ({
      url: `${origin}/${p.handle}`,
      lastModified: p.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
