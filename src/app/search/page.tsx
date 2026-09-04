import type { Metadata } from "next";
import Link from "next/link";

import { VerifiedSeal } from "@/components/record/VerificationMark";
import { AppShell, SideCard } from "@/components/shell/AppShell";
import { SearchIcon } from "@/components/shell/icons";
import type { AthleteLevel, Profile } from "@/lib/database.types";
import { LEVEL_OPTIONS, levelLabel, sportLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Find athletes",
  description: "Search verified athlete resumes by sport, level, class year, and state.",
};

const PAGE_SIZE = 24;

const LEVEL_VALUES = new Set<string>(LEVEL_OPTIONS.map(([value]) => value));

/**
 * Discovery. A plain GET form — every filter lives in the URL, so a recruiter
 * can bookmark "MI sprinters, class of 2027" or send it to a colleague, and
 * the page needs no client JavaScript at all.
 *
 * The heavy lifting is `search_athletes()` in migration 0007: fuzzy name
 * match, filters, and verified-first ranking in one indexed pass.
 */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;

  const q = str(params.q);
  const sport = str(params.sport);
  const level = str(params.level);
  const gradYear = int(params.class);
  const region = str(params.state);
  const verifiedOnly = params.verified === "1";
  const page = Math.max(int(params.page) ?? 1, 1);

  const athletes = await runSearch({
    q,
    sport,
    level: level && LEVEL_VALUES.has(level) ? (level as AthleteLevel) : null,
    gradYear,
    region,
    verifiedOnly,
    page,
  });

  return (
    <AppShell
      active="search"
      right={
        <SideCard title="New to Roster?">
          <p className="text-ink-muted text-sm leading-normal">
            One link for your whole career — record, film, references,
            verified by your coaches. Free for athletes.
          </p>
          <Link href="/sign-up" className="btn-primary mt-1 self-start px-5">
            Create your resume
          </Link>
        </SideCard>
      }
    >
      {/* Explore's anatomy: the search pill lives in the sticky glass bar at
          the top of the column, the filters fold underneath, results are user
          cells. The whole thing is one GET form so every state has a URL. */}
      <SearchForm defaults={{ q, sport, level, gradYear, region, verifiedOnly }} />

      <section aria-label="Results">
        {athletes === null ? (
          <Notice title="Not plugged in yet.">
            Search comes online once the database is connected.
          </Notice>
        ) : athletes.length === 0 ? (
          <Notice title="No one matches.">
            Loosen a filter — or invite the athlete you were looking for.
          </Notice>
        ) : (
          <ol>
            {athletes.map((athlete) => (
              <AthleteRow key={athlete.id} athlete={athlete} />
            ))}
          </ol>
        )}

        {athletes !== null && (
          <Pager
            page={page}
            hasMore={athletes.length === PAGE_SIZE}
            params={{ q, sport, level, gradYear, region, verifiedOnly }}
          />
        )}
      </section>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------

type Filters = {
  q: string | null;
  sport: string | null;
  level: string | null;
  gradYear: number | null;
  region: string | null;
  verifiedOnly: boolean;
};

async function runSearch(
  filters: Omit<Filters, "level"> & { level: AthleteLevel | null; page: number },
): Promise<Profile[] | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();

  const { data } = await supabase.rpc("search_athletes", {
    q: filters.q,
    sport: filters.sport,
    levels: filters.level ? [filters.level] : null,
    grad_years: filters.gradYear ? [filters.gradYear] : null,
    regions: filters.region ? [filters.region.toUpperCase()] : null,
    athlete_positions: null,
    verified_only: filters.verifiedOnly,
    page_size: PAGE_SIZE,
    page_offset: (filters.page - 1) * PAGE_SIZE,
  });

  return data ?? [];
}

function SearchForm({ defaults }: { defaults: Filters }) {
  const fieldClasses =
    "w-full rounded-(--radius-input) border border-rule-strong bg-transparent px-3 py-2 text-base text-ink " +
    "placeholder:text-ink-subtle focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none";

  return (
    <form method="GET">
      <div className="bar-blur border-rule sticky top-0 z-20 border-b px-4 py-2">
        <label className="bg-paper-sunken focus-within:bg-paper focus-within:outline-accent flex h-11 cursor-text items-center gap-3 rounded-full px-4 focus-within:outline-2">
          <SearchIcon className="text-ink-muted size-5" />
          <input
            type="search"
            name="q"
            defaultValue={defaults.q ?? ""}
            placeholder="Search athletes"
            className="placeholder:text-ink-muted w-full bg-transparent text-base outline-none"
          />
          <span className="sr-only-text">Name or handle</span>
        </label>
      </div>

      <fieldset className="border-rule grid grid-cols-2 items-end gap-x-4 gap-y-4 border-b px-4 py-4 sm:grid-cols-4">
        <legend className="sr-only-text">Filters</legend>

        <label className="block">
          <span className="label text-ink-muted mb-1 block font-bold">Sport</span>
          <input
            name="sport"
            defaultValue={defaults.sport ?? ""}
            placeholder="track_field"
            className={fieldClasses}
          />
        </label>

        <label className="block">
          <span className="label text-ink-muted mb-1 block font-bold">Level</span>
          <select
            name="level"
            defaultValue={defaults.level ?? ""}
            className={`${fieldClasses} cursor-pointer appearance-none`}
          >
            <option value="">Any</option>
            {LEVEL_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label text-ink-muted mb-1 block font-bold">Class of</span>
          <input
            name="class"
            type="number"
            min={1950}
            max={2100}
            defaultValue={defaults.gradYear ?? ""}
            className={fieldClasses}
          />
        </label>

        <label className="block">
          <span className="label text-ink-muted mb-1 block font-bold">State</span>
          <input
            name="state"
            maxLength={2}
            defaultValue={defaults.region ?? ""}
            placeholder="MI"
            className={fieldClasses}
          />
        </label>

        <label className="col-span-2 flex cursor-pointer items-center gap-3 sm:col-span-3">
          <input
            type="checkbox"
            name="verified"
            value="1"
            defaultChecked={defaults.verifiedOnly}
            className="accent-accent size-4"
          />
          <span className="flex items-center gap-1.5 text-sm font-bold">
            Verified only <VerifiedSeal className="size-4" />
          </span>
        </label>

        <button type="submit" className="btn-primary min-h-9">
          Search
        </button>
      </fieldset>
    </form>
  );
}

function AthleteRow({ athlete }: { athlete: Profile }) {
  const meta = [
    levelLabel(athlete.level),
    sportLabel(athlete.primary_sport),
    athlete.grad_year ? `Class of ${athlete.grad_year}` : null,
    athlete.school ?? athlete.region,
  ]
    .filter(Boolean)
    .join(" · ");

  const initials = athlete.display_name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  // A user cell: monogram, bold name with the seal, muted meta, and the one
  // action pill on the right.
  return (
    <li className="border-rule border-b">
      <Link
        href={`/${athlete.handle}`}
        className="wash-hover flex cursor-pointer items-center gap-3 px-4 py-3"
      >
        <span
          aria-hidden
          className="bg-paper-sunken text-ink-muted flex size-10 shrink-0 items-center justify-center rounded-full font-bold"
        >
          {initials}
        </span>

        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex items-center gap-1.5 font-bold">
            <span className="truncate">{athlete.display_name}</span>
            {athlete.verified_count > 0 && <VerifiedSeal className="size-[18px]" />}
          </span>
          <span className="text-ink-muted label mt-0.5 block truncate">
            @{athlete.handle}
            {meta && <> · {meta}</>}
          </span>
          {athlete.positions.length > 0 && (
            <span className="text-ink-muted label mt-0.5 block truncate">
              {athlete.positions.join(" / ")}
            </span>
          )}
        </span>

        <span className="btn-pill min-h-8 shrink-0 px-4 text-sm">View</span>
      </Link>
    </li>
  );
}

function Pager({
  page,
  hasMore,
  params,
}: {
  page: number;
  hasMore: boolean;
  params: Filters;
}) {
  if (page === 1 && !hasMore) return null;

  const query = (target: number) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.sport) search.set("sport", params.sport);
    if (params.level) search.set("level", params.level);
    if (params.gradYear) search.set("class", String(params.gradYear));
    if (params.region) search.set("state", params.region);
    if (params.verifiedOnly) search.set("verified", "1");
    if (target > 1) search.set("page", String(target));
    return `/search?${search.toString()}`;
  };

  return (
    <nav aria-label="Pagination" className="flex justify-between px-4 py-4">
      {page > 1 ? (
        <Link href={query(page - 1)} className="btn-outline min-h-9 px-5 text-sm">
          Previous
        </Link>
      ) : (
        <span />
      )}

      {hasMore && (
        <Link href={query(page + 1)} className="btn-outline min-h-9 px-5 text-sm">
          Next
        </Link>
      )}
    </nav>
  );
}

/** X's empty-state block: bold display line, one muted sentence. */
function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-sm px-8 py-14">
      <p className="text-display font-display leading-tight">{title}</p>
      <p className="text-ink-muted mt-2">{children}</p>
    </div>
  );
}

function str(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function int(value: string | string[] | undefined): number | null {
  const parsed = Number(str(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
