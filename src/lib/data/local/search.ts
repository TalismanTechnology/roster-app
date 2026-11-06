import type { Profile } from "@/lib/database.types";

import { holdsPosition, isListed } from "../rules";
import { allowsFuzzy, clampPage, clampPageSize, normalizeSearchQuery } from "../search-query";
import type { SearchParams, SearchResult, SearchSort } from "../types";

/**
 * Mirror of `search_athletes()` (0007, revised in 0018): the listing rule, the
 * filters, a name match that tolerates misspelling, and verified-first
 * ranking (or the chosen sort, 0020) — in one pass.
 *
 * Postgres uses trigram similarity; this uses bigram Dice, which agrees
 * closely enough for a name typed from memory at a meet.
 */
export function searchProfiles(profiles: Profile[], params: SearchParams): SearchResult {
  const q = normalizeSearchQuery(params.q) ?? "";
  const qLower = q.toLowerCase();
  const fuzzy = allowsFuzzy(q || null);
  const pageSize = clampPageSize(params.pageSize);

  const matches = profiles.filter((p) => {
    if (!isListed(p)) return false;
    if (params.sport && p.primary_sport !== params.sport) return false;
    if (params.level && p.level !== params.level) return false;
    if (params.gradYear && p.grad_year !== params.gradYear) return false;
    if (params.region && p.region !== params.region.toUpperCase()) return false;
    if (!holdsPosition(p.positions, params.position)) return false;
    if (params.verifiedOnly && p.verified_count <= 0) return false;
    if (params.minGpa != null && (p.gpa === null || p.gpa < params.minGpa)) return false;
    if (qLower === "") return true;

    return (
      p.display_name.toLowerCase().includes(qLower) ||
      p.handle.toLowerCase().includes(qLower) ||
      (fuzzy && similarity(p.display_name, q) >= 0.3)
    );
  });

  const sort = params.sort ?? "verified_count";
  matches.sort((a, b) => {
    // An explicit sort leads; the default keeps name relevance first.
    const keyed = sortKey(sort, a, b);
    if (keyed !== 0) return keyed;
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

  const total = matches.length;
  const page = clampPage(params.page, total, pageSize);
  const start = (page - 1) * pageSize;
  return { athletes: matches.slice(start, start + pageSize), total, page, pageSize };
}

/**
 * The `sort_by` lead key from search_athletes (0020). Nulls last, as
 * Postgres orders `nulls last`. `verified_count` has no lead key here: it is
 * the tiebreak every sort ends on, after relevance.
 */
export function sortKey(sort: SearchSort, a: Profile, b: Profile): number {
  switch (sort) {
    case "graduation_year":
      return nullsLast(a.grad_year, b.grad_year, (x, y) => x - y);
    case "gpa":
      return nullsLast(a.gpa, b.gpa, (x, y) => y - x);
    case "recent":
      return b.updated_at.localeCompare(a.updated_at);
    default:
      return 0;
  }
}

function nullsLast<T>(a: T | null, b: T | null, compare: (x: T, y: T) => number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
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
