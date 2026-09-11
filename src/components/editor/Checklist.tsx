import Link from "next/link";

import type { CoachContact, FilmClip, Profile, RecordEntry } from "@/lib/database.types";

export type SectionId = "identity" | "record" | "film" | "academics" | "references" | "contact" | "visibility" | "requests";

export type ChecklistItem = {
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
      id: "identity",
      label: "Identity",
      isDone: Boolean(profile.bio && profile.school && profile.positions.length > 0),
      why: "Bio, school, and positions are the first line a recruiter reads.",
    },
    {
      id: "record",
      label: "Record",
      isDone: entries.length >= 3,
      why: "Add three results, achievements, or milestones to tell your story.",
    },
    {
      id: "film",
      label: "Film",
      isDone: film.length > 0,
      why: "A highlight reel is the first thing most recruiters open.",
    },
    {
      id: "academics",
      label: "Academics",
      isDone: profile.gpa !== null,
      why: "Help coaches understand your academic fit.",
    },
    {
      id: "references",
      label: "References",
      isDone: coaches.length > 0,
      why: "The coach who verifies your entries and takes the recruiter's call.",
    },
    {
      id: "contact",
      label: "Contact",
      isDone: Boolean(profile.contact_email),
      why: "Without it a recruiter who likes what they see can't reach you.",
    },

  ];
}

export function firstUnfinished(items: ChecklistItem[]): SectionId {
  return items.find((i) => !i.isDone)?.id ?? "record";
}

/** Completeness measures content, independently of publication settings. */
export function Checklist({ items }: { items: ChecklistItem[]; active?: SectionId; pendingRequests?: number }) {
  const done = items.filter(item => item.isDone).length;
  const pct = Math.round(done / items.length * 100);
  const next = items.find(item => !item.isDone);
  return <section className="workspace-checklist" aria-label="Resume completeness"><div><p className="text-sm font-semibold">{done} of {items.length} content sections ready</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Content completeness"><div className="h-full bg-ink" style={{ width: `${pct}%` }} /></div><p className="mt-2 text-xs text-ink-muted">Publishing is your choice and does not affect completeness.</p></div><div>{next ? <><p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Suggested next step</p><Link href={`/resume?section=${next.id}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold">Add {next.label.toLowerCase()} →</Link><p className="text-xs leading-relaxed text-ink-muted">{next.why}</p></> : <p className="text-sm text-ink-muted">Your content is ready. Keep your record current as your season develops.</p>}</div></section>;
}
