import { PinIcon } from "@/components/shell/icons";
import type { RecordEntry } from "@/lib/database.types";
import { entryContext, fullDate, kindLabel, placementLabel, recordDate } from "@/lib/format";

import { VerificationMark } from "./VerificationMark";

/**
 * The record as a timeline of cells — X's feed grammar. Each entry is a
 * full-width cell with a hairline below and a wash on hover; pinned entries
 * lead with the small "Pinned" marker exactly the way a pinned post does.
 * The date folds into the meta line (a feed carries its timestamps inline;
 * a left-hand date column is a table, and tables don't scroll like feeds).
 */
export function RecordTimeline({ entries }: { entries: RecordEntry[] }) {
  if (entries.length === 0) {
    return <EmptyRecord />;
  }

  const pinned = entries.filter((entry) => entry.is_pinned);
  const timeline = entries.filter((entry) => !entry.is_pinned);

  return (
    <ol>
      {pinned.map((entry) => (
        <RecordCell key={entry.id} entry={entry} isPinned />
      ))}
      {timeline.map((entry) => (
        <RecordCell key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}

function RecordCell({ entry, isPinned = false }: { entry: RecordEntry; isPinned?: boolean }) {
  const context = entryContext(entry);
  const placement = placementLabel(entry);

  return (
    <li className="wash-hover border-rule border-b px-4 py-3">
      {isPinned && (
        <p className="label text-ink-muted mb-1 flex items-center gap-2 font-bold">
          <PinIcon className="size-3.5" />
          Pinned
        </p>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-bold">{entry.title}</h3>

          <p className="text-ink-muted label mt-0.5">
            {kindLabel(entry.kind)}
            {context && <> · {context}</>}
            {" · "}
            <time dateTime={entry.achieved_on} title={fullDate(entry.achieved_on)}>
              {recordDate(entry.achieved_on)}
            </time>
          </p>

          {entry.detail && (
            <p className="text-ink mt-2 leading-normal">{entry.detail}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <EntryValue entry={entry} placement={placement} />
          <VerificationMark state={entry.verification} />
        </div>
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
  const value = entry.value_display ?? placement;

  if (!value) return null;

  return (
    <span className="text-xl font-display" data-numeric>
      {value}
      {entry.value_display && entry.unit && (
        <span className="text-ink-muted ml-0.5 text-sm font-normal">{entry.unit}</span>
      )}
    </span>
  );
}

function EmptyRecord() {
  // X's empty-timeline treatment: a big bold line and one muted sentence,
  // centred in the column with air around it.
  return (
    <div className="mx-auto max-w-sm px-8 py-14">
      <p className="text-display font-display leading-tight">
        Nothing on the record yet.
      </p>
      <p className="text-ink-muted mt-2">
        Every PR, win, award, and commitment added here becomes part of a
        permanent, verifiable history.
      </p>
    </div>
  );
}
