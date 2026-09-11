"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { useFormDraft } from "@/components/ui/useFormDraft";

import type { AuthFormState } from "@/lib/actions/auth";
import { Field, TextInput } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * One form for both sign-in and sign-up — the fields are identical, only the
 * action and the copy differ. The sign-up variant can end in a "check your
 * email" state instead of a redirect when confirmation is on.
 */
export function AuthForm({
  action,
  submitLabel,
  next,
}: {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const form = useRef<HTMLFormElement>(null);
  const draft = useFormDraft(form, state, pending, Boolean(state.error));
  const isSignUp = /create/i.test(submitLabel);

  if (state.confirmEmail) {
    return (
      <div role="status">
        <p className="font-display text-display-sm">Check your email.</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          We sent a confirmation link. Click it and you will land right back here, signed in.
        </p>
      </div>
    );
  }

  return (
    <form ref={form} onSubmit={event => { draft(event.currentTarget); }} onReset={event => event.preventDefault()} action={formAction} className="flex flex-col gap-6">
      {next && <input type="hidden" name="next" value={next} />}

      <Field label="Email">
        <TextInput name="email" type="email" autoComplete="email" required autoFocus />
      </Field>

      {isSignUp && <Field label="Date of birth" hint="Private. You must be at least 13 to create an account."><TextInput name="date_of_birth" type="date" required autoComplete="bday" /></Field>}

      <Field label="Password" hint={isSignUp ? "At least 8 characters." : undefined}>
        <TextInput
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </Field>

      {!isSignUp && <Link className="text-sm underline" href="/auth/recover">Forgot your password?</Link>}
      {state.error && (
        <p role="alert" className="text-sm text-disputed">
          {state.error}
        </p>
      )}

      <SubmitButton pendingLabel="One moment…">{submitLabel}</SubmitButton>
    </form>
  );
}
