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
import { EditorSection } from "@/components/editor/ProfileSections";
import { VerificationMark } from "@/components/record/VerificationMark";
import { Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { Unverified } from "@/components/ui/marks";
import { KIND_OPTIONS, kindLabel, recordDate } from "@/lib/format";
import { providerLabel } from "@/lib/film";

import type { VerificationRequest } from "@/lib/data/types";

import { CopyButton } from "./CopyButton";
import { RequestVerification } from "./RequestVerification";

/**
 * The record half of the editor: entries, film, references. Lists render with
 * inline single-button forms — delete, pin, feature — that post straight to a
 * Server Action, so the rows need no client JavaScript at all. Editing and
 * verification requests fold out of a row with <details>, native and
 * keyboard-reachable.
 */

function InlineAction({
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
      <button
        type="submit"
        className={`label cursor-pointer underline decoration-transparent underline-offset-4 transition-colors duration-(--duration-fast) ${
          destructive ? "text-ink-subtle hover:text-disputed hover:decoration-disputed" : "text-ink-muted hover:text-ink hover:decoration-ink"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="label cursor-pointer list-none text-ink-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-ink [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="mt-4 border-l border-rule pl-4">{children}</div>
    </details>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mb-6 border-y border-rule py-6 text-sm text-ink-muted">{children}</p>;
}

// ---------------------------------------------------------------------------
// Record entries
// ---------------------------------------------------------------------------

function EntryFields({ entry }: { entry?: RecordEntry }) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
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
          <TextInput name="achieved_on" type="date" defaultValue={entry?.achieved_on ?? ""} required />
        </Field>
      </div>

      <Field label="Title" hint="“400m Personal Best”, “All-Conference First Team”">
        <TextInput name="title" defaultValue={entry?.title ?? ""} required minLength={3} maxLength={120} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
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
  // it is there the moment the request is made and on every visit after —
  // not only inside the client state of the form that created it.
  const pendingByEntry = new Map(requests.filter((r) => r.status === "pending").map((r) => [r.achievement_id, r]));
  const coachById = new Map(coaches.map((c) => [c.id, c]));

  return (
    <EditorSection
      id="record"
      title="The record"
      count={entries.length}
      lede="Every PR, result, award, and honor. Add it, pin the three that matter, then send each one to the coach who saw it."
    >
      {entries.length === 0 ? (
        <Empty>Nothing on the record yet. The first entry is below.</Empty>
      ) : (
        <ol className="mb-8 border-t border-rule">
          {entries.map((entry) => (
            <li key={entry.id} className="border-b border-rule py-4">
              <div className="flex items-start gap-4">
                <time dateTime={entry.achieved_on} className="label w-16 shrink-0 pt-1 text-ink-subtle" data-numeric>
                  {recordDate(entry.achieved_on)}
                </time>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold">{entry.title}</span>
                    {entry.value_display && (
                      <span className="font-display" data-numeric>
                        {entry.value_display}
                        {entry.unit && <span className="ml-0.5 text-sm font-normal text-ink-muted">{entry.unit}</span>}
                      </span>
                    )}
                  </p>
                  <p className="label mt-0.5 flex flex-wrap items-center gap-x-2 text-ink-subtle">
                    {kindLabel(entry.kind)}
                    {entry.is_pinned && <span className="text-ink-muted">· Pinned</span>}
                    {entry.verification === "unverified" && (
                      <span className="flex items-center gap-1">
                        · <Unverified /> Self-reported
                      </span>
                    )}
                    {entry.verification === "verified" && entry.verified_by && <span>· Verified by {entry.verified_by}</span>}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    <InlineAction action={togglePinned} id={entry.id} label={entry.is_pinned ? "Unpin" : "Pin"} />
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
                    <InlineAction action={deleteAchievement} id={entry.id} label="Delete" destructive />
                  </div>

                  {entry.verification === "submitted" && pendingByEntry.get(entry.id) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-l border-rule pl-4" role="status">
                      <span className="label text-ink-muted">
                        Sent to {coachById.get(pendingByEntry.get(entry.id)!.coach_contact_id)?.name ?? "your coach"} — send them this link:
                      </span>
                      <code className="label max-w-full truncate border border-rule bg-paper-raised/60 px-2 py-1 text-ink-muted">
                        /verify/{pendingByEntry.get(entry.id)!.token}
                      </code>
                      <CopyButton value={`/verify/${pendingByEntry.get(entry.id)!.token}`} label="Copy link" />
                    </div>
                  )}
                </div>

                <VerificationMark state={entry.verification} className="mt-1" />
              </div>
            </li>
          ))}
        </ol>
      )}

      <h3 className="font-bold">Add an entry</h3>
      <div className="mt-4">
        <EditorForm action={addAchievement} submitLabel="Add entry">
          <EntryFields />
        </EditorForm>
      </div>
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
        <ol className="mb-8 border-t border-rule">
          {clips.map((clip) => (
            <li key={clip.id} className="flex items-baseline gap-4 border-b border-rule py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className="font-bold">{clip.title}</span>
                  {clip.is_featured && <span className="label ml-3 text-ink-muted">Featured</span>}
                </p>
                <p className="label mt-1 truncate text-ink-subtle">
                  {[providerLabel(clip.provider) ?? "Link", clip.season].filter(Boolean).join(" · ")}
                </p>
              </div>

              {!clip.is_featured && <InlineAction action={featureFilm} id={clip.id} label="Feature" />}
              <InlineAction action={deleteFilm} id={clip.id} label="Delete" destructive />
            </li>
          ))}
        </ol>
      )}

      <h3 className="font-bold">Add a clip</h3>
      <div className="mt-4">
        <EditorForm action={addFilm} submitLabel="Add clip">
          <Field label="Title" hint="“Junior season highlights”, “Full game vs. Central”">
            <TextInput name="title" required minLength={3} maxLength={120} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Link">
              <TextInput name="url" type="url" required placeholder="https://" />
            </Field>

            <Field label="Season">
              <TextInput name="season" maxLength={40} placeholder="2026" />
            </Field>
          </div>
        </EditorForm>
      </div>
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
        <ol className="mb-8 border-t border-rule">
          {coaches.map((coach) => (
            <li key={coach.id} className="flex items-baseline gap-4 border-b border-rule py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{coach.name}</p>
                <p className="label mt-1 truncate text-ink-subtle">
                  {[coach.role, coach.org_name, coach.email ?? coach.phone].filter(Boolean).join(" · ")}
                </p>
              </div>

              <InlineAction action={deleteCoach} id={coach.id} label="Delete" destructive />
            </li>
          ))}
        </ol>
      )}

      <h3 className="font-bold">Add a reference</h3>
      <div className="mt-4">
        <EditorForm action={addCoach} submitLabel="Add reference">
          <div className="grid gap-5 sm:grid-cols-2">
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
      </div>
    </EditorSection>
  );
}
