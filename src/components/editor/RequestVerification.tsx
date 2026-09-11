"use client";

import { useActionState } from "react";

import { requestVerification, type RequestState } from "@/lib/actions/resume";
import type { CoachContact } from "@/lib/database.types";
import { Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/SubmitButton";

import { CopyButton } from "./CopyButton";

const IDLE: RequestState = { ok: false, error: null };

/**
 * Ask a coach to verify an entry. Roster doesn't send the email — the
 * athlete does, from their own address, which is the message a coach will
 * actually open. This produces the link to paste into it.
 */
export function RequestVerification({ entryId, coaches }: { entryId: string; coaches: CoachContact[] }) {
  const [state, formAction] = useActionState(requestVerification, IDLE);

  if (coaches.length === 0) {
    return (
      <p className="label text-ink-muted">
        Add a coach under References first — verification requests go to someone who was there.
      </p>
    );
  }

  if (state.ok && state.token) {
    const path = `/verify/${state.token}`;
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="text-sm">
          Link created. No email has been sent. Share this link with your coach; it works once and expires in 30 days.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="label max-w-full truncate border border-rule bg-paper-raised/60 px-2 py-1.5 text-ink-muted">
            {path}
          </code>
          <CopyButton value={path} label="Copy link" />
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="entry_id" value={entryId} />
      <label className="block min-w-48 flex-1">
        <span className="label mb-1.5 block font-bold text-ink-muted">Coach who saw it</span>
        <Select name="coach_id" required defaultValue={coaches[0]?.id}>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.role ? ` — ${c.role}` : ""}
            </option>
          ))}
        </Select>
      </label>
      <SubmitButton className="btn-outline min-h-11 px-4 text-sm" pendingLabel="Creating…">
        Create request link
      </SubmitButton>
      {state.error && (
        <p role="alert" className="basis-full text-sm text-disputed">
          {state.error}
        </p>
      )}
    </form>
  );
}
