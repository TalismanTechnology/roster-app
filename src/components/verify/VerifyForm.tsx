"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { respondVerification, type VerifyFormState } from "@/lib/actions/verify";
import { Checkbox, Field, TextArea, TextInput } from "@/components/ui/fields";
import { Verified } from "@/components/ui/marks";

const IDLE: VerifyFormState = { ok: false, error: null };

/**
 * The coach's decision. Three submits on one form — Verify, Dispute, and
 * "I don't know this athlete" — so the name and note travel with any answer.
 * After answering, the form is replaced by the outcome; the link is
 * single-use from here on.
 *
 * Verify stays disabled until the attestation is ticked (#78); the action
 * checks it again, so a scripted POST cannot skip it. Disputing needs no
 * attestation — saying "this isn't right" should never be harder than
 * saying yes.
 *
 * The page renders this whether or not the link is still open, passing
 * `closed` when it isn't. That keeps the component mounted across the
 * refresh the action triggers — the page comes back "already answered" —
 * so the thank-you below is shown because this coach's answer was just
 * recorded, and a later visit gets the plain answered state instead.
 *
 * `compact` is the batch variant (#81): one of the athlete's other pending
 * entries, answered with this link as authority. Name and role ride along
 * hidden — they are the coach's from the main form's defaults.
 */
export function VerifyForm({
  token,
  coachName,
  coachRole,
  athleteName,
  requestId,
  compact = false,
  closed = null,
}: {
  token: string;
  coachName: string;
  coachRole: string | null;
  athleteName: string;
  /** A sibling request to answer instead of the link's own. */
  requestId?: string;
  compact?: boolean;
  /** Why the link can't be answered (used, expired, own record), rendered by the page. */
  closed?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(respondVerification, IDLE);
  const [attested, setAttested] = useState(state.values?.attest === "on");

  if (state.ok) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className={`flex items-center gap-2 ${compact ? "font-bold" : "font-display text-display-sm"}`}>
          {state.outcome === "verified" ? (
            <>
              <Verified /> Verified. Thank you.
            </>
          ) : state.flagged ? (
            "Recorded — you don't know this athlete."
          ) : (
            "Recorded as disputed."
          )}
        </p>
        {!compact && (
          <p className="text-sm text-ink-muted">
            {state.outcome === "verified"
              ? "The entry now carries your name on the athlete's resume."
              : state.flagged
                ? "The entry stays unverified, and the athlete is told the request reached the wrong person."
                : "The athlete will see your note and can correct the entry or ask again."}
          </p>
        )}
        {!compact && <p className="label text-ink-muted">Each link works once.</p>}
      </div>
    );
  }

  if (closed) return closed;

  const values = state.values;

  return (
    <form action={formAction} className={`flex flex-col ${compact ? "gap-4" : "gap-5"}`}>
      <input type="hidden" name="token" value={token} />
      {requestId && <input type="hidden" name="request_id" value={requestId} />}

      {compact ? (
        <>
          <input type="hidden" name="name" value={coachName} />
          <input type="hidden" name="role" value={coachRole ?? ""} />
        </>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your name">
              <TextInput name="name" defaultValue={values?.name ?? coachName} required minLength={2} maxLength={80} autoComplete="name" />
            </Field>
            <Field label="Your role" hint="Shown beside the entry">
              <TextInput name="role" defaultValue={values?.role ?? coachRole ?? ""} maxLength={80} placeholder="Head Coach" />
            </Field>
          </div>

          <Field label="Note" hint="Optional. What you saw, or what's wrong.">
            <TextArea name="note" defaultValue={values?.note} maxLength={500} rows={3} />
          </Field>
        </>
      )}

      <div className="border border-rule bg-paper-sunken/60 p-4">
        <Checkbox
          name="attest"
          checked={attested}
          onChange={(e) => setAttested(e.currentTarget.checked)}
          label={`I coached or saw ${athleteName} and confirm this entry is accurate.`}
          hint={compact ? undefined : "Needed to verify. Your name goes on the entry."}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-disputed">
          {state.error}
        </p>
      )}

      <div className={`flex flex-wrap items-center gap-3 ${compact ? "" : "border-t border-rule pt-5"}`}>
        <Decision outcome="verified" className="btn-primary" disabled={!attested}>
          Yes, I verify this
        </Decision>
        <Decision outcome="disputed" className="btn-outline">
          No, this isn&rsquo;t right
        </Decision>
        {!compact && (
          <Decision outcome="unknown" className="btn-row ml-auto">
            I don&rsquo;t coach or know this athlete
          </Decision>
        )}
      </div>
    </form>
  );
}

function Decision({
  outcome,
  className,
  disabled = false,
  children,
}: {
  outcome: "verified" | "disputed" | "unknown";
  className: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="outcome"
      value={outcome}
      disabled={pending || disabled}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {pending ? "Recording…" : children}
    </button>
  );
}
