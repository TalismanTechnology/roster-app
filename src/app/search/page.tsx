import type { Metadata } from "next";
import Link from "next/link";

import { Avatar } from "@/components/record/Avatar";
import { FilterDisclosure } from "@/components/search/FilterDisclosure";
import { SavedSearches } from "@/components/search/SavedSearches";
import { SaveToList } from "@/components/search/SaveToList";
import { Site } from "@/components/shell/Site";
import { Checkbox, Field, Select, TextInput } from "@/components/ui/fields";
import { Corner, CORNER, Frame, Verified } from "@/components/ui/marks";
import { getRepository } from "@/lib/data";
import { getCurrentProfile, getCurrentUser } from "@/lib/data/auth";
import { isRecruiterKind } from "@/lib/data/rules";
import { MAX_QUERY_LENGTH, pageCount } from "@/lib/data/search-query";
import type { RecruiterList, SavedSearch, TopMark } from "@/lib/data/types";
import type { Profile } from "@/lib/database.types";
import { LEVEL_OPTIONS, levelLabel } from "@/lib/format";
import { heightLabel, weightLabel } from "@/lib/measurables";
import { allPositions, MAX_POSITION_LENGTH, positionsFor } from "@/lib/positions";
import { US_STATES } from "@/lib/regions";
import {
  describeFilters,
  filtersToQuery,
  parsePage,
  parseSearchFilters,
  SORT_OPTIONS,
  toSearchParams,
  type SearchFilters,
} from "@/lib/search-filters";
import { SPORTS, sportName } from "@/lib/sports";

export const metadata: Metadata = {
  title: "Find athletes",
  description: "Search verified athlete resumes by sport, level, position, class year, GPA, and state.",
  alternates: { canonical: "/search" },
};

const PAGE_SIZE = 24;

/**
 * Discovery. A plain GET form — every filter lives in the URL, so a recruiter
 * can bookmark "TX receivers, class of 2027, 3.0+" or send it to a colleague,
 * and the page needs no client JavaScript beyond the save controls. The URL
 * is parsed and re-serialized by `search-filters`, the same code saved
 * searches store with.
 *
 * The repository applies the listing rule: public athletes only, verified
 * first unless another sort is chosen. A signed-in recruiter or coach can
 * save any row to a list and save the search itself.
 */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const filters = parseSearchFilters(params);

  const [repo, user] = await Promise.all([getRepository(), getCurrentUser()]);
  // The repository clamps the page: `?page=999` serves the last page, not an
  // empty one that still offers "Previous".
  const { athletes, total, page, pageSize } = await repo.searchAthletes(toSearchParams(filters, parsePage(params), PAGE_SIZE));
  const pages = pageCount(total, pageSize);

  // Only a recruiter (or coach/staff) saves to lists; athletes never see the controls.
  const viewer = user ? await getCurrentProfile() : null;
  const canSave = Boolean(user && viewer && isRecruiterKind(viewer.account_kind));
  const ids = athletes.map((a) => a.id);
  // One read each for the whole page, not one per row.
  const [lists, savedIn, saved, marks] = await Promise.all([
    canSave && user ? repo.listLists(user.id) : ([] as RecruiterList[]),
    canSave && user ? repo.listsContainingMany(user.id, ids) : ({} as Record<string, string[]>),
    canSave && user ? repo.listSavedSearches(user.id) : ([] as SavedSearch[]),
    repo.topVerifiedMarks(ids),
  ]);

  const active = describeFilters(filters);
  const chips = filterChips(filters);
  const query = filtersToQuery(filters);
  const positionOptions = filters.sport ? positionsFor(filters.sport) : allPositions();

  return (
    <Site>
      <main style={{ paddingInline: "var(--pad-x)" }}>
        <header className="flex flex-col gap-4 py-5 sm:py-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label flex items-center gap-2 text-ink-muted">
              <Corner d={CORNER.tl} /> Find athletes
            </p>
            <h1 className="font-display mt-3 text-display leading-[0.95] tracking-tight sm:mt-4 sm:text-display-lg">
              Search the record.
            </h1>
          </div>
          {/* On a phone the results are the point; the reassurance can wait for a wider screen. */}
          <p className="max-w-sm text-ink-muted max-sm:hidden">
            Public resumes only, verified first. Open any result without an account.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 pb-16 sm:gap-8 lg:grid-cols-12">
          {/* Below lg the column dissolves into the page grid, so saved
              searches can follow the results instead of pushing them down. */}
          <div className="flex flex-col gap-5 self-start max-lg:contents lg:sticky lg:top-[calc(var(--header-h)+var(--safe-top)+1rem)] lg:col-span-3">
            <Frame>
              <div style={{ padding: "var(--feature-pad)" }}>
                <form method="GET" role="search" aria-label="Filters" className="flex flex-col gap-3 lg:gap-5">
                  {/* The query bar: always on screen, whatever is folded. */}
                  <div className="flex items-end gap-2">
                    <label className="block min-w-0 flex-1">
                      <span className="mb-2 block text-sm font-bold max-lg:sr-only">Name or handle</span>
                      <TextInput
                        name="q"
                        type="search"
                        defaultValue={filters.q ?? ""}
                        placeholder="Name or handle"
                        maxLength={MAX_QUERY_LENGTH}
                      />
                    </label>
                    <button type="submit" className="btn-primary shrink-0 self-stretch px-4 lg:hidden">
                      Search
                    </button>
                  </div>

                  <FilterDisclosure count={chips.length} chips={chips.length > 0 ? <FilterChips chips={chips} /> : null}>
                    <Field label="Sport">
                      <Select name="sport" defaultValue={filters.sport ?? ""}>
                        <option value="">Any sport</option>
                        {SPORTS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Level">
                      <Select name="level" defaultValue={filters.level ?? ""}>
                        <option value="">Any level</option>
                        {LEVEL_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Position" hint={filters.sport ? `${sportName(filters.sport)} positions suggested.` : undefined}>
                      <TextInput
                        name="position"
                        list="position-options"
                        defaultValue={filters.position ?? ""}
                        placeholder="WR"
                        maxLength={MAX_POSITION_LENGTH}
                        autoComplete="off"
                      />
                      <datalist id="position-options">
                        {positionOptions.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Class of">
                        <TextInput name="class" type="number" min={1950} max={2100} defaultValue={filters.gradYear ?? ""} placeholder="2027" />
                      </Field>
                      <Field label="State">
                        <Select name="state" defaultValue={filters.region ?? ""}>
                          <option value="">Any</option>
                          {US_STATES.map(([code, name]) => (
                            <option key={code} value={code}>
                              {code} — {name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Min GPA">
                        <TextInput name="gpa" type="number" min={0} max={5} step="0.1" inputMode="decimal" defaultValue={filters.minGpa ?? ""} placeholder="3.0" />
                      </Field>
                      <Field label="Sort">
                        <Select name="sort" defaultValue={filters.sort}>
                          {SORT_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Checkbox name="verified" value="1" defaultChecked={filters.verifiedOnly} label="Verified only" hint="At least one coach-verified entry." />
                    <div className="flex items-center justify-between gap-3 border-t border-rule pt-4">
                      <button type="submit" className="btn-primary min-h-9 px-4 text-sm max-lg:flex-1">
                        <span className="lg:hidden">Show results</span>
                        <span className="max-lg:hidden">Search</span>
                      </button>
                      {query !== "" && (
                        <Link
                          href="/search"
                          className="label inline-flex min-h-11 items-center px-2 text-ink-muted underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-ink lg:min-h-0 lg:px-0"
                        >
                          Clear
                        </Link>
                      )}
                    </div>
                  </FilterDisclosure>
                </form>
              </div>
            </Frame>

            {canSave && (
              <div className="order-last lg:order-none" style={{ paddingInline: "var(--feature-pad)" }}>
                <SavedSearches searches={saved} current={query} />
              </div>
            )}
          </div>

          <section aria-label="Results" className="min-w-0 lg:col-span-9">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
              <p className="label text-ink-muted" data-numeric>
                {total === 0 ? "No results" : `${total} ${total === 1 ? "athlete" : "athletes"}`}
                {pages > 1 && ` · page ${page} of ${pages}`}
                {filters.sort !== "verified_count" && ` · ${SORT_OPTIONS.find(([v]) => v === filters.sort)?.[1]}`}
              </p>
              {/* Below lg the same chips sit beside the Filters button. */}
              {active.length > 0 && (
                <ul className="flex flex-wrap gap-2 max-lg:hidden" aria-label="Active filters">
                  {active.map((a) => (
                    <li key={a} className="chip">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {athletes.length === 0 ? (
              <EmptyResults hasFilters={active.length > 0} />
            ) : (
              <ol className="divide-y divide-rule">
                {athletes.map((athlete) => (
                  <AthleteRow
                    key={athlete.id}
                    athlete={athlete}
                    mark={marks[athlete.id] ?? null}
                    lists={canSave ? lists : null}
                    savedIn={savedIn[athlete.id] ?? []}
                  />
                ))}
              </ol>
            )}

            <Pager page={page} hasMore={page < pages} filters={filters} />
          </section>
        </div>
      </main>
    </Site>
  );
}

type Chip = { label: string; href: string };

/**
 * Each applied filter (but the name, which is in the bar) with the URL that
 * drops just it — a chip is a one-tap undo.
 */
function filterChips(filters: SearchFilters): Chip[] {
  const without = (patch: Partial<SearchFilters>): string => {
    const query = filtersToQuery({ ...filters, ...patch });
    return query ? `/search?${query}` : "/search";
  };
  const chips: (Chip | null)[] = [
    filters.sport ? { label: sportName(filters.sport) ?? filters.sport, href: without({ sport: null, position: null }) } : null,
    filters.level ? { label: levelLabel(filters.level) ?? filters.level, href: without({ level: null }) } : null,
    filters.position ? { label: `Plays ${filters.position}`, href: without({ position: null }) } : null,
    filters.gradYear ? { label: `Class of ${filters.gradYear}`, href: without({ gradYear: null }) } : null,
    filters.region ? { label: filters.region, href: without({ region: null }) } : null,
    filters.minGpa !== null ? { label: `GPA ${filters.minGpa.toFixed(1)}+`, href: without({ minGpa: null }) } : null,
    filters.verifiedOnly ? { label: "Verified only", href: without({ verifiedOnly: false }) } : null,
  ];
  return chips.filter((c): c is Chip => c !== null);
}

/** The applied filters as a thumb-swipeable strip; it scrolls, the page doesn't. */
function FilterChips({ chips }: { chips: Chip[] }) {
  return (
    <ul className="scrollbar-none -my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain py-1" aria-label="Active filters">
      {chips.map((c) => (
        <li key={c.label} className="shrink-0">
          <Link href={c.href} className="chip min-h-9 whitespace-nowrap hover:border-ink" aria-label={`Remove filter: ${c.label}`}>
            {c.label}
            <span aria-hidden className="text-ink-subtle">
              ×
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

/**
 * One result (#91): the photo in its brackets, who and where, the body
 * (height · weight), the best verified mark, and the count. A row, not a
 * card — the list reads like a results sheet.
 */
function AthleteRow({
  athlete,
  mark,
  lists,
  savedIn,
}: {
  athlete: Profile;
  mark: TopMark | null;
  lists: RecruiterList[] | null;
  savedIn: string[];
}) {
  const line = [athlete.positions.join(" / "), athlete.school ?? athlete.location, athlete.grad_year ? `Class of ${athlete.grad_year}` : null]
    .filter(Boolean)
    .join(" · ");
  const meta = [levelLabel(athlete.level), sportName(athlete.primary_sport), athlete.region].filter(Boolean).join(" · ");
  const body = [heightLabel(athlete.height_cm), weightLabel(athlete.weight_kg), athlete.gpa !== null ? `${athlete.gpa.toFixed(2)} GPA` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="group relative">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-3 py-4 sm:grid-cols-[auto_1.6fr_1.2fr_auto] sm:gap-x-5">
        <Avatar url={athlete.avatar_url} name={athlete.display_name} className="size-12 sm:size-14" sizes="56px" />

        <div className="min-w-0">
          {/* The link's ::after covers the row, so the whole card opens the
              resume; the link itself is still a 40px target on its own. */}
          <Link
            href={`/${athlete.handle}`}
            className="-my-2.5 flex min-h-10 min-w-0 items-center font-bold after:absolute after:inset-0 hover:underline sm:my-0 sm:inline sm:min-h-0"
          >
            <span className="truncate">{athlete.display_name}</span>
          </Link>
          <p className="label mt-0.5 truncate text-ink-muted">{line}</p>
          <p className="label mt-0.5 truncate text-ink-subtle">{meta}</p>
          {body && (
            <p className="label mt-0.5 truncate font-mono text-ink-subtle" data-numeric>
              {body}
            </p>
          )}
        </div>

        <div className="col-span-full min-w-0 max-sm:col-start-2 max-sm:-mt-1 sm:col-span-1">
          {mark ? (
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Verified className="shrink-0 self-center" />
              {mark.value_display && (
                <span className="font-display min-w-0 text-lg tracking-tight [overflow-wrap:anywhere]" data-numeric>
                  {mark.value_display}
                  {mark.unit && <span className="ml-0.5 text-sm font-normal text-ink-muted">{mark.unit}</span>}
                </span>
              )}
              <span className="label min-w-0 max-w-full truncate text-ink-muted">{mark.title}</span>
            </p>
          ) : (
            <p className="label text-ink-subtle">{athlete.entry_count} {athlete.entry_count === 1 ? "entry" : "entries"} · none verified</p>
          )}
        </div>

        <p
          className="label row-start-1 flex items-center gap-1.5 self-start justify-self-end whitespace-nowrap max-sm:pt-0.5 sm:row-start-auto sm:self-center"
          style={{ gridColumn: "-2 / -1" }}
          data-numeric
        >
          <Verified className={athlete.verified_count > 0 ? "" : "opacity-30"} /> {athlete.verified_count}
          <span className="max-sm:sr-only">verified</span>
        </p>

        {lists && (
          <div className="relative z-10 col-span-full min-w-0">
            <SaveToList profileId={athlete.id} lists={lists} savedIn={savedIn} />
          </div>
        )}
      </div>
    </li>
  );
}

function EmptyResults({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="py-14">
      <p className="font-display text-display leading-tight">No one matches.</p>
      <p className="mt-2 max-w-md text-ink-muted">
        {hasFilters ? "Loosen a filter — or check the spelling of the name." : "Nothing is listed yet."}
      </p>
      {hasFilters && (
        <Link href="/search" className="btn-outline mt-6">
          Clear filters
        </Link>
      )}
    </div>
  );
}

function Pager({ page, hasMore, filters }: { page: number; hasMore: boolean; filters: SearchFilters }) {
  if (page === 1 && !hasMore) return null;

  const to = (target: number) => {
    const query = filtersToQuery(filters, target);
    return query ? `/search?${query}` : "/search";
  };

  return (
    <nav aria-label="Pagination" className="flex justify-between border-t border-rule py-4">
      {page > 1 ? (
        <Link href={to(page - 1)} className="btn-outline min-h-9 px-4 text-sm">
          Previous
        </Link>
      ) : (
        <span />
      )}
      {hasMore && (
        <Link href={to(page + 1)} className="btn-outline min-h-9 px-4 text-sm">
          Next
        </Link>
      )}
    </nav>
  );
}
