"use client";

import { useActionState } from "react";

import { createList, type ListFormState } from "@/lib/actions/lists";
import { Field, FieldErrors, FormNotice, TextInput } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/SubmitButton";

const IDLE: ListFormState = { ok: false, error: null };

export function CreateListForm() {
  const [state, formAction] = useActionState(createList, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FieldErrors errors={state.fieldErrors}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" hint="“Class of 2027 receivers”, “Spring visits”">
            <TextInput name="name" defaultValue={state.values?.name} required minLength={2} maxLength={60} />
          </Field>
          <Field label="Note">
            <TextInput name="note" defaultValue={state.values?.note} maxLength={300} placeholder="Optional" />
          </Field>
        </div>
      </FieldErrors>
      <div className="flex items-center gap-4">
        <SubmitButton className="btn-outline" pendingLabel="Creating…">
          Create list
        </SubmitButton>
        <FormNotice ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
