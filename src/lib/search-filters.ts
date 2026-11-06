import type { AthleteLevel } from "@/lib/database.types";
import { normalizeSearchQuery } from "@/lib/data/search-query";
import type { SearchParams, SearchSort } from "@/lib/data/types";
import { LEVEL_OPTIONS, levelLabel } from "@/lib/format";
import { MAX_POSITION_LENGTH } from "@/lib/positions";
import { toStateCode } from "@/lib/regions";
import { sportName, SPORTS } from "@/lib/sports";

/**
 * The /search URL, both ways. Every filter lives in the query string so a
 * recruiter can bookmark it, send it, or save it (saved searches store this
 * exact string). Parsing is forgiving — junk reads as "no filter" — and
 * serializing is canonical, so the same filters always produce the same
 * string and a saved search can be recognized as the one on screen.
 */

export const SORT_OPTIONS: [SearchSort, string][] = [
  ["verified_count", "Most verified"],
  ["graduation_year", "Class year"],
  ["gpa", "Highest GPA"],
  ["recent", "Recently updated"],
];

export const DEFAULT_SORT: SearchSort = "verified_count";

const SORTS = new Set<string>(SORT_OPTIONS.map(([value]) => value));
const LEVELS = new Set<string>(LEVEL_OPTIONS.map(([value]) => value));
const SPORT_KEYS = new Set<string>(SPORTS.map(([value]) => value));

export type SearchFilters = {
  q: string | null;
  sport: string | null;
  level: AthleteLevel | null;
  gradYear: number | null;
  region: string | null;
  position: string | null;
  minGpa: number | null;
  verifiedOnly: boolean;
  sort: SearchSort;
};

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function read(params: RawParams, key: string): string | null {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function positiveInt(value: string | null): number | null {
  const n = Number(value);
  return value !== null && Number.isInteger(n) && n > 0 ? n : null;
}

/** GPA floor, 0–5 like the column (0002), to two places. Out of range is no filter. */
export function parseMinGpa(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 5) return null;
  return Math.round(n * 100) / 100;
}

export function parseSearchFilters(params: RawParams): SearchFilters {
  const level = read(params, "level");
  const sport = read(params, "sport");
  const sort = read(params, "sort");
  return {
    q: normalizeSearchQuery(read(params, "q")),
    sport: sport && SPORT_KEYS.has(sport) ? sport : null,
    level: level && LEVELS.has(level) ? (level as AthleteLevel) : null,
    gradYear: positiveInt(read(params, "class")),
    region: toStateCode(read(params, "state")),
    position: read(params, "position")?.slice(0, MAX_POSITION_LENGTH) ?? null,
    minGpa: parseMinGpa(read(params, "gpa")),
    verifiedOnly: read(params, "verified") === "1",
    sort: sort && SORTS.has(sort) ? (sort as SearchSort) : DEFAULT_SORT,
  };
}

/** The page number, separately: it is navigation, not part of a saved search. */
export function parsePage(params: RawParams): number {
  return positiveInt(read(params, "page")) ?? 1;
}

/**
 * Canonical query string, no leading "?". Keys in a fixed order, defaults
 * omitted — `filtersToQuery(parseSearchFilters(x))` is stable.
 */
export function filtersToQuery(f: SearchFilters, page = 1): string {
  const s = new URLSearchParams();
  if (f.q) s.set("q", f.q);
  if (f.sport) s.set("sport", f.sport);
  if (f.level) s.set("level", f.level);
  if (f.position) s.set("position", f.position);
  if (f.gradYear) s.set("class", String(f.gradYear));
  if (f.region) s.set("state", f.region);
  if (f.minGpa !== null) s.set("gpa", String(f.minGpa));
  if (f.verifiedOnly) s.set("verified", "1");
  if (f.sort !== DEFAULT_SORT) s.set("sort", f.sort);
  if (page > 1) s.set("page", String(page));
  return s.toString();
}

/** A saved query string, re-canonicalized: what was stored is never trusted as-is. */
export function canonicalQuery(raw: string): string {
  return filtersToQuery(parseSearchFilters(new URLSearchParams(raw.replace(/^\?/, ""))));
}

/** Whether any filter narrows the results (sort alone does not). */
export function hasFilters(f: SearchFilters): boolean {
  return describeFilters(f).length > 0;
}

/** The chips over the results, in reading order. */
export function describeFilters(f: SearchFilters): string[] {
  return [
    f.q && `“${f.q}”`,
    f.sport && sportName(f.sport),
    f.level && levelLabel(f.level),
    f.position && `Plays ${f.position}`,
    f.gradYear && `Class of ${f.gradYear}`,
    f.region,
    f.minGpa !== null && `GPA ${f.minGpa.toFixed(1)}+`,
    f.verifiedOnly && "Verified only",
  ].filter((x): x is string => Boolean(x));
}

/** What the repository takes. */
export function toSearchParams(f: SearchFilters, page: number, pageSize: number): SearchParams {
  return {
    q: f.q,
    sport: f.sport,
    level: f.level,
    gradYear: f.gradYear,
    region: f.region,
    position: f.position,
    minGpa: f.minGpa,
    verifiedOnly: f.verifiedOnly,
    sort: f.sort,
    page,
    pageSize,
  };
}
