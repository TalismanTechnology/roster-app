import type { Metadata } from "next";
import Link from "next/link";

import { SaveToList } from "@/components/search/SaveToList";
import { Site } from "@/components/shell/Site";
import { Checkbox, Field, Select, TextInput } from "@/components/ui/fields";
import { Corner, CORNER, Frame, Verified } from "@/components/ui/marks";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import type { RecruiterList } from "@/lib/data/types";
import type { AthleteLevel, Profile } from "@/lib/database.types";
import { LEVEL_OPTIONS, levelLabel } from "@/lib/format";
import { SPORTS, sportName } from "@/lib/sports";

export const metadata: Metadata = {
  title: "Find athletes",
  description: "Search verified athlete resumes by sport, level, class year, and state.",
  alternates: { canonical: "/search" },
};

const PAGE_SIZE = 24;
const LEVEL_VALUES = new Set<string>(LEVEL_OPTIONS.map(([value]) => value));

type Filters = {
  q: string | null;
  sport: string | null;
  level: string | null;
  gradYear: number | null;
  region: string | null;
  verifiedOnly: boolean;
};

/**
 * Discovery. A plain GET form — every filter lives in the URL, so a recruiter
 * can bookmark "TX receivers, class of 2027" or send it to a colleague, and
 * the page needs no client JavaScript beyond the save-to-list control.
 *
 * The repository applies the listing rule: public athletes only, verified
 * first. A signed-in recruiter can save any row to a list.
 */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const filters: Filters = {
    q: str(params.q),
    sport: str(params.sport),
    level: str(params.level),
    gradYear: int(params.class),
    region: str(params.state)?.toUpperCase() ?? null,
    verifiedOnly: params.verified === "1",
  };
  const page = Math.max(int(params.page) ?? 1, 1);

  const [repo, user] = await Promise.all([getRepository(), getCurrentUser()]);
  const athletes = await repo.searchAthletes({
    q: filters.q,
    sport: filters.sport,
    level: filters.level && LEVEL_VALUES.has(filters.level) ? (filters.level as AthleteLevel) : null,
    gradYear: filters.gradYear,
    region: filters.region,
    verifiedOnly: filters.verifiedOnly,
    page,
    pageSize: PAGE_SIZE,
  });

  // Only a recruiter (or coach/staff) saves to lists; athletes never see the control.
  const viewer = user ? await repo.getProfileById(user.id) : null;
  const canSave = Boolean(viewer && viewer.account_kind !== "athlete");
  const lists = canSave && user ? await repo.listLists(user.id) : [];
  const savedIn = canSave && user
    ? Object.fromEntries(await Promise.all(athletes.map(async (a) => [a.id, await repo.listsContaining(user.id, a.id)])))
    : {};

  const active = describe(filters);

  return (
    <Site>
      <main style={{ paddingInline: "var(--pad-x)" }}>
        <header className="flex flex-col gap-4 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label flex items-center gap-2 text-ink-muted">
              <Corner d={CORNER.tl} /> Find athletes
            </p>
            <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">
              Search the record.
            </h1>
          </div>
          <p className="max-w-sm text-ink-muted">
            Public resumes only, verified first. Open any result without an account.
          </p>
        </header>

        <div className="grid gap-8 pb-16 lg:grid-cols-12">
          <Frame className="self-start lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:col-span-3">
            <form method="GET" role="search" aria-label="Filters" className="flex flex-col gap-5" style={{ padding: "var(--feature-pad)" }}>
              <Field label="Name or handle">
                <TextInput name="q" type="search" defaultValue={filters.q ?? ""} placeholder="Reyes" />
              </Field>
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
              <div className="grid grid-cols-2 gap-4">
                <Field label="Class of">
                  <TextInput name="class" type="number" min={1950} max={2100} defaultValue={filters.gradYear ?? ""} placeholder="2027" />
                </Field>
                <Field label="State">
                  <TextInput name="state" maxLength={2} defaultValue={filters.region ?? ""} placeholder="TX" autoCapitalize="characters" />
                </Field>
              </div>
              <Checkbox name="verified" value="1" defaultChecked={filters.verifiedOnly} label="Verified only" hint="At least one coach-verified entry." />
              <div className="flex items-center justify-between gap-3 border-t border-rule pt-4">
                <button type="submit" className="btn-primary min-h-9 px-4 text-sm">
                  Search
                </button>
                {active.length > 0 && (
                  <Link href="/search" className="label text-ink-muted underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-ink">
                    Clear
                  </Link>
                )}
              </div>
            </form>
          </Frame>

          <section aria-label="Results" className="min-w-0 lg:col-span-9">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
              <p className="label text-ink-muted" data-numeric>
                {athletes.length === 0 ? "No results" : `${athletes.length}${athletes.length === PAGE_SIZE ? "+" : ""} ${athletes.length === 1 ? "athlete" : "athletes"}`}
                {page > 1 && ` · page ${page}`}
              </p>
              {active.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Active filters">
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
                  <AthleteRow key={athlete.id} athlete={athlete} lists={canSave ? lists : null} savedIn={savedIn[athlete.id] ?? []} />
                ))}
              </ol>
            )}

            <Pager page={page} hasMore={athletes.length === PAGE_SIZE} filters={filters} />
          </section>
        </div>
      </main>
    </Site>
  );
}

// ---------------------------------------------------------------------------

function AthleteRow({ athlete, lists, savedIn }: { athlete: Profile; lists: RecruiterList[] | null; savedIn: string[] }) {
  const line = [athlete.positions.join(" / "), athlete.school ?? athlete.location, athlete.grad_year ? `Class of ${athlete.grad_year}` : null]
    .filter(Boolean)
    .join(" · ");
  const meta = [levelLabel(athlete.level), sportName(athlete.primary_sport), athlete.region].filter(Boolean).join(" · ");

  return (
    <li className="group relative">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 py-4 sm:grid-cols-[1.6fr_1fr_auto]">
        <div className="min-w-0">
          <Link href={`/${athlete.handle}`} className="font-bold after:absolute after:inset-0 hover:underline">
            {athlete.display_name}
          </Link>
          <p className="label mt-0.5 truncate text-ink-muted">{line}</p>
          <p className="label mt-0.5 truncate text-ink-subtle">{meta}</p>
        </div>

        <p className="hidden text-sm text-ink-muted sm:block" data-numeric>
          {athlete.entry_count} {athlete.entry_count === 1 ? "entry" : "entries"}
        </p>

        <p className="label flex items-center gap-1.5 whitespace-nowrap" data-numeric>
          <Verified className={athlete.verified_count > 0 ? "" : "opacity-30"} /> {athlete.verified_count} verified
        </p>

        {lists && (
          <div className="relative z-10 col-span-full">
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

function Pager({ page, hasMore, filters }: { page: number; hasMore: boolean; filters: Filters }) {
  if (page === 1 && !hasMore) return null;

  const to = (target: number) => {
    const search = new URLSearchParams();
    if (filters.q) search.set("q", filters.q);
    if (filters.sport) search.set("sport", filters.sport);
    if (filters.level) search.set("level", filters.level);
    if (filters.gradYear) search.set("class", String(filters.gradYear));
    if (filters.region) search.set("state", filters.region);
    if (filters.verifiedOnly) search.set("verified", "1");
    if (target > 1) search.set("page", String(target));
    return `/search?${search.toString()}`;
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

function describe(f: Filters): string[] {
  return [
    f.q && `“${f.q}”`,
    f.sport && sportName(f.sport),
    f.level && levelLabel(f.level as AthleteLevel),
    f.gradYear && `Class of ${f.gradYear}`,
    f.region,
    f.verifiedOnly && "Verified only",
  ].filter((x): x is string => Boolean(x));
}

function str(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function int(value: string | string[] | undefined): number | null {
  const parsed = Number(str(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
