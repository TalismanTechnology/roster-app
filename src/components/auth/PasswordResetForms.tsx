"use client";

import { useActionState } from "react";

import {
  requestPasswordReset,
  resetPassword,
  type ResetPasswordState,
  type ResetRequestState,
} from "@/lib/actions/auth";
import { Field, FieldErrors, TextInput } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * The two halves of a password reset. The request form ends in the same
 * words whether or not the address has an account — that sameness is the
 * feature, so the copy must never branch on anything the server knows.
 */
export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, { error: null } as ResetRequestState);

  if (state.sent) {
    return (
      <div role="status">
        <p className="font-display text-display-sm">Check your email.</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          If an account uses <span className="text-ink">{state.email}</span>, a link to choose a new password is on its
          way. It works once, within the hour.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <FieldErrors errors={state.fieldErrors}>
        <Field label="Email">
          <TextInput name="email" type="email" autoComplete="email" defaultValue={state.email} required autoFocus />
        </Field>
      </FieldErrors>
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-sm text-disputed">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="One moment…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [state, formAction] = useActionState(resetPassword, { error: null } as ResetPasswordState);
  return (
    <form action={formAction} className="flex flex-col gap-6">
      {token && <input type="hidden" name="token" value={token} />}
      <FieldErrors errors={state.fieldErrors}>
        <Field label="New password" hint="At least 8 characters.">
          <TextInput name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
        </Field>
        <Field label="Confirm new password">
          <TextInput name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
      </FieldErrors>
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-sm text-disputed">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
    </form>
  );
}
