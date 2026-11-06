"use client";

import { useActionState } from "react";

import { createList, renameList, type ListFormState } from "@/lib/actions/lists";
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

/** Inline on the list page, behind a disclosure: renaming is rare. */
export function RenameListForm({ listId, name }: { listId: string; name: string }) {
  const [state, formAction] = useActionState(renameList, IDLE);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="list_id" value={listId} />
      <FieldErrors errors={state.fieldErrors}>
        <Field label="List name">
          <TextInput name="name" defaultValue={state.values?.name ?? name} required minLength={2} maxLength={60} />
        </Field>
      </FieldErrors>
      <div className="flex items-center gap-4">
        <SubmitButton className="btn-outline" pendingLabel="Saving…">
          Save name
        </SubmitButton>
        <FormNotice ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
