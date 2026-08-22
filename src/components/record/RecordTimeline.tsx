import type { RecordEntry } from "@/lib/database.types";
import { entryContext, fullDate, kindLabel, placementLabel, recordDate } from "@/lib/format";

import { VerificationMark } from "./VerificationMark";

/**
 * The living record.
 *
 * Laid out as a ruled document rather than a stack of cards: a recruiter scans
 * this the way they scan a results sheet — down the date column, across to the
 * mark. Cards would put a box around every line and destroy that column.
 */
export function RecordTimeline({ entries }: { entries: RecordEntry[] }) {
  if (entries.length === 0) {
    return <EmptyRecord />;
  }

  const pinned = entries.filter((entry) => entry.is_pinned);
  const timeline = entries.filter((entry) => !entry.is_pinned);

  return (
    <div className="flex flex-col gap-(--space-section)">
      {pinned.length > 0 && (
        <RecordSection title="Selected" count={pinned.length}>
          {pinned.map((entry) => (
            <RecordRow key={entry.id} entry={entry} />
          ))}
        </RecordSection>
      )}

      {timeline.length > 0 && (
        <RecordSection title="The record" count={timeline.length}>
          {timeline.map((entry) => (
            <RecordRow key={entry.id} entry={entry} />
          ))}
        </RecordSection>
      )}
    </div>
  );
}

function RecordSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`section-${title}`}>
      <header className="flex items-baseline justify-between border-b border-rule-strong pb-3">
        <h2 id={`section-${title}`} className="label text-ink">
          {title}
        </h2>
        <span className="label text-ink-subtle" data-numeric>
          {count} {count === 1 ? "entry" : "entries"}
        </span>
      </header>

      <ol className="contents">{children}</ol>
    </section>
  );
}

function RecordRow({ entry }: { entry: RecordEntry }) {
  const context = entryContext(entry);
  const placement = placementLabel(entry);

  return (
    <li className="group grid grid-cols-[4.5rem_1fr] items-baseline gap-x-4 border-b border-rule py-5 sm:grid-cols-[6.5rem_1fr_auto] sm:gap-x-8">
      {/* Date column. Tabular figures keep this a true column down the page. */}
      <time
        dateTime={entry.achieved_on}
        title={fullDate(entry.achieved_on)}
        className="text-ink-subtle text-sm"
      >
        {recordDate(entry.achieved_on)}
      </time>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h3 className="text-ink text-lg leading-snug font-medium">{entry.title}</h3>
          <span className="label text-ink-subtle">{kindLabel(entry.kind)}</span>
        </div>

        {context && <p className="text-ink-muted mt-1 text-sm">{context}</p>}

        {entry.detail && (
          <p className="text-ink-muted mt-2 max-w-prose text-sm leading-relaxed">{entry.detail}</p>
        )}

      </div>

      {/* Rendered once and repositioned by the grid, rather than duplicated per
          breakpoint with one copy hidden. A `sm:hidden` twin is still in the
          accessibility tree, so every entry would be announced twice. Below
          `sm` this wraps under the title; from `sm` up it is the third column. */}
      <div className="col-start-2 mt-3 flex flex-wrap items-center gap-3 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:flex-nowrap sm:gap-4 sm:justify-self-end">
        <EntryValue entry={entry} placement={placement} />
        <VerificationMark state={entry.verification} />
      </div>
    </li>
  );
}

function EntryValue({
  entry,
  placement,
}: {
  entry: RecordEntry;
  placement: string | null;
}) {
  if (entry.value_display) {
    return (
      <span className="text-ink font-display text-display-sm leading-none" data-numeric>
        {entry.value_display}
        {entry.unit && (
          <span className="text-ink-subtle ml-1 align-baseline text-sm font-sans">
            {entry.unit}
          </span>
        )}
      </span>
    );
  }

  if (placement) {
    return (
      <span className="text-ink font-display text-display-sm leading-none" data-numeric>
        {placement}
      </span>
    );
  }

  return null;
}

function EmptyRecord() {
  return (
    <div className="border-rule border-t py-16 text-center">
      <p className="text-ink font-display text-display-sm">Nothing on the record yet.</p>
      <p className="text-ink-muted mx-auto mt-3 max-w-sm text-sm leading-relaxed">
        Every PR, win, award, and commitment you add becomes part of a permanent, verifiable
        history.
      </p>
    </div>
  );
}
