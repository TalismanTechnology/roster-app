import type { Profile } from "@/lib/database.types";
import { saveMemberIdentity } from "@/lib/actions/media";
import { EditorForm } from "@/components/editor/EditorForm";
import { Field, TextInput, TextArea } from "@/components/ui/fields";

export function MemberIdentityForm({ profile }: { profile: Profile }) {
  return <EditorForm action={saveMemberIdentity} submitLabel="Save profile">
    <Field label="Your name"><TextInput name="display_name" defaultValue={profile.display_name} minLength={2} maxLength={80} required autoComplete="name" /></Field>
    <Field label="School or organization"><TextInput name="school" defaultValue={profile.school ?? ""} maxLength={120} autoComplete="organization" /></Field>
    <Field label="About you" hint="A short introduction for your resume."><TextArea name="bio" defaultValue={profile.bio ?? ""} maxLength={500} rows={3} /></Field>
  </EditorForm>;
}
