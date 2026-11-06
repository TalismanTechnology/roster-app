import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Img } from "@/components/ui/Img";
import { Frame, Verified } from "@/components/ui/marks";
import { getRepository } from "@/lib/data";

import { Section } from "./Section";

const FILTERS = [
  ["Football", "sport=football"],
  ["Class of 2027", "class=2027"],
  ["Texas", "state=TX"],
] as const;

const POINTS = [
  "No account to open a resume",
  "Contact details only when the athlete opts in",
  "Stats, film, academics, references — one page",
];

/** The search, shown with live results from the seeded roster. */
export async function ForCoaches() {
  const repo = await getRepository();
  const results = (await repo.searchAthletes({ sport: "football", gradYear: 2027, region: "TX", pageSize: 3 })).athletes;
  const query = FILTERS.map(([, q]) => q).join("&");

  return (
    <div className="relative">
      <div className="absolute inset-0" aria-hidden>
        <Img id="10" className="absolute inset-0" imgClassName="opacity-90" sizes="100vw" quiet />
        <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/30 to-paper" />
        <div className="absolute inset-0 bg-gradient-to-r from-paper/70 via-transparent to-paper/20" />
      </div>

      <Section
        id="coaches"
        label="For coaches and recruiters"
        title={
          <>
            Search the record, <span className="text-ink-muted">not the hype.</span>
          </>
        }
        flush
        className="z-10"
      >
        <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
          <Frame className="lifted lg:col-span-8">
            <div style={{ padding: "var(--feature-pad)" }}>
              <div className="flex items-center gap-3 border-b border-rule pb-3">
                <svg viewBox="0 0 24 24" className="size-5 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <span className="text-ink-muted">Search athletes</span>
                <kbd className="label ml-auto hidden rounded border border-rule px-1.5 py-0.5 text-ink-subtle sm:inline">/</kbd>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
                {FILTERS.map(([label]) => (
                  <li key={label} className="chip">
                    {label}
                    <span className="text-ink-muted" aria-hidden>×</span>
                  </li>
                ))}
              </ul>
              <ol className="mt-4 divide-y divide-rule border-t border-rule">
                {results.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/${r.handle}`}
                      className="-mx-2 grid grid-cols-[1fr_auto] items-center gap-x-4 px-2 py-3 transition-colors hover:bg-white/5 sm:grid-cols-[1.4fr_1fr_auto]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{r.display_name}</span>
                        <span className="label block truncate text-ink-muted">
                          {r.positions.join(" / ")} · {r.school}
                        </span>
                      </span>
                      <span className="hidden text-sm text-ink-muted sm:block">
                        {r.entry_count} entries
                      </span>
                      <span className="label flex items-center gap-1.5 whitespace-nowrap">
                        <Verified /> {r.verified_count} verified
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
              <p className="label mt-3 text-ink-subtle">Live results from the demo roster. Names are fictional.</p>
            </div>
          </Frame>

          <div className="flex flex-col gap-4 lg:col-span-4">
            <ul className="divide-y divide-rule border-y border-rule">
              {POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 py-3">
                  <Verified className="mt-1" />
                  {p}
                </li>
              ))}
            </ul>
            <Button href={`/search?${query}`} variant="outline" arrow className="mt-2 self-start">
              Run this search
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
