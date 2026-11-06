import type { Profile } from "@/lib/database.types";
import { updateAcademics, updateContact, updateIdentity, updateVisibility } from "@/lib/actions/resume";
import { EditorForm } from "@/components/editor/EditorForm";
import { Checkbox, Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { Corner, CORNER } from "@/components/ui/marks";
import { LEVEL_OPTIONS } from "@/lib/format";
import { US_STATES } from "@/lib/regions";
import { SPORTS } from "@/lib/sports";

/**
 * The profile half of the editor: who you are, your academics, and how a
 * recruiter reaches you. Server Components throughout — each prefills from
 * the row and hands its Server Action to the shared client shell.
 */

export function EditorSection({
  id,
  title,
  lede,
  count,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-[calc(var(--header-h)+1rem)]">
      <div className="flex items-center gap-3">
        <Corner d={CORNER.tl} className="text-ink-muted" />
        <h2 id={`${id}-heading`} className="font-display flex items-baseline gap-3 text-display leading-tight tracking-tight">
          {title}
          {typeof count === "number" && (
            <span className="text-lg font-normal text-ink-muted" data-numeric>
              {count}
            </span>
          )}
        </h2>
      </div>
      {lede && <p className="mt-3 max-w-prose leading-relaxed text-ink-muted">{lede}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** The raised surface a form sits on. */
export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`panel ${className}`} style={{ padding: "clamp(1.25rem, 2.5vw, 2rem)" }}>
      {children}
    </div>
  );
}

export function IdentitySection({ profile }: { profile: Profile }) {
  return (
    <EditorSection id="identity" title="Identity" lede="Name, sport, school, and the two sentences a recruiter reads first.">
      <Panel>
        <EditorForm action={updateIdentity} submitLabel="Save identity">
          <Field label="Name">
            <TextInput name="display_name" defaultValue={profile.display_name} required />
          </Field>

          <Field label="Bio" hint="Two sentences. What you play, what you're chasing, whether you're open to conversations.">
            <TextArea name="bio" defaultValue={profile.bio ?? ""} maxLength={500} />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Level">
              <Select name="level" defaultValue={profile.level ?? "high_school"} required>
                {LEVEL_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Sport">
              <Select name="primary_sport" defaultValue={profile.primary_sport ?? ""}>
                <option value="">Pick a sport</option>
                {SPORTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="School or club">
              <TextInput name="school" defaultValue={profile.school ?? ""} maxLength={120} />
            </Field>

            <Field label="Class of">
              <TextInput name="grad_year" type="number" min={1950} max={2100} defaultValue={profile.grad_year ?? ""} />
            </Field>

            <Field label="Positions" hint="Comma-separated: WR, DB">
              <TextInput name="positions" defaultValue={profile.positions.join(", ")} />
            </Field>

            <Field label="Jersey #">
              <TextInput name="jersey" defaultValue={profile.jersey ?? ""} maxLength={4} />
            </Field>

            <Field label="City">
              <TextInput name="location" defaultValue={profile.location ?? ""} />
            </Field>

            <Field label="State">
              <Select name="region" defaultValue={profile.region ?? ""}>
                <option value="">—</option>
                {US_STATES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Height (cm)">
              <TextInput name="height_cm" type="number" min={90} max={260} defaultValue={profile.height_cm ?? ""} />
            </Field>

            <Field label="Weight (kg)">
              <TextInput name="weight_kg" type="number" step="0.1" min={25} max={300} defaultValue={profile.weight_kg ?? ""} />
            </Field>
          </div>
        </EditorForm>
      </Panel>
    </EditorSection>
  );
}

export function AcademicsSection({ profile }: { profile: Profile }) {
  return (
    <EditorSection
      id="academics"
      title="Academics"
      lede="Half of every recruiting decision. A coach who cannot qualify you academically stops reading."
    >
      <Panel>
        <EditorForm action={updateAcademics} submitLabel="Save academics">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="GPA">
              <TextInput name="gpa" type="number" step="0.01" min={0} max={5} defaultValue={profile.gpa ?? ""} />
            </Field>

            <Field label="NCAA ID">
              <TextInput name="ncaa_id" defaultValue={profile.ncaa_id ?? ""} maxLength={20} />
            </Field>

            <Field label="SAT">
              <TextInput name="sat_score" type="number" min={400} max={1600} defaultValue={profile.sat_score ?? ""} />
            </Field>

            <Field label="ACT">
              <TextInput name="act_score" type="number" min={1} max={36} defaultValue={profile.act_score ?? ""} />
            </Field>
          </div>
        </EditorForm>
      </Panel>
    </EditorSection>
  );
}

export function ContactSection({ profile }: { profile: Profile }) {
  return (
    <EditorSection
      id="contact"
      title="Contact & links"
      lede="The contact email is what recruiters see — it does not have to be the one you sign in with. Shown only while you're open to recruiting."
    >
      <Panel>
        <EditorForm action={updateContact} submitLabel="Save contact">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Contact email">
              <TextInput name="contact_email" type="email" defaultValue={profile.contact_email ?? ""} />
            </Field>

            <Field label="Phone">
              <TextInput name="phone" type="tel" defaultValue={profile.phone ?? ""} />
            </Field>

            <Field label="Instagram" hint="@handle or profile link — saved as the handle.">
              <TextInput name="instagram" defaultValue={profile.instagram ?? ""} />
            </Field>

            <Field label="X" hint="@handle or profile link — saved as the handle.">
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
      </Panel>
    </EditorSection>
  );
}

export function VisibilitySection({ profile }: { profile: Profile }) {
  return (
    <EditorSection
      id="visibility"
      title="Visibility"
      lede="Public resumes appear in search. Unlisted ones open only by direct link. Private is you alone."
    >
      <Panel>
        <EditorForm action={updateVisibility} submitLabel="Save visibility">
          <Field label="Who can see your resume">
            <Select name="visibility" defaultValue={profile.visibility}>
              <option value="public">Public — listed in search</option>
              <option value="unlisted">Unlisted — anyone with the link</option>
              <option value="private">Private — only you</option>
            </Select>
          </Field>

          <Checkbox
            name="is_recruitable"
            defaultChecked={profile.is_recruitable}
            label="Open to recruiting"
            hint="Shows your contact details and your coaches' contact details to recruiters. Requires a public resume."
          />
        </EditorForm>
      </Panel>
    </EditorSection>
  );
}
