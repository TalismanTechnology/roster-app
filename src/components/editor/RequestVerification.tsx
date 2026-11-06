"use client";

import { useActionState } from "react";

import { requestVerification, revokeVerification, type RequestState } from "@/lib/actions/resume";
import type { CoachContact, VerificationState } from "@/lib/database.types";
import type { VerificationRequest } from "@/lib/data/types";
import { Select } from "@/components/ui/fields";
import { fullDate } from "@/lib/format";
import { verifyUrl } from "@/lib/site";
import { SubmitButton } from "@/components/ui/SubmitButton";

import { CopyButton } from "./CopyButton";

const IDLE: RequestState = { ok: false, error: null };

/**
 * Everything verification on one entry row: ask, see the link, chase it,
 * take it back, and recover from a dispute.
 *
 * The raw link exists exactly once — in this component's action state,
 * straight after it is created. Only a hash is stored, so a later visit can
 * say "sent" but never show the link again; "Send a new link" mints a
 * fresh one and kills the old. That is why the row renders this component
 * in every state, at the same position: it stays mounted across the refresh
 * the action triggers, and the link survives long enough to be copied.
 *
 * Renders into the row's button bar (`display: contents` pieces): a row
 * button where one belongs, and a full-width panel below the buttons for
 * anything longer.
 */
export function RequestVerification({
  entryId,
  verification,
  coaches,
  pending,
  pendingIsLive,
  latest,
}: {
  entryId: string;
  verification: VerificationState;
  coaches: CoachContact[];
  /** The open request for this entry, if any. */
  pending: VerificationRequest | null;
  /** `pending` is still inside its 30 days (computed on the server). */
  pendingIsLive: boolean;
  /** The newest request that is not expired — for showing what the coach said. */
  latest: VerificationRequest | null;
}) {
  const [state, formAction] = useActionState(requestVerification, IDLE);
  const coachName = (id: string | undefined) => coaches.find((c) => c.id === id)?.name ?? "your coach";

  if (coaches.length === 0) {
    if (verification === "verified") return null;
    return (
      <Panel>
        <p className="label text-ink-muted">
          Add a coach under References first — verification requests go to someone who was there.
        </p>
      </Panel>
    );
  }

  // Just created, and still the open request: the one moment the link exists.
  if (state.ok && state.token && pending && state.requestId === pending.id) {
    const link = verifyUrl(state.token);
    return (
      <Panel status>
        <p className="text-sm">
          {state.emailedTo ? (
            <>
              Emailed to {coachName(pending.coach_contact_id)} at <span className="font-bold">{state.emailedTo}</span>. You can also send the link yourself:
            </>
          ) : (
            <>Send this link to {coachName(pending.coach_contact_id)}:</>
          )}
        </p>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
          <code className="min-w-0 max-w-full truncate border border-rule bg-paper-sunken px-2 py-1.5 text-sm text-ink-muted">{link}</code>
          <CopyButton value={link} label="Copy link" className="btn-row" />
        </div>
        <p className="label mt-3 text-ink-subtle">Shown once · works once · expires in 30 days</p>
      </Panel>
    );
  }

  if (pending) {
    return (
      <Panel status>
        <p className="text-sm text-ink-muted">
          {pendingIsLive ? (
            <>
              Waiting on <span className="text-ink">{coachName(pending.coach_contact_id)}</span> · sent {fullDate(pending.created_at.slice(0, 10))} · expires{" "}
              {fullDate(pending.expires_at.slice(0, 10))}
            </>
          ) : (
            <>
              The link to <span className="text-ink">{coachName(pending.coach_contact_id)}</span> expired on {fullDate(pending.expires_at.slice(0, 10))} without an answer.
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={formAction}>
            <input type="hidden" name="entry_id" value={entryId} />
            <input type="hidden" name="coach_id" value={pending.coach_contact_id} />
            <SubmitButton className="btn-row" pendingLabel="Creating…">
              Send a new link
            </SubmitButton>
          </form>
          {pendingIsLive && (
            <form action={revokeVerification}>
              <input type="hidden" name="id" value={pending.id} />
              <button type="submit" className="btn-row">
                Revoke
              </button>
            </form>
          )}
        </div>
        {pendingIsLive && <p className="label mt-3 text-ink-subtle">The link is only shown when it&rsquo;s created. A new one replaces this one.</p>}
        <ErrorLine error={state.error} />
      </Panel>
    );
  }

  if (verification === "verified") return null;

  const disputed = verification === "disputed" && latest?.status === "disputed" ? latest : null;

  return (
    <>
      <details className="group contents">
        <summary className="btn-row list-none [&::-webkit-details-marker]:hidden group-open:border-ink group-open:bg-wash">
          {disputed ? "Request again" : "Request verification"}
        </summary>
        <div className="basis-full border-t border-rule pt-5">
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="entry_id" value={entryId} />
            <label className="block min-w-48 flex-1">
              <span className="label mb-1.5 block font-bold text-ink-muted">Coach who saw it</span>
              <Select name="coach_id" required defaultValue={defaultCoach(coaches, disputed)}>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.role ? ` — ${c.role}` : ""}
                  </option>
                ))}
              </Select>
            </label>
            <SubmitButton className="btn-outline min-h-9 px-4 text-sm" pendingLabel="Creating…">
              Create request link
            </SubmitButton>
            <ErrorLine error={state.error} />
          </form>
          <p className="label mt-3 text-ink-subtle">We email the coach if they have an address on file. 10 requests a day.</p>
        </div>
      </details>

      {disputed && (
        // #77: a dispute is a fork in the road, not a dead end.
        <Panel status>
          <p className="label text-disputed">
            [ {disputed.flagged_unknown_athlete ? "Wrong coach?" : "Disputed"} ]
          </p>
          <p className="mt-2 text-sm">
            {disputed.flagged_unknown_athlete ? (
              <>
                {disputed.verifier_name ?? coachName(disputed.coach_contact_id)} said they don&rsquo;t coach or know you. Check the reference, then request again — from someone who was there.
              </>
            ) : (
              <>
                {disputed.verifier_name ?? coachName(disputed.coach_contact_id)}
                {disputed.verifier_role ? `, ${disputed.verifier_role}` : ""} says this isn&rsquo;t right.
              </>
            )}
          </p>
          {disputed.note && <p className="mt-2 max-w-prose text-sm italic text-ink-muted">&ldquo;{disputed.note}&rdquo;</p>}
          {!disputed.flagged_unknown_athlete && (
            <p className="label mt-3 text-ink-muted">Fix the entry with Edit, then Request again.</p>
          )}
        </Panel>
      )}
    </>
  );
}

/** After "I don't know this athlete", don't preselect the same coach. */
function defaultCoach(coaches: CoachContact[], disputed: VerificationRequest | null): string | undefined {
  if (disputed?.flagged_unknown_athlete) {
    return coaches.find((c) => c.id !== disputed.coach_contact_id)?.id ?? coaches[0]?.id;
  }
  return disputed?.coach_contact_id ?? coaches[0]?.id;
}

/** A full-width block under the row's buttons. */
function Panel({ children, status = false }: { children: React.ReactNode; status?: boolean }) {
  return (
    <div className="order-last min-w-0 basis-full border-t border-rule pt-4" role={status ? "status" : undefined}>
      {children}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="basis-full text-sm text-disputed">
      {error}
    </p>
  );
}
