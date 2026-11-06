/**
 * Input hygiene for athlete search, shared by both adapters and the page.
 *
 * The query string comes straight from a URL anyone can type, so it is
 * trimmed, whitespace-collapsed, and capped before it reaches a LIKE
 * pattern or a similarity scan. Pure functions — unit-tested directly.
 */

/** Longer than any real name or handle; long enough to never truncate one. */
export const MAX_QUERY_LENGTH = 64;

/** Fuzzy (trigram / bigram) matching needs at least this many characters to mean anything. */
export const MIN_FUZZY_LENGTH = 2;

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

/** Trimmed, single-spaced, capped; null when nothing searchable is left. */
export function normalizeSearchQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH).trim();
  return q === "" ? null : q;
}

/** Whether a normalized query is long enough for fuzzy matching. */
export function allowsFuzzy(q: string | null): boolean {
  return q !== null && q.length >= MIN_FUZZY_LENGTH;
}

/**
 * Escapes LIKE / ILIKE metacharacters so user input matches literally.
 * Postgres's default escape character is backslash, so the backslash
 * itself is escaped first.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function clampPageSize(pageSize: number | null | undefined): number {
  if (!pageSize || !Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(pageSize), 1), MAX_PAGE_SIZE);
}

/** The total number of pages for `total` results — at least 1, so page 1 always exists. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** A requested page held within 1..pageCount. Garbage reads as page 1. */
export function clampPage(page: number | null | undefined, total: number, pageSize: number): number {
  const requested = page && Number.isFinite(page) ? Math.trunc(page) : 1;
  return Math.min(Math.max(requested, 1), pageCount(total, pageSize));
}
