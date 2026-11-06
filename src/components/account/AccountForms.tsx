"use client";

import { useActionState } from "react";

import { deleteAccount, updateEmail, updatePassword, type AccountFormState } from "@/lib/actions/account";
import { Field, FieldErrors, FormNotice, TextInput } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/SubmitButton";

const IDLE: AccountFormState = { ok: false, error: null };

export function EmailForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(updateEmail, IDLE);
  // Pending (#29): the input keeps showing the address that still signs in.
  // The new one is named in the notice until its link is clicked.
  const shown = state.pendingEmail ? email : (state.values?.email ?? email);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Sign-in email" hint="Not shown on your resume. Recruiters see the contact email you set in the editor.">
        <TextInput key={shown} name="email" type="email" defaultValue={shown} required autoComplete="email" />
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton className="btn-outline">Update email</SubmitButton>
        {state.pendingEmail ? (
          <p role="status" className="text-sm">
            <span className="label text-ink-muted">[ Pending ]</span>{" "}
            Confirm the link sent to <span className="font-bold">{state.pendingEmail}</span>. Until then, you sign in with {email}.
          </p>
        ) : (
          <FormNotice ok={state.ok} error={state.error} />
        )}
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState(updatePassword, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* A wrong current password is marked on that field (#28), not just the form. */}
      <FieldErrors errors={state.fieldErrors}>
        <Field label="Current password">
          <TextInput name="current" type="password" required autoComplete="current-password" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="New password" hint="At least 8 characters.">
            <TextInput name="next" type="password" required minLength={8} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <TextInput name="confirm" type="password" required minLength={8} autoComplete="new-password" />
          </Field>
        </div>
      </FieldErrors>
      <div className="flex items-center gap-4">
        <SubmitButton className="btn-outline">Update password</SubmitButton>
        <FormNotice ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}

export function DeleteForm({ confirmWith }: { confirmWith: string }) {
  const [state, formAction] = useActionState(deleteAccount, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label={`Type ${confirmWith} to confirm`} hint="Deletes your account, your resume, and everything on it. There is no undo.">
        <TextInput name="confirm_handle" defaultValue={state.values?.confirm_handle} required autoComplete="off" autoCapitalize="none" spellCheck={false} />
      </Field>
      <div className="flex items-center gap-4">
        <SubmitButton className="btn-outline border-disputed text-disputed hover:border-disputed hover:bg-disputed hover:text-white" pendingLabel="Deleting…">
          Delete my account
        </SubmitButton>
        {state.error && (
          <p role="alert" className="text-sm text-disputed">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
