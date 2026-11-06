import type { CoachContact, FilmClip, RecordEntry } from "@/lib/database.types";
import {
  addAchievement,
  addCoach,
  addFilm,
  deleteAchievement,
  deleteCoach,
  deleteFilm,
  featureFilm,
  togglePinned,
  updateAchievement,
} from "@/lib/actions/resume";
import { EditorForm } from "@/components/editor/EditorForm";
import { EditorSection, Panel } from "@/components/editor/ProfileSections";
import { VerificationMark } from "@/components/record/VerificationMark";
import { Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { Unverified } from "@/components/ui/marks";
import { canPinAnother, MAX_PINNED } from "@/lib/data/rules";
import type { VerificationRequest } from "@/lib/data/types";
import { latestToday } from "@/lib/dates";
import { KIND_OPTIONS, kindLabel, recordDate } from "@/lib/format";
import { providerLabel } from "@/lib/film";
import { verifyUrl } from "@/lib/site";

import { CopyButton } from "./CopyButton";
import { RequestVerification } from "./RequestVerification";

/**
 * The record half of the editor: entries, film, references. Every row action
 * is a real button — a 40px bordered target, never a bare text link — and
 * posts straight to a Server Action, so the rows need no client JavaScript.
 * Editing and verification requests fold out of a row with <details>.
 */

function RowAction({
  action,
  id,
  label,
  destructive = false,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  destructive?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={`btn-row ${destructive ? "btn-row-danger" : ""}`}>
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

function EntryFields({ entry }: { entry?: RecordEntry }) {
  return (
    <>
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
        <Field label="Mark" hint="As the sport writes it: 53.94, 6-08.25, 58 rec · 912 yds">
          <TextInput name="value_display" defaultValue={entry?.value_display ?? ""} maxLength={20} />
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
}: {
  entries: RecordEntry[];
  coaches: CoachContact[];
  requests?: VerificationRequest[];
}) {
  // A pending request's link lives on the row, rendered from the server, so
  // it is there the moment the request is made and on every visit after.
  const pendingByEntry = new Map(requests.filter((r) => r.status === "pending").map((r) => [r.achievement_id, r]));
  const coachById = new Map(coaches.map((c) => [c.id, c]));
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
            const pending = pendingByEntry.get(entry.id);
            return (
              <li key={entry.id} className="flex flex-wrap items-start gap-x-5 gap-y-4" style={{ padding: "var(--feature-pad)" }}>
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
                      <EntryFields entry={entry} />
                    </EditorForm>
                  </Disclosure>
                  {(entry.verification === "unverified" || entry.verification === "disputed") && (
                    <Disclosure summary="Request verification">
                      <RequestVerification entryId={entry.id} coaches={coaches} />
                    </Disclosure>
                  )}
                  <RowAction action={deleteAchievement} id={entry.id} label="Delete" destructive />
                </div>

                {entry.verification === "submitted" && pending && (
                  <div className="flex basis-full flex-wrap items-center gap-3 border-t border-rule pt-4" role="status">
                    <span className="text-sm text-ink-muted">
                      Sent to {coachById.get(pending.coach_contact_id)?.name ?? "your coach"} — send them this link:
                    </span>
                    <code className="max-w-full truncate border border-rule bg-paper-sunken px-2 py-1.5 text-sm text-ink-muted">
                      {verifyUrl(pending.token)}
                    </code>
                    <CopyButton value={verifyUrl(pending.token)} label="Copy link" className="btn-row" />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <AddPanel title="Add an entry">
        <EditorForm action={addAchievement} submitLabel="Add entry">
          <EntryFields />
        </EditorForm>
      </AddPanel>
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------
// Film
// ---------------------------------------------------------------------------

export function FilmSection({ clips }: { clips: FilmClip[] }) {
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
          {clips.map((clip) => (
            <li key={clip.id} className="flex flex-wrap items-center gap-x-5 gap-y-3" style={{ padding: "var(--feature-pad)" }}>
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-lg font-bold">
                  {clip.title}
                  {clip.is_featured && <span className="ml-3 text-sm font-normal text-ink-muted">Featured</span>}
                </p>
                <p className="mt-0.5 truncate text-sm text-ink-muted">
                  {[providerLabel(clip.provider) ?? "Link", clip.season].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!clip.is_featured && <RowAction action={featureFilm} id={clip.id} label="Feature" />}
                <RowAction action={deleteFilm} id={clip.id} label="Delete" destructive />
              </div>
            </li>
          ))}
        </ol>
      )}

      <AddPanel title="Add a clip">
        <EditorForm action={addFilm} submitLabel="Add clip">
          <Field label="Title" hint="“Junior season highlights”, “Full game vs. Central”">
            <TextInput name="title" required minLength={3} maxLength={120} />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Link">
              <TextInput name="url" type="url" required placeholder="https://" />
            </Field>

            <Field label="Season">
              <TextInput name="season" maxLength={40} placeholder="2026" />
            </Field>
          </div>
        </EditorForm>
      </AddPanel>
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------
// Coach references
// ---------------------------------------------------------------------------

export function CoachSection({ coaches }: { coaches: CoachContact[] }) {
  return (
    <EditorSection
      id="references"
      title="References"
      count={coaches.length}
      lede="The coach a recruiter calls — and the person who verifies your entries. Ask before you list someone; their details show only while your resume is public and open to recruiting."
    >
      {coaches.length === 0 ? (
        <Empty>No references yet. You need at least one coach here before you can request verification.</Empty>
      ) : (
        <ol className="panel divide-y divide-rule">
          {coaches.map((coach) => (
            <li key={coach.id} className="flex flex-wrap items-center gap-x-5 gap-y-3" style={{ padding: "var(--feature-pad)" }}>
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-lg font-bold">{coach.name}</p>
                <p className="mt-0.5 truncate text-sm text-ink-muted">
                  {[coach.role, coach.org_name, coach.email ?? coach.phone].filter(Boolean).join(" · ")}
                </p>
              </div>

              <RowAction action={deleteCoach} id={coach.id} label="Delete" destructive />
            </li>
          ))}
        </ol>
      )}

      <AddPanel title="Add a reference">
        <EditorForm action={addCoach} submitLabel="Add reference">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Name">
              <TextInput name="name" required minLength={2} maxLength={80} />
            </Field>

            <Field label="Role">
              <TextInput name="role" maxLength={80} placeholder="Head Coach" />
            </Field>

            <Field label="School or club">
              <TextInput name="org_name" maxLength={120} />
            </Field>

            <Field label="Email">
              <TextInput name="email" type="email" />
            </Field>

            <Field label="Phone">
              <TextInput name="phone" type="tel" maxLength={25} />
            </Field>
          </div>
        </EditorForm>
      </AddPanel>
    </EditorSection>
  );
}
