"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** How long an armed delete waits for its second press before standing down. */
const ARMED_MS = 6000;

/**
 * Delete in two presses. The first arms it — the row grows a "Confirm
 * delete" and a "Cancel", and focus moves to the confirm — the second posts.
 * It stands down on Cancel, Escape, focus leaving the pair, or after a few
 * seconds untouched, so a stray click or a held Enter never costs a row.
 * The armed state is spoken through a polite live region.
 */
export function ConfirmDelete({
  action,
  id,
  what,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  /** "entry", "clip", "reference" — names the row in what is announced. */
  what: string;
}) {
  const [isArmed, setIsArmed] = useState(false);
  const wrapRef = useRef<HTMLFormElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus follows the state: onto the confirm when armed. Standing down by
  // keyboard puts focus back on Delete (see `disarm`).
  useEffect(() => {
    if (!isArmed) return;
    confirmRef.current?.focus();
    const t = setTimeout(() => setIsArmed(false), ARMED_MS);
    return () => clearTimeout(t);
  }, [isArmed]);

  function disarm(refocus: boolean) {
    setIsArmed(false);
    // The Delete button mounts again on the next commit.
    if (refocus) requestAnimationFrame(() => deleteRef.current?.focus());
  }

  return (
    <form
      ref={wrapRef}
      action={action}
      className="flex flex-wrap items-center gap-2"
      onKeyDown={(e) => {
        if (isArmed && e.key === "Escape") {
          e.preventDefault();
          disarm(true);
        }
      }}
      onBlur={(e) => {
        // Focus moving between Confirm and Cancel is still "here".
        if (isArmed && !wrapRef.current?.contains(e.relatedTarget as Node | null)) setIsArmed(false);
      }}
    >
      <input type="hidden" name="id" value={id} />
      {isArmed ? (
        <Armed confirmRef={confirmRef} onCancel={() => disarm(true)} />
      ) : (
        <button ref={deleteRef} type="button" onClick={() => setIsArmed(true)} className="btn-row btn-row-danger">
          Delete
        </button>
      )}
      <span aria-live="polite" className="sr-only">
        {isArmed ? `Delete this ${what}? Press Confirm delete to remove it, or Escape to cancel.` : ""}
      </span>
    </form>
  );
}

/** The armed confirm wears the disputed state at rest, not only on hover. */
const ARMED_STYLE = {
  color: "var(--state-disputed)",
  borderColor: "var(--state-disputed)",
  background: "var(--state-disputed-bg)",
} as const;

function Armed({ confirmRef, onCancel }: { confirmRef: React.RefObject<HTMLButtonElement | null>; onCancel: () => void }) {
  // Inside the form, so it sees this delete's own submission.
  const { pending } = useFormStatus();
  return (
    <>
      <span className="label flex items-center gap-1.5 text-disputed" aria-hidden>
        <span>[</span>Delete?<span>]</span>
      </span>
      {/* aria-disabled, not disabled: a disabled button drops focus, which
          would read as "focus left" and stand the delete down mid-request. */}
      <button
        ref={confirmRef}
        type="submit"
        aria-disabled={pending}
        onClick={(e) => pending && e.preventDefault()}
        className="btn-row"
        style={ARMED_STYLE}
      >
        {pending ? "Deleting…" : "Confirm delete"}
      </button>
      {!pending && (
        <button type="button" onClick={onCancel} className="btn-row">
          Cancel
        </button>
      )}
    </>
  );
}
