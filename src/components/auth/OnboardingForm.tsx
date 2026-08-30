"use client";

import { useActionState } from "react";

import { completeOnboarding, type FormState } from "@/lib/actions/resume";
import { Field, Select, TextInput } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { LEVEL_OPTIONS } from "@/lib/format";

const IDLE: FormState = { ok: false, error: null };

export function OnboardingForm() {
  const [state, formAction] = useActionState(completeOnboarding, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Field label="Your name">
        <TextInput name="display_name" autoComplete="name" required minLength={2} />
      </Field>

      <Field label="Handle" hint="Your resume's address: roster.us/yourhandle">
        <TextInput
          name="handle"
          required
          pattern="[a-z0-9][a-z0-9_]{1,28}[a-z0-9]"
          title="3–30 characters: lowercase letters, numbers, underscores."
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>

      <Field label="Level">
        <Select name="level" required defaultValue="high_school">
          {LEVEL_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-6">
        <Field label="Primary sport" hint="e.g. track & field">
          <TextInput name="primary_sport" />
        </Field>

        <Field label="Class of">
          <TextInput name="grad_year" type="number" min={1950} max={2100} inputMode="numeric" />
        </Field>
      </div>

      {state.error && (
        <p role="alert" className="text-disputed text-sm">
          {state.error}
        </p>
      )}

      <SubmitButton pendingLabel="Creating…">Create my resume</SubmitButton>
    </form>
  );
}
