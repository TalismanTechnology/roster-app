"use client";

import { useActionState } from "react";

import { deleteAccount, updateEmail, updatePassword, type AccountFormState } from "@/lib/actions/account";
import { Field, FormNotice, TextInput } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/SubmitButton";

const IDLE: AccountFormState = { ok: false, error: null };

export function EmailForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(updateEmail, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Sign-in email" hint="Not shown on your resume. Recruiters see the contact email you set in the editor.">
        <TextInput name="email" type="email" defaultValue={email} required autoComplete="email" />
      </Field>
      <div className="flex items-center gap-4">
        <SubmitButton className="btn-outline">Update email</SubmitButton>
        <FormNotice ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState(updatePassword, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-5">
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
        <TextInput name="confirm_handle" required autoComplete="off" autoCapitalize="none" spellCheck={false} />
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
