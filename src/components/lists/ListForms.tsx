"use client";

import { useActionState } from "react";

import { createList, renameList, updateListNote, type ListFormState } from "@/lib/actions/lists";
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

/**
 * #86: the recruiter's note on one athlete, inline on the list row. Private
 * to the list's owner (RLS owner-only); "" clears it.
 */
export function ListNoteForm({ listId, profileId, note, athleteName }: { listId: string; profileId: string; note: string | null; athleteName: string }) {
  const [state, formAction] = useActionState(updateListNote, IDLE);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="list_id" value={listId} />
      <input type="hidden" name="profile_id" value={profileId} />
      <input
        name="note"
        defaultValue={state.values?.note ?? note ?? ""}
        maxLength={300}
        placeholder="Add a note — visits, contact, what to watch"
        aria-label={`Note on ${athleteName}`}
        className="min-w-0 flex-1 basis-56 border-0 border-b border-rule bg-transparent px-0 py-1.5 text-sm text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none"
      />
      <SubmitButton className="label cursor-pointer text-ink-subtle underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-ink" pendingLabel="Saving…">
        Save note
      </SubmitButton>
      <FormNotice ok={state.ok} error={state.error} />
    </form>
  );
}
