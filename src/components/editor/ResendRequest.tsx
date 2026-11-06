"use client";

import { useActionState } from "react";

import { requestVerification, type RequestState } from "@/lib/actions/resume";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { verifyUrl } from "@/lib/site";

import { CopyButton } from "./CopyButton";

const IDLE: RequestState = { ok: false, error: null };

/**
 * #58: a fresh link for an expired request — same entry, same coach. It is
 * an ordinary new request (hashed token, emailed when the coach has an
 * address, inside the daily cap), and like every link it is shown once:
 * here, straight after it is made.
 */
export function ResendRequest({ entryId, coachId, coachName }: { entryId: string; coachId: string; coachName: string }) {
  const [state, formAction] = useActionState(requestVerification, IDLE);

  if (state.ok && state.token) {
    const link = verifyUrl(state.token);
    return (
      <div className="flex basis-full flex-col gap-2 border-t border-rule pt-3" role="status">
        <p className="text-sm">
          {state.emailedTo ? (
            <>
              Sent again to <span className="font-bold">{state.emailedTo}</span>. Or send it yourself:
            </>
          ) : (
            <>New link for {coachName}:</>
          )}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <code className="min-w-0 max-w-full truncate border border-rule bg-paper-sunken px-2 py-1.5 text-sm text-ink-muted">{link}</code>
          <CopyButton value={link} label="Copy link" className="btn-row" />
        </div>
        <p className="label text-ink-subtle">Shown once · works once · expires in 30 days</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="entry_id" value={entryId} />
      <input type="hidden" name="coach_id" value={coachId} />
      <SubmitButton className="btn-row" pendingLabel="Sending…">
        Resend
      </SubmitButton>
      {state.error && (
        <span role="alert" className="text-sm text-disputed">
          {state.error}
        </span>
      )}
    </form>
  );
}
