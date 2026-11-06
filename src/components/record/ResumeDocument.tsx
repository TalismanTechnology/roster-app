import type { ReactNode } from "react";

import { Corner, CORNER } from "@/components/ui/marks";
import type { CoachContact, FilmClip, Profile, RecordEntry } from "@/lib/database.types";

import { IdentityBand } from "./IdentityBand";
import {
  AcademicsSection,
  FilmSection,
  hasAcademics,
  Highlights,
  RecordList,
  ReferencesSection,
  SectionHeading,
} from "./RecordSections";

/**
 * The resume, whole. One rendering path shared by `/[handle]` and
 * `/preview`, so what a design review approves is exactly what a recruiter
 * opens. Sections are omitted when empty; the record is always present.
 */
export function ResumeDocument({
  profile,
  entries,
  film,
  coaches,
  isOwner = false,
}: {
  profile: Profile;
  entries: RecordEntry[];
  film: FilmClip[];
  coaches: CoachContact[];
  isOwner?: boolean;
}) {
  const sections = [
    { id: "record", label: "Record", show: true },
    { id: "film", label: "Film", show: film.length > 0 },
    { id: "academics", label: "Academics", show: hasAcademics(profile) },
    { id: "references", label: "References", show: coaches.length > 0 },
  ].filter((s) => s.show);

  return (
    // @container: the document lays itself out by its own width, so it is
    // correct at full page, inside the editor's preview column, and in print.
    <article className="print-resume @container">
      <IdentityBand profile={profile} entries={entries} film={film} isOwner={isOwner} />

      {sections.length > 1 && (
        <nav
          aria-label="Resume sections"
          className="print-hidden bar-blur sticky z-30 border-b border-rule"
          style={{ top: "var(--header-h)", paddingInline: "var(--pad-x)" }}
        >
          <ul className="-mx-3 flex gap-1 overflow-x-auto py-1">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="flex flex-col" style={{ paddingInline: "var(--pad-x)" }}>
        <Block id="record" label="Record" count={entries.length}>
          <Highlights entries={entries} />
          <div className={entries.some((e) => e.is_pinned) ? "mt-8" : ""}>
            <RecordList entries={entries} isOwner={isOwner} />
          </div>
        </Block>

        {film.length > 0 && (
          <Block id="film" label="Film" count={film.length}>
            <FilmSection clips={film} />
          </Block>
        )}

        {hasAcademics(profile) && (
          <Block id="academics" label="Academics">
            <AcademicsSection profile={profile} />
          </Block>
        )}

        {coaches.length > 0 && (
          <Block id="references" label="References" count={coaches.length}>
            <ReferencesSection coaches={coaches} isOwner={isOwner} profile={profile} />
          </Block>
        )}

        <p className="label flex items-center gap-2 py-8 text-ink-subtle">
          <Corner d={CORNER.bl} />
          Verified entries were confirmed by the coach named beside them. Roster — the athlete&rsquo;s resume.
        </p>
      </div>
    </article>
  );
}

function Block({ id, label, count, children }: { id: string; label: string; count?: number; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-[calc(var(--header-h)+3rem)] border-b border-rule last:border-0 print:border-0"
      style={{ paddingBlock: "clamp(2rem, 5vh, 3.5rem)" }}
    >
      <div className="mb-6 flex items-center gap-3">
        <Corner d={CORNER.tl} className="text-ink-muted" />
        <SectionHeading id={id} label={label} count={count} />
      </div>
      {children}
    </section>
  );
}
