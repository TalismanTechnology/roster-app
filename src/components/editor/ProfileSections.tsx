import type { Profile } from "@/lib/database.types";
import {
  updateAcademics,
  updateContact,
  updateIdentity,
  updateVisibility,
} from "@/lib/actions/resume";
import { EditorForm } from "@/components/editor/EditorForm";
import { Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { LEVEL_OPTIONS } from "@/lib/format";

/**
 * The profile half of the editor: who you are, your academics, and how a
 * recruiter reaches you. Server Components throughout — each prefills from
 * the row and hands its Server Action to the shared client shell.
 */

export function EditorSection({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  // Each section is its own sheet: the editor reads as a stack of documents
  // being filled in, and the seam between sections is desk, not a rule.
  return (
    <section className="sheet px-6 py-7 sm:px-8">
      <h2 className="font-display text-display-sm leading-tight">{title}</h2>
      {lede && <p className="text-ink-muted mt-2 max-w-prose text-sm leading-relaxed">{lede}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function IdentitySection({ profile }: { profile: Profile }) {
  return (
    <EditorSection title="Identity">
      <EditorForm action={updateIdentity} submitLabel="Save identity">
        <Field label="Name">
          <TextInput name="display_name" defaultValue={profile.display_name} required />
        </Field>

        <Field label="Bio" hint="Two sentences a recruiter reads first.">
          <TextArea name="bio" defaultValue={profile.bio ?? ""} maxLength={500} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Level">
            <Select name="level" defaultValue={profile.level ?? "high_school"} required>
              {LEVEL_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Primary sport">
            <TextInput name="primary_sport" defaultValue={profile.primary_sport ?? ""} />
          </Field>

          <Field label="School or club">
            <TextInput name="school" defaultValue={profile.school ?? ""} maxLength={120} />
          </Field>

          <Field label="Class of">
            <TextInput
              name="grad_year"
              type="number"
              min={1950}
              max={2100}
              defaultValue={profile.grad_year ?? ""}
            />
          </Field>

          <Field label="Positions" hint="Comma-separated: sprinter, relay anchor">
            <TextInput name="positions" defaultValue={profile.positions.join(", ")} />
          </Field>

          <Field label="City">
            <TextInput name="location" defaultValue={profile.location ?? ""} />
          </Field>

          <Field label="State" hint="Two letters — MI">
            <TextInput name="region" defaultValue={profile.region ?? ""} maxLength={2} />
          </Field>

          <Field label="Height (cm)">
            <TextInput
              name="height_cm"
              type="number"
              min={90}
              max={260}
              defaultValue={profile.height_cm ?? ""}
            />
          </Field>

          <Field label="Weight (kg)">
            <TextInput
              name="weight_kg"
              type="number"
              step="0.1"
              min={25}
              max={300}
              defaultValue={profile.weight_kg ?? ""}
            />
          </Field>

          <Field label="Jersey #">
            <TextInput name="jersey" defaultValue={profile.jersey ?? ""} maxLength={4} />
          </Field>
        </div>
      </EditorForm>
    </EditorSection>
  );
}

export function AcademicsSection({ profile }: { profile: Profile }) {
  return (
    <EditorSection
      title="Academics"
      lede="Half of every recruiting decision. A coach who cannot qualify you academically stops reading."
    >
      <EditorForm action={updateAcademics} submitLabel="Save academics">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="GPA">
            <TextInput
              name="gpa"
              type="number"
              step="0.01"
              min={0}
              max={5}
              defaultValue={profile.gpa ?? ""}
            />
          </Field>

          <Field label="NCAA ID">
            <TextInput name="ncaa_id" defaultValue={profile.ncaa_id ?? ""} maxLength={20} />
          </Field>

          <Field label="SAT">
            <TextInput
              name="sat_score"
              type="number"
              min={400}
              max={1600}
              defaultValue={profile.sat_score ?? ""}
            />
          </Field>

          <Field label="ACT">
            <TextInput
              name="act_score"
              type="number"
              min={1}
              max={36}
              defaultValue={profile.act_score ?? ""}
            />
          </Field>
        </div>
      </EditorForm>
    </EditorSection>
  );
}

export function ContactSection({ profile }: { profile: Profile }) {
  return (
    <EditorSection
      title="Contact & links"
      lede="The contact email is what recruiters see — it does not have to be the one you sign in with."
    >
      <EditorForm action={updateContact} submitLabel="Save contact">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact email">
            <TextInput
              name="contact_email"
              type="email"
              defaultValue={profile.contact_email ?? ""}
            />
          </Field>

          <Field label="Phone">
            <TextInput name="phone" type="tel" defaultValue={profile.phone ?? ""} />
          </Field>

          <Field label="Instagram">
            <TextInput name="instagram" defaultValue={profile.instagram ?? ""} />
          </Field>

          <Field label="X">
            <TextInput name="x_handle" defaultValue={profile.x_handle ?? ""} />
          </Field>

          <Field label="Hudl profile">
            <TextInput name="hudl_url" type="url" defaultValue={profile.hudl_url ?? ""} />
          </Field>

          <Field label="Results page" hint="Athletic.net, MileSplit, MaxPreps…">
            <TextInput name="results_url" type="url" defaultValue={profile.results_url ?? ""} />
          </Field>
        </div>
      </EditorForm>
    </EditorSection>
  );
}

export function VisibilitySection({ profile }: { profile: Profile }) {
  return (
    <EditorSection
      title="Visibility"
      lede="Public resumes appear in search. Unlisted ones open only by direct link. Private is you alone."
    >
      <EditorForm action={updateVisibility} submitLabel="Save visibility">
        <Field label="Who can see your resume">
          <Select name="visibility" defaultValue={profile.visibility}>
            <option value="public">Public — listed in search</option>
            <option value="unlisted">Unlisted — anyone with the link</option>
            <option value="private">Private — only you</option>
          </Select>
        </Field>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="is_recruitable"
            defaultChecked={profile.is_recruitable}
            className="accent-ink size-4"
          />
          <span className="text-sm">
            Open to recruiting — shows your contact details and coach references
          </span>
        </label>
      </EditorForm>
    </EditorSection>
  );
}
