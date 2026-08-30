"use client";

import { useActionState } from "react";

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
  const [state, formAction] = useActionState(action, { error: null });

  if (state.confirmEmail) {
    return (
      <div role="status" className="border-rule bg-paper-sunken border p-5">
        <p className="font-display text-display-sm">Check your email.</p>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          We sent a confirmation link. Click it and you will land right back
          here, signed in.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {next && <input type="hidden" name="next" value={next} />}

      <Field label="Email">
        <TextInput name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Password">
        <TextInput
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-disputed text-sm">
          {state.error}
        </p>
      )}

      <SubmitButton pendingLabel="One moment…">{submitLabel}</SubmitButton>
    </form>
  );
}
