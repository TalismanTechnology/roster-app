"use client";

import { useActionState, useState } from "react";

import { addToList, type ListFormState } from "@/lib/actions/lists";
import type { RecruiterList } from "@/lib/data/types";
import { SubmitButton } from "@/components/ui/SubmitButton";

const IDLE: ListFormState = { ok: false, error: null };
const NEW = "__new__";

const control =
  "label rounded-(--radius-input) border border-rule-strong bg-paper-raised/60 px-2 py-1.5 text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none";

/**
 * One row's "save" control for a signed-in recruiter. With lists, a select
 * and a button; choosing "New list…" (or having no lists yet) reveals a
 * name field that creates the list and saves in the same gesture. Lists
 * that already hold the athlete are shown as such rather than offered again.
 */
export function SaveToList({
  profileId,
  lists,
  savedIn,
}: {
  profileId: string;
  lists: RecruiterList[];
  savedIn: string[];
}) {
  const [state, formAction] = useActionState(addToList, IDLE);
  const available = lists.filter((l) => !savedIn.includes(l.id));
  const savedNames = lists.filter((l) => savedIn.includes(l.id)).map((l) => l.name);
  const [listId, setListId] = useState(available[0]?.id ?? NEW);
  // After a save the chosen list drops out of `available`; treat a stale
  // choice as "New list…" so the select and the name field agree.
  const effective = available.some((l) => l.id === listId) ? listId : NEW;
  const isNew = lists.length === 0 || effective === NEW;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="profile_id" value={profileId} />

      {lists.length > 0 && (
        <select name="list_id" value={effective} onChange={(e) => setListId(e.target.value)} className={`${control} max-w-44 cursor-pointer`} aria-label="List">
          {available.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value={NEW}>New list…</option>
        </select>
      )}

      {isNew && (
        <input
          name="new_list"
          placeholder="Name the list"
          required
          minLength={2}
          maxLength={60}
          aria-label="New list name"
          className={`${control} min-w-36`}
        />
      )}

      <SubmitButton className="btn-outline min-h-8 px-3 text-sm" pendingLabel="Saving…">
        Save
      </SubmitButton>

      {savedNames.length > 0 && <span className="label text-ink-muted">In {savedNames.join(", ")}</span>}
      {state.error && (
        <span role="alert" className="label text-disputed">
          {state.error}
        </span>
      )}
    </form>
  );
}
