import type { Profile } from "@/lib/database.types";

import type { SearchParams } from "../types";
import { isListed } from "./rules";

/**
 * Mirror of `search_athletes()` in migration 0007: the listing rule, the
 * filters, a name match that tolerates misspelling, and verified-first
 * ranking — in one pass.
 *
 * Postgres uses trigram similarity; this uses bigram Dice, which agrees
 * closely enough for a name typed from memory at a meet.
 */
export function searchProfiles(profiles: Profile[], params: SearchParams): Profile[] {
  const q = params.q?.trim() ?? "";
  const qLower = q.toLowerCase();
  const pageSize = Math.min(params.pageSize ?? 24, 100);
  const page = Math.max(params.page ?? 1, 1);

  const matches = profiles.filter((p) => {
    if (!isListed(p)) return false;
    if (params.sport && p.primary_sport !== params.sport) return false;
    if (params.level && p.level !== params.level) return false;
    if (params.gradYear && p.grad_year !== params.gradYear) return false;
    if (params.region && p.region !== params.region.toUpperCase()) return false;
    if (params.verifiedOnly && p.verified_count <= 0) return false;
    if (qLower === "") return true;

    return (
      p.display_name.toLowerCase().includes(qLower) ||
      p.handle.toLowerCase().includes(qLower) ||
      similarity(p.display_name, q) >= 0.3
    );
  });

  matches.sort((a, b) => {
    if (qLower !== "") {
      const diff = similarity(b.display_name, q) - similarity(a.display_name, q);
      if (Math.abs(diff) > 1e-9) return diff;
    }
    return (
      b.verified_count - a.verified_count ||
      b.entry_count - a.entry_count ||
      a.display_name.localeCompare(b.display_name)
    );
  });

  const start = (page - 1) * pageSize;
  return matches.slice(start, start + pageSize);
}

function bigrams(text: string): Map<string, number> {
  const s = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const grams = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/** Dice coefficient over character bigrams, 0..1. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let shared = 0;
  let total = 0;
  for (const [g, n] of ga) {
    total += n;
    shared += Math.min(n, gb.get(g) ?? 0);
  }
  for (const n of gb.values()) total += n;
  return total === 0 ? 0 : (2 * shared) / total;
}
