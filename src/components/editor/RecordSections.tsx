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
} from "@/lib/actions/resume";
import { EditorForm } from "@/components/editor/EditorForm";
import { EditorSection } from "@/components/editor/ProfileSections";
import { VerificationMark } from "@/components/record/VerificationMark";
import { Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { KIND_OPTIONS, kindLabel, recordDate } from "@/lib/format";

/**
 * The record half of the editor: entries, film, references. Lists render with
 * inline single-button forms — delete, pin, feature — that post straight to a
 * Server Action, so the rows need no client JavaScript at all.
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
          destructive
            ? "text-ink-subtle hover:text-disputed hover:decoration-disputed"
            : "text-ink-muted hover:text-ink hover:decoration-ink"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Record entries
// ---------------------------------------------------------------------------

export function RecordSection({ entries }: { entries: RecordEntry[] }) {
  return (
    <EditorSection
      title="The record"
      lede="Every PR, result, award, and honor. Entries are unverified until a coach or Roster confirms them — add them anyway; the ask comes later."
    >
      {entries.length > 0 && (
        <ol className="mb-8">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border-rule flex items-baseline gap-4 border-b py-3 first:border-t"
            >
              <time dateTime={entry.achieved_on} className="text-ink-subtle w-16 shrink-0 text-sm">
                {recordDate(entry.achieved_on)}
              </time>

              <div className="min-w-0 flex-1">
                <p className="text-ink truncate">
                  {entry.title}
                  {entry.value_display && (
                    <span className="ml-2" data-numeric>
                      {entry.value_display}
                    </span>
                  )}
                </p>
                <p className="label text-ink-subtle mt-1">{kindLabel(entry.kind)}</p>
              </div>

              <VerificationMark state={entry.verification} />

              <InlineAction
                action={togglePinned}
                id={entry.id}
                label={entry.is_pinned ? "Unpin" : "Pin"}
              />
              <InlineAction action={deleteAchievement} id={entry.id} label="Delete" destructive />
            </li>
          ))}
        </ol>
      )}

      <EditorForm action={addAchievement} submitLabel="Add entry">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Type">
            <Select name="kind" defaultValue="personal_record" required>
              {KIND_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date">
            <TextInput name="achieved_on" type="date" required />
          </Field>
        </div>

        <Field label="Title" hint="“400m Personal Best”, “All-Conference First Team”">
          <TextInput name="title" required minLength={3} maxLength={120} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Mark" hint="As the sport writes it: 53.94, 6-08.25">
            <TextInput name="value_display" maxLength={20} />
          </Field>

          <Field label="Competition">
            <TextInput name="competition" maxLength={120} />
          </Field>

          <Field label="Placement">
            <TextInput name="placement" type="number" min={1} />
          </Field>

          <Field label="Field size" hint="Out of how many">
            <TextInput name="field_size" type="number" min={1} />
          </Field>
        </div>

        <Field label="Detail">
          <TextArea name="detail" maxLength={500} rows={2} />
        </Field>
      </EditorForm>
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------
// Film
// ---------------------------------------------------------------------------

export function FilmSection({ clips }: { clips: FilmClip[] }) {
  return (
    <EditorSection
      title="Film"
      lede="Paste YouTube, Vimeo, or Hudl links. The featured clip leads your resume; label the rest so a coach can pick without playing all of them."
    >
      {clips.length > 0 && (
        <ol className="mb-8">
          {clips.map((clip) => (
            <li
              key={clip.id}
              className="border-rule flex items-baseline gap-4 border-b py-3 first:border-t"
            >
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate">
                  {clip.title}
                  {clip.is_featured && <span className="label text-verified ml-3">Featured</span>}
                </p>
                <p className="text-ink-subtle mt-1 truncate text-sm">
                  {clip.provider ?? "link"}
                  {clip.season ? ` · ${clip.season}` : ""}
                </p>
              </div>

              {!clip.is_featured && (
                <InlineAction action={featureFilm} id={clip.id} label="Feature" />
              )}
              <InlineAction action={deleteFilm} id={clip.id} label="Delete" destructive />
            </li>
          ))}
        </ol>
      )}

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
    </EditorSection>
  );
}

// ---------------------------------------------------------------------------
// Coach references
// ---------------------------------------------------------------------------

export function CoachSection({ coaches }: { coaches: CoachContact[] }) {
  return (
    <EditorSection
      title="References"
      lede="The coach a recruiter calls. Ask before you list someone — their details show only while your resume is public and open to recruiting."
    >
      {coaches.length > 0 && (
        <ol className="mb-8">
          {coaches.map((coach) => (
            <li
              key={coach.id}
              className="border-rule flex items-baseline gap-4 border-b py-3 first:border-t"
            >
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate">{coach.name}</p>
                <p className="text-ink-subtle mt-1 truncate text-sm">
                  {[coach.role, coach.org_name, coach.email ?? coach.phone]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <InlineAction action={deleteCoach} id={coach.id} label="Delete" destructive />
            </li>
          ))}
        </ol>
      )}

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
    </EditorSection>
  );
}
