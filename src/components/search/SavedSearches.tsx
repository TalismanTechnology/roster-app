"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";

import { deleteSavedSearch, saveSearch, toggleSavedSearchDigest, type SavedSearchState } from "@/lib/actions/searches";
import type { SavedSearch } from "@/lib/data/types";
import { SubmitButton } from "@/components/ui/SubmitButton";

const IDLE: SavedSearchState = { ok: false, error: null };

const control =
  "label w-full rounded-(--radius-input) border border-rule-strong bg-paper-raised/60 px-2 py-1.5 text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none";

/**
 * #88: a recruiter's saved searches, beside the filters. Each one is a link
 * (apply), a digest switch, and a delete; the form at the bottom saves the
 * filters on screen. `current` is the canonical query of the page, so the
 * search already applied is marked rather than offered again.
 */
export function SavedSearches({ searches, current }: { searches: SavedSearch[]; current: string }) {
  const [state, formAction] = useActionState(saveSearch, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const isSaved = searches.some((s) => s.query === current);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section aria-labelledby="saved-searches" className="flex flex-col gap-4 border-t border-rule pt-5">
      <h2 id="saved-searches" className="label font-mono text-ink-muted">
        [ Saved searches ]
      </h2>

      {searches.length > 0 && (
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {searches.map((s) => {
            const active = s.query === current;
            return (
              <li key={s.id} className="flex flex-col gap-2 py-2.5">
                <Link
                  href={s.query ? `/search?${s.query}` : "/search"}
                  aria-current={active ? "page" : undefined}
                  className={`truncate font-bold underline decoration-transparent underline-offset-4 hover:decoration-ink ${active ? "text-ink" : "text-ink-muted hover:text-ink"}`}
                >
                  {active && <span aria-hidden>▸ </span>}
                  {s.name}
                </Link>
                <div className="flex items-center gap-3">
                  <form action={toggleSavedSearchDigest}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="digest" value={s.digest ? "" : "on"} />
                    <button
                      type="submit"
                      aria-pressed={s.digest}
                      aria-label={`Weekly digest for ${s.name}`}
                      className="label cursor-pointer font-mono text-ink-subtle hover:text-ink"
                    >
                      [ digest {s.digest ? "on" : "off"} ]
                    </button>
                  </form>
                  <form action={deleteSavedSearch}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" aria-label={`Delete saved search ${s.name}`} className="label cursor-pointer text-ink-subtle hover:text-disputed">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!isSaved && (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="query" value={current} />
          <input
            name="name"
            required
            minLength={2}
            maxLength={60}
            placeholder="Name this search"
            aria-label="Saved search name"
            defaultValue={state.values?.name}
            className={control}
          />
          <label className="label flex cursor-pointer items-center gap-2 text-ink-muted">
            <input type="checkbox" name="digest" className="size-4 cursor-pointer accent-current" />
            Weekly digest of new matches
          </label>
          <SubmitButton className="btn-outline min-h-8 px-3 text-sm" pendingLabel="Saving…">
            Save search
          </SubmitButton>
          {state.error && (
            <p role="alert" className="label text-disputed">
              {state.error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
