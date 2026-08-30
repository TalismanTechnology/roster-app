import type { Metadata } from "next";
import Link from "next/link";

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
    <main className="mx-auto w-full max-w-3xl px-(--space-gutter) py-(--space-section)">
      <header>
        <p className="label text-ink-subtle">Roster</p>
        <h1 className="font-display text-display mt-2 leading-[0.95] tracking-tight">
          Find athletes
        </h1>
      </header>

      <SearchForm
        defaults={{ q, sport, level, gradYear, region, verifiedOnly }}
      />

      <section aria-label="Results" className="mt-10">
        <header className="border-rule-strong flex items-baseline justify-between border-b pb-3">
          <h2 className="label text-ink">Results</h2>
          <span className="label text-ink-subtle" data-numeric>
            {athletes === null
              ? "—"
              : `${athletes.length}${athletes.length === PAGE_SIZE ? "+" : ""}`}
          </span>
        </header>

        {athletes === null ? (
          <Notice>Search comes online once the database is connected.</Notice>
        ) : athletes.length === 0 ? (
          <Notice>
            No one matches those filters yet. Loosen one — or invite the athlete
            you were looking for.
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
    </main>
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
    "w-full border-0 border-b border-rule bg-transparent px-0 py-2 text-base text-ink " +
    "placeholder:text-ink-subtle focus:border-ink focus:outline-none";

  return (
    <form method="GET" className="mt-8 grid grid-cols-2 items-end gap-x-6 gap-y-5 sm:grid-cols-4">
      <label className="col-span-2 block sm:col-span-4">
        <span className="label text-ink-muted">Name or handle</span>
        <input
          type="search"
          name="q"
          defaultValue={defaults.q ?? ""}
          placeholder="Ava Reyes"
          className={fieldClasses}
        />
      </label>

      <label className="block">
        <span className="label text-ink-muted">Sport</span>
        <input
          name="sport"
          defaultValue={defaults.sport ?? ""}
          placeholder="track_field"
          className={fieldClasses}
        />
      </label>

      <label className="block">
        <span className="label text-ink-muted">Level</span>
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
        <span className="label text-ink-muted">Class of</span>
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
        <span className="label text-ink-muted">State</span>
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
          className="accent-ink size-4"
        />
        <span className="text-sm">Verified records only</span>
      </label>

      <button
        type="submit"
        className="bg-ink text-paper hover:bg-ink-muted flex h-11 cursor-pointer items-center justify-center rounded-[2px] px-6 text-sm font-medium transition-colors duration-(--duration-fast)"
      >
        Search
      </button>
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

  return (
    <li className="border-rule border-b">
      <Link
        href={`/${athlete.handle}`}
        className="group grid cursor-pointer grid-cols-[1fr_auto] items-baseline gap-x-6 py-5"
      >
        <div className="min-w-0">
          <p className="text-ink group-hover:text-ink-muted text-lg font-medium transition-colors duration-(--duration-fast)">
            {athlete.display_name}
          </p>
          {meta && <p className="text-ink-muted mt-1 truncate text-sm">{meta}</p>}
          {athlete.positions.length > 0 && (
            <p className="label text-ink-subtle mt-1.5">{athlete.positions.join(" / ")}</p>
          )}
        </div>

        {athlete.verified_count > 0 && (
          <p className="text-right">
            <span className="font-display text-display-sm text-verified leading-none" data-numeric>
              {athlete.verified_count}
            </span>
            <span className="label text-ink-subtle mt-1 block">verified</span>
          </p>
        )}
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
    <nav aria-label="Pagination" className="mt-8 flex justify-between">
      {page > 1 ? (
        <Link href={query(page - 1)} className="label text-ink cursor-pointer underline underline-offset-4">
          ← Previous
        </Link>
      ) : (
        <span />
      )}

      {hasMore && (
        <Link href={query(page + 1)} className="label text-ink cursor-pointer underline underline-offset-4">
          Next →
        </Link>
      )}
    </nav>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-ink-muted mx-auto max-w-sm py-16 text-center text-sm leading-relaxed">
      {children}
    </p>
  );
}

function str(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function int(value: string | string[] | undefined): number | null {
  const parsed = Number(str(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
