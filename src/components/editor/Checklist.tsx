import Link from "next/link";

import { Verified } from "@/components/ui/marks";
import type { CoachContact, FilmClip, Profile, RecordEntry } from "@/lib/database.types";

export type SectionId = "identity" | "record" | "film" | "academics" | "references" | "contact" | "visibility" | "requests";

export type ChecklistItem = {
  /** Unique per item; two items can live in one section. */
  key: string;
  /** The section that finishes it. */
  id: SectionId;
  label: string;
  isDone: boolean;
  /** What a recruiter is missing while it's not done. */
  why: string;
};

/**
 * What is on the resume and what isn't, as a recruiter would notice. The
 * order is the order a recruiter reads; the first unfinished item is where
 * the editor opens by default.
 */
export function buildChecklist(profile: Profile, entries: RecordEntry[], film: FilmClip[], coaches: CoachContact[]): ChecklistItem[] {
  return [
    {
      key: "identity",
      id: "identity",
      label: "Identity",
      isDone: Boolean(profile.bio && profile.school && profile.positions.length > 0),
      why: "Bio, school, and positions are the first line a recruiter reads.",
    },
    {
      key: "photo",
      id: "identity",
      label: "Photo",
      isDone: Boolean(profile.avatar_url),
      why: "A recruiter remembers a face; a resume without one reads as unfinished.",
    },
    {
      key: "record",
      id: "record",
      label: "Record",
      isDone: entries.length >= 3,
      why: "Three entries is the minimum that reads as a record, not a claim.",
    },
    {
      key: "verified",
      id: "record",
      label: "1+ verified entry",
      isDone: entries.some((e) => e.verification === "verified"),
      why: "One coach's signature makes every other line easier to believe. Send an entry to the coach who saw it.",
    },
    {
      key: "film",
      id: "film",
      label: "Film",
      isDone: film.length > 0,
      why: "A highlight reel is the first thing most recruiters open.",
    },
    {
      key: "academics",
      id: "academics",
      label: "Academics",
      isDone: profile.gpa !== null,
      why: "A coach who can't qualify you academically stops reading.",
    },
    {
      key: "references",
      id: "references",
      label: "References",
      isDone: coaches.length > 0,
      why: "The coach who verifies your entries and takes the recruiter's call.",
    },
    {
      key: "contact",
      id: "contact",
      label: "Contact",
      isDone: Boolean(profile.contact_email),
      why: "Without it a recruiter who likes what they see can't reach you.",
    },
    {
      key: "visibility",
      id: "visibility",
      label: "Visibility",
      isDone: profile.visibility === "public" && profile.is_recruitable,
      why: "Only a public, recruitable resume is listed in search with your contact details.",
    },
  ];
}

/**
 * Only a section's own item steers where the editor opens. The extras —
 * photo, a verified entry — point at a section but never pull the editor
 * back to one the athlete has otherwise finished.
 */
function nextItem(items: ChecklistItem[]): ChecklistItem | undefined {
  return items.find((i) => !i.isDone && i.key === i.id) ?? items.find((i) => !i.isDone);
}

export function firstUnfinished(items: ChecklistItem[]): SectionId {
  return items.find((i) => !i.isDone && i.key === i.id)?.id ?? "record";
}

/** The checklist as a strip: a progress bar, then each item as a link. */
export function Checklist({ items, active }: { items: ChecklistItem[]; active: SectionId }) {
  const done = items.filter((i) => i.isDone).length;
  const pct = Math.round((done / items.length) * 100);
  const next = nextItem(items);
  // Two items can share a section; only the first of them is "current".
  const currentKey = items.find((i) => i.id === active)?.key;

  return (
    <section aria-label="Resume checklist" className="panel">
      <div className="flex flex-col gap-4" style={{ padding: "var(--feature-pad)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="font-display text-display-sm">
            {pct === 100 ? "Your resume is complete." : `${done} of ${items.length} done.`}
          </p>
          {next ? (
            <p className="text-sm text-ink-muted">
              Next:{" "}
              <Link href={`/resume?section=${next.id}`} className="tap-inline font-bold text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
                {next.label}
              </Link>{" "}
              — {next.why}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">Keep it current: new results, new film, every season.</p>
          )}
        </div>

        <div className="h-1.5 w-full overflow-hidden bg-paper-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Completeness">
          <div className="h-full bg-ink transition-[width] duration-(--duration-normal)" style={{ width: `${pct}%` }} />
        </div>

        <ol className="-mx-1 flex flex-wrap gap-1">
          {items.map((i) => (
            <li key={i.key}>
              <Link
                href={`/resume?section=${i.id}`}
                aria-current={i.key === currentKey ? "page" : undefined}
                className={`flex min-h-10 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold transition-colors sm:min-h-0 sm:px-2.5 ${
                  i.id === active ? "bg-ink text-paper" : "text-ink-muted hover:bg-wash hover:text-ink"
                }`}
              >
                {i.isDone ? (
                  <Verified className={i.id === active ? "text-paper" : ""} label="Done" />
                ) : (
                  <span className="size-[1em] rounded-full border border-current opacity-60" aria-label="Not done" role="img" />
                )}
                {i.label}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
