import Link from "next/link";
import { EntryFields } from "./EntryFields";
import type { CoachContact, FilmClip, RecordEntry } from "@/lib/database.types";
import {
  addAchievement,
  addCoach,
  addFilm,
  deleteAchievement,
  deleteCoach,
  deleteFilm,
  featureFilm,
  editFilm,
  editCoach,
  togglePinned,
  updateAchievement,
} from "@/lib/actions/resume";
import { EditorForm, RowAction as ActionControl } from "@/components/editor/EditorForm";
import { EditorSection, Panel } from "@/components/editor/ProfileSections";
import { VerificationMark } from "@/components/record/VerificationMark";
import { Field, TextInput } from "@/components/ui/fields";
import { Unverified } from "@/components/ui/marks";
import type { VerificationRequest } from "@/lib/data/types";
import { kindLabel, recordDate } from "@/lib/format";
import { providerLabel } from "@/lib/film";

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
  return <ActionControl action={action} fields={{ id }} label={label} confirm={destructive ? "Delete this item? This cannot be undone." : undefined} />;
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
  const pendingByEntry = new Map(requests.filter((r) => r.status === "pending" && new Date(r.expires_at).getTime() > Date.now()).map((r) => [r.achievement_id, r]));
  const coachById = new Map(coaches.map((c) => [c.id, c]));

  return (
    <EditorSection
      id="record"
      title="The record"
      count={entries.length}
      lede="Every PR, result, award, and honor. Pin the three that matter most — they lead your resume — then send each entry to the coach who saw it."
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
                  <RowAction action={togglePinned} id={entry.id} label={entry.is_pinned ? "Unpin" : "Pin"} />
                  <Disclosure summary="Edit">
                    <EditorForm action={updateAchievement} submitLabel="Save entry" compact>
                      <input type="hidden" name="id" value={entry.id} />
                      <EntryFields entry={entry} />
                    </EditorForm>
                  </Disclosure>
                  {(entry.verification === "unverified" || entry.verification === "disputed" || (entry.verification === "submitted" && !pending)) && (
                    <Disclosure summary="Request verification">
                      <RequestVerification entryId={entry.id} coaches={coaches} />
                    </Disclosure>
                  )}
                  <Link className="btn-row min-h-11" href={`/app?share=${encodeURIComponent(entry.id)}`}>Share achievement</Link>
                  <RowAction action={deleteAchievement} id={entry.id} label="Delete" destructive />
                </div>

                {entry.verification === "submitted" && pending && (
                  <div className="flex basis-full flex-wrap items-center gap-3 border-t border-rule pt-4" role="status">
                    <span className="text-sm text-ink-muted">
                      Request created for {coachById.get(pending.coach_contact_id)?.name ?? "your coach"}. Send them this link yourself:
                    </span>
                    {pending.token ? <><code className="max-w-full truncate border border-rule bg-paper-sunken px-2 py-1.5 text-sm text-ink-muted">
                      /verify/{pending.token}
                    </code>
                    <CopyButton value={`/verify/${pending.token}`} label="Copy link" className="btn-row" /></> : <p className="text-xs text-ink-muted">For security, the share link was shown only when this request was created. Your coach can review the request in their coaching workspace.</p>}
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

              <div className="flex basis-full flex-wrap items-center gap-2">
                <Disclosure summary="Edit"><EditorForm action={editFilm} submitLabel="Save clip" compact><input type="hidden" name="id" value={clip.id} /><FilmFields clip={clip} /></EditorForm></Disclosure>
                {!clip.is_featured && <RowAction action={featureFilm} id={clip.id} label="Feature" />}
                <RowAction action={deleteFilm} id={clip.id} label="Delete" destructive />
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

              <div className="flex basis-full flex-wrap gap-2"><Disclosure summary="Edit"><EditorForm action={editCoach} submitLabel="Save reference" compact><input type="hidden" name="id" value={coach.id} /><CoachFields coach={coach} /></EditorForm></Disclosure><RowAction action={deleteCoach} id={coach.id} label="Delete" destructive /></div>
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

function FilmFields({ clip }: { clip?: FilmClip }) {
 return <><Field label="Title" hint="Junior season highlights, full game vs. Central"><TextInput name="title" required minLength={3} maxLength={120} defaultValue={clip?.title ?? ""} /></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Link"><TextInput name="url" type="url" required placeholder="https://" defaultValue={clip?.url ?? ""} /></Field><Field label="Season"><TextInput name="season" maxLength={40} defaultValue={clip?.season ?? ""} placeholder="2026" /></Field></div></>;
}
function CoachFields({ coach }: { coach?: CoachContact }) {
 return <div className="grid gap-5 sm:grid-cols-2"><Field label="Name"><TextInput name="name" required minLength={2} maxLength={80} defaultValue={coach?.name ?? ""} /></Field><Field label="Role"><TextInput name="role" maxLength={80} defaultValue={coach?.role ?? ""} placeholder="Head Coach" /></Field><Field label="School or club"><TextInput name="org_name" maxLength={120} defaultValue={coach?.org_name ?? ""} /></Field><Field label="Email"><TextInput name="email" type="email" defaultValue={coach?.email ?? ""} /></Field><Field label="Phone"><TextInput name="phone" type="tel" maxLength={25} defaultValue={coach?.phone ?? ""} /></Field></div>;
}
