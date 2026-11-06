"use client";

import { useActionState, useState } from "react";

import { addToList, removeFromList, type ListFormState } from "@/lib/actions/lists";
import type { RecruiterList } from "@/lib/data/types";
import { SubmitButton } from "@/components/ui/SubmitButton";

const IDLE: ListFormState = { ok: false, error: null };
const NEW = "__new__";

const control =
  "label rounded-(--radius-input) border border-rule-strong bg-paper-raised/60 px-2 py-1.5 text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none max-sm:min-h-11 max-sm:min-w-0 max-sm:flex-1";

/**
 * One row's "save" control for a signed-in recruiter. With lists, a select
 * and a button; choosing "New list…" (or having no lists yet) reveals a
 * name field that creates the list and saves in the same gesture. Lists
 * that already hold the athlete show as chips with a one-click remove (#89)
 * rather than being offered again.
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
  const saved = lists.filter((l) => savedIn.includes(l.id));
  const [listId, setListId] = useState(available[0]?.id ?? NEW);
  // After a save the chosen list drops out of `available`; treat a stale
  // choice as "New list…" so the select and the name field agree.
  const effective = available.some((l) => l.id === listId) ? listId : NEW;
  const isNew = lists.length === 0 || effective === NEW;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={formAction} className="flex items-center gap-2 max-sm:w-full sm:flex-wrap">
        <input type="hidden" name="profile_id" value={profileId} />

        {lists.length > 0 && (
          <select name="list_id" value={effective} onChange={(e) => setListId(e.target.value)} className={`${control} cursor-pointer sm:max-w-44`} aria-label="List">
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
            className={`${control} sm:min-w-36`}
          />
        )}

        <SubmitButton className="btn-outline min-h-8 shrink-0 px-3 text-sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </form>

      {saved.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Saved in">
          {saved.map((l) => (
            <li key={l.id} className="label flex items-center border border-rule-strong">
              <span className="max-w-48 truncate px-2 py-1 text-ink-muted">In {l.name}</span>
              <form action={removeFromList}>
                <input type="hidden" name="list_id" value={l.id} />
                <input type="hidden" name="profile_id" value={profileId} />
                <button
                  type="submit"
                  aria-label={`Remove from ${l.name}`}
                  title={`Remove from ${l.name}`}
                  className="cursor-pointer self-stretch border-l border-rule-strong px-2 py-1 text-ink-subtle transition-colors hover:bg-wash hover:text-disputed max-sm:min-h-10 max-sm:min-w-10"
                >
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {state.error && (
        <span role="alert" className="label text-disputed">
          {state.error}
        </span>
      )}
    </div>
  );
}
