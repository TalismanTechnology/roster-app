import type { CoachContact, FilmClip, RecordEntry } from "@/lib/database.types";
import {
  addAchievement,
  addCoach,
  addFilm,
  deleteAchievement,
  deleteCoach,
  deleteFilm,
  featureFilm,
  moveFilm,
  toggleCoachVisible,
  togglePinned,
  updateAchievement,
  updateCoach,
  updateFilm,
} from "@/lib/actions/resume";
import { EditorForm } from "@/components/editor/EditorForm";
import { EditorSection, Panel } from "@/components/editor/ProfileSections";
import { VerificationMark } from "@/components/record/VerificationMark";
import { Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { Unverified } from "@/components/ui/marks";
import { canPinAnother, isLiveRequest, MAX_PINNED } from "@/lib/data/rules";
import type { VerificationRequest } from "@/lib/data/types";
import { latestToday } from "@/lib/dates";
import { KIND_OPTIONS, kindLabel, recordDate } from "@/lib/format";
import { providerLabel } from "@/lib/film";
import { eventsFor, formatMeasurable, MARK_UNITS } from "@/lib/sport-events";

import { ConfirmDelete } from "./ConfirmDelete";
import { EventPicker } from "./EventPicker";
import { RequestVerification } from "./RequestVerification";

/**
 * The record half of the editor: entries, film, references. Every row action
 * is a real button — a 40px bordered target, never a bare text link — and
 * posts straight to a Server Action, so the rows need no client JavaScript
 * beyond Delete, which asks twice (ConfirmDelete). Editing and verification
 * requests fold out of a row with <details>.
 */

function RowAction({
  action,
  id,
  label,
  extra,
  ariaLabel,
  disabled = false,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  /** More hidden fields, e.g. a direction. */
  extra?: Record<string, string>;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {extra && Object.entries(extra).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <button type="submit" className="btn-row disabled:cursor-not-allowed disabled:opacity-40" aria-label={ariaLabel} disabled={disabled}>
        {label}
      </button>
    </form>
  );
}

function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group contents">
      <summary className="btn-row list-none [&::-webkit-details-marker]:hidden group-open:border-ink group-open:bg-wash">{summary}</summary>
      <div className="basis-full border-t border-rule pt-5">{children}</div>
    </details>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel">
      <p className="text-ink-muted" style={{ padding: "var(--feature-pad)" }}>
        {children}
      </p>
    </div>
  );
}

function AddPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="mt-8">
      <h3 className="font-display text-display-sm">{title}</h3>
      <div className="mt-5">{children}</div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Record entries
// ---------------------------------------------------------------------------

function EntryFields({ entry, sport }: { entry?: RecordEntry; sport: string | null }) {
  const events = eventsFor(entry?.sport ?? sport);
  const initialEvent = entry ? (events.find((e) => e.name === entry.title && e.unit === entry.unit)?.slug ?? "") : "";
  // A unit from before the templates ("s") stays selectable, so saving an
  // untouched form never rewrites it — that would clear a verified badge.
  const units: string[] = entry?.unit && !(MARK_UNITS as readonly string[]).includes(entry.unit) ? [...MARK_UNITS, entry.unit] : [...MARK_UNITS];
  return (
    <>
      <EventPicker events={events} initial={initialEvent} />

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Type">
          <Select name="kind" defaultValue={entry?.kind ?? "personal_record"} required>
            {KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Date">
          <TextInput name="achieved_on" type="date" max={latestToday()} defaultValue={entry?.achieved_on ?? ""} required />
        </Field>
      </div>

      <Field label="Title" hint="“400m Personal Best”, “All-Conference First Team”">
        <TextInput name="title" defaultValue={entry?.title ?? ""} required minLength={3} maxLength={120} />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Mark" hint="As the sport writes it: 53.94, 4:12.50, 6-08.25, 58 rec · 912 yds">
          <TextInput name="value_display" defaultValue={entry?.value_display ?? ""} maxLength={20} />
        </Field>

        <Field label="Unit" hint="With a unit, a single mark is stored as a number recruiters can compare.">
          <Select name="unit" defaultValue={entry?.unit ?? ""}>
            <option value="">None</option>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Competition">
          <TextInput name="competition" defaultValue={entry?.competition ?? ""} maxLength={120} />
        </Field>

        <Field label="Placement">
          <TextInput name="placement" type="number" min={1} defaultValue={entry?.placement ?? ""} />
        </Field>

        <Field label="Field size" hint="Out of how many">
          <TextInput name="field_size" type="number" min={1} defaultValue={entry?.field_size ?? ""} />
        </Field>

        <Field label="Location">
          <TextInput name="location" defaultValue={entry?.location ?? ""} maxLength={120} />
        </Field>
      </div>

      <Field label="Detail">
        <TextArea name="detail" defaultValue={entry?.detail ?? ""} maxLength={500} rows={2} />
      </Field>
    </>
  );
}

export function RecordSection({
  entries,
  coaches,
  requests = [],
  sport = null,
}: {
  entries: RecordEntry[];
  coaches: CoachContact[];
  requests?: VerificationRequest[];
  /** The athlete's primary sport, for the event picker. */
  sport?: string | null;
}) {
  // `requests` is newest first, so the first match per entry wins. The raw
  // link is never here — only a hash is stored; see RequestVerification.
  const pendingByEntry = new Map<string, VerificationRequest>();
  const latestByEntry = new Map<string, VerificationRequest>();
  for (const r of requests) {
    if (r.status === "pending" && !pendingByEntry.has(r.achievement_id)) pendingByEntry.set(r.achievement_id, r);
    if (r.status !== "expired" && !latestByEntry.has(r.achievement_id)) latestByEntry.set(r.achievement_id, r);
  }
  const canPin = canPinAnother(entries);

  return (
    <EditorSection
      id="record"
      title="The record"
      count={entries.length}
      lede="Every PR, result, award, and honor. Pin the three that matter most — they lead your resume — then send each entry to the coach who saw it. Editing a verified entry clears its badge."
    >
      {entries.length === 0 ? (
        <Empty>Nothing on the record yet. Add the first entry below.</Empty>
      ) : (
        <ol className="panel divide-y divide-rule">
          {entries.map((entry) => {
            const pending = pendingByEntry.get(entry.id) ?? null;
            return (
              <li key={entry.id} id={`entry-${entry.id}`} className="flex flex-wrap items-start gap-x-5 gap-y-4" style={{ padding: "var(--feature-pad)" }}>
                <time dateTime={entry.achieved_on} className="w-16 shrink-0 pt-1 text-sm text-ink-muted" data-numeric>
                  {recordDate(entry.achieved_on)}
                </time>

                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-lg font-bold">{entry.title}</span>
                    {entry.value_display && (
                      <span className="font-display text-lg" data-numeric>
                        {entry.value_display}
                        {entry.unit && <span className="ml-0.5 text-sm font-normal text-ink-muted">{entry.unit}</span>}
                      </span>
                    )}
                    {entry.value_numeric !== null && entry.unit && (
                      <span className="label font-mono text-ink-subtle" title="Stored as a comparable number">
                        [ {formatMeasurable(entry.value_numeric, entry.unit)} ]
                      </span>
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
                    {kindLabel(entry.kind)}
                    {entry.is_pinned && <span>· Pinned</span>}
                    {entry.verification === "unverified" && (
                      <span className="flex items-center gap-1">
                        · <Unverified /> Self-reported
                      </span>
                    )}
                    {entry.verification === "verified" && entry.verified_by && <span>· Verified by {entry.verified_by}</span>}
                  </p>
                </div>

                <VerificationMark state={entry.verification} className="mt-1.5" />

                <div className="flex basis-full flex-wrap items-center gap-2">
                  {entry.is_pinned || canPin ? (
                    <RowAction action={togglePinned} id={entry.id} label={entry.is_pinned ? "Unpin" : "Pin"} />
                  ) : (
                    <button type="button" className="btn-row cursor-not-allowed opacity-40" disabled title={`${MAX_PINNED} entries are pinned. Unpin one first.`}>
                      Pin
                    </button>
                  )}
                  <Disclosure summary="Edit">
                    <EditorForm action={updateAchievement} submitLabel="Save entry" compact>
                      <input type="hidden" name="id" value={entry.id} />
                      <EntryFields entry={entry} sport={sport} />
                    </EditorForm>
                  </Disclosure>
                  {/* Rendered in every state so its one-time link survives the refresh. */}
                  <RequestVerification
                    entryId={entry.id}
                    verification={entry.verification}
                    coaches={coaches}
                    pending={pending}
                    pendingIsLive={pending ? isLiveRequest(pending) : false}
                    latest={latestByEntry.get(entry.id) ?? null}
                  />
                  <ConfirmDelete action={deleteAchievement} id={entry.id} what="entry" />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <AddPanel title="Add an entry">
        <EditorForm action={addAchievement} submitLabel="Add entry">
          <EntryFields sport={sport} />
        </EditorForm>
      </AddPanel>
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------
// Film
// ---------------------------------------------------------------------------

function FilmFields({ clip }: { clip?: FilmClip }) {
  return (
    <>
      <Field label="Title" hint="“Junior season highlights”, “Full game vs. Central”">
        <TextInput name="title" defaultValue={clip?.title ?? ""} required minLength={3} maxLength={120} />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Link">
          <TextInput name="url" type="url" defaultValue={clip?.url ?? ""} required placeholder="https://" />
        </Field>

        <Field label="Season">
          <TextInput name="season" defaultValue={clip?.season ?? ""} maxLength={40} placeholder="2026" />
        </Field>
      </div>
    </>
  );
}

export function FilmSection({ clips: unordered }: { clips: FilmClip[] }) {
  // The athlete's own order (#56), not the featured-first order the resume
  // reads in: Up and Down move a clip through this list.
  const clips = [...unordered].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  return (
    <EditorSection
      id="film"
      title="Film"
      count={clips.length}
      lede="Paste YouTube, Vimeo, or Hudl links. The featured clip leads your resume; label the rest so a coach can pick without playing all of them."
    >
      {clips.length === 0 ? (
        <Empty>No film yet. A highlight reel is the first thing most recruiters open.</Empty>
      ) : (
        <ol className="panel divide-y divide-rule">
          {clips.map((clip, i) => (
            <li key={clip.id} className="flex flex-wrap items-center gap-x-5 gap-y-3" style={{ padding: "var(--feature-pad)" }}>
              <span className="label w-6 shrink-0 font-mono text-ink-subtle" data-numeric>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-lg font-bold">
                  {clip.title}
                  {clip.is_featured && <span className="ml-3 text-sm font-normal text-ink-muted">Featured</span>}
                </p>
                <p className="mt-0.5 truncate text-sm text-ink-muted">
                  {[providerLabel(clip.provider) ?? "Link", clip.season].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="flex basis-full flex-wrap items-center gap-2">
                <RowAction action={moveFilm} id={clip.id} label="↑" extra={{ direction: "up" }} ariaLabel={`Move ${clip.title} up`} disabled={i === 0} />
                <RowAction action={moveFilm} id={clip.id} label="↓" extra={{ direction: "down" }} ariaLabel={`Move ${clip.title} down`} disabled={i === clips.length - 1} />
                {!clip.is_featured && <RowAction action={featureFilm} id={clip.id} label="Feature" />}
                <Disclosure summary="Edit">
                  <EditorForm action={updateFilm} submitLabel="Save clip" compact>
                    <input type="hidden" name="id" value={clip.id} />
                    <FilmFields clip={clip} />
                  </EditorForm>
                </Disclosure>
                <ConfirmDelete action={deleteFilm} id={clip.id} what="clip" />
              </div>
            </li>
          ))}
        </ol>
      )}

      <AddPanel title="Add a clip">
        <EditorForm action={addFilm} submitLabel="Add clip">
          <FilmFields />
        </EditorForm>
      </AddPanel>
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------
// Coach references
// ---------------------------------------------------------------------------

function CoachFields({ coach }: { coach?: CoachContact }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Field label="Name">
        <TextInput name="name" defaultValue={coach?.name ?? ""} required minLength={2} maxLength={80} />
      </Field>

      <Field label="Role">
        <TextInput name="role" defaultValue={coach?.role ?? ""} maxLength={80} placeholder="Head Coach" />
      </Field>

      <Field label="School or club">
        <TextInput name="org_name" defaultValue={coach?.org_name ?? ""} maxLength={120} />
      </Field>

      <Field label="Email">
        <TextInput name="email" type="email" defaultValue={coach?.email ?? ""} />
      </Field>

      <Field label="Phone">
        <TextInput name="phone" type="tel" defaultValue={coach?.phone ?? ""} maxLength={25} />
      </Field>
    </div>
  );
}

export function CoachSection({ coaches }: { coaches: CoachContact[] }) {
  return (
    <EditorSection
      id="references"
      title="References"
      count={coaches.length}
      lede="The coach a recruiter calls — and the person who verifies your entries. Ask before you list someone; their details show only while your resume is public and open to recruiting. Hide keeps a reference off your resume but still lets them verify."
    >
      {coaches.length === 0 ? (
        <Empty>No references yet. You need at least one coach here before you can request verification.</Empty>
      ) : (
        <ol className="panel divide-y divide-rule">
          {coaches.map((coach) => (
            <li key={coach.id} className="flex flex-wrap items-center gap-x-5 gap-y-3" style={{ padding: "var(--feature-pad)" }}>
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-lg font-bold">
                  {coach.name}
                  {!coach.is_visible && <span className="label ml-3 font-mono font-normal text-ink-subtle">[ Hidden ]</span>}
                </p>
                <p className="mt-0.5 truncate text-sm text-ink-muted">
                  {[coach.role, coach.org_name, coach.email ?? coach.phone].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="flex basis-full flex-wrap items-center gap-2">
                <RowAction
                  action={toggleCoachVisible}
                  id={coach.id}
                  label={coach.is_visible ? "Hide" : "Show"}
                  ariaLabel={coach.is_visible ? `Hide ${coach.name} from your resume` : `Show ${coach.name} on your resume`}
                />
                <Disclosure summary="Edit">
                  <EditorForm action={updateCoach} submitLabel="Save reference" compact>
                    <input type="hidden" name="id" value={coach.id} />
                    <CoachFields coach={coach} />
                  </EditorForm>
                </Disclosure>
                <ConfirmDelete action={deleteCoach} id={coach.id} what="reference" />
              </div>
            </li>
          ))}
        </ol>
      )}

      <AddPanel title="Add a reference">
        <EditorForm action={addCoach} submitLabel="Add reference">
          <CoachFields />
        </EditorForm>
      </AddPanel>
    </EditorSection>
  );
}
