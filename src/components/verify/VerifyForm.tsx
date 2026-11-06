"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { respondVerification, type VerifyFormState } from "@/lib/actions/verify";
import { Field, TextArea, TextInput } from "@/components/ui/fields";
import { Verified } from "@/components/ui/marks";

const IDLE: VerifyFormState = { ok: false, error: null };

/**
 * The coach's decision. Two submits on one form — Verify and Dispute — so
 * the name and note travel with either answer. After answering, the form
 * is replaced by the outcome; the link is single-use from here on.
 *
 * The page renders this whether or not the link is still open, passing
 * `closed` when it isn't. That keeps the component mounted across the
 * refresh the action triggers — the page comes back "already answered" —
 * so the thank-you below is shown because this coach's answer was just
 * recorded, and a later visit gets the plain answered state instead.
 */
export function VerifyForm({
  token,
  coachName,
  coachRole,
  closed = null,
}: {
  token: string;
  coachName: string;
  coachRole: string | null;
  /** Why the link can't be answered (used, expired, own record), rendered by the page. */
  closed?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(respondVerification, IDLE);

  if (state.ok) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="font-display flex items-center gap-2 text-display-sm">
          {state.outcome === "verified" ? (
            <>
              <Verified /> Verified. Thank you.
            </>
          ) : (
            "Recorded as disputed."
          )}
        </p>
        <p className="text-sm text-ink-muted">
          {state.outcome === "verified"
            ? "The entry now carries your name on the athlete's resume."
            : "The athlete will see your note and can correct the entry or ask again."}
        </p>
        <p className="label text-ink-muted">Each link works once.</p>
      </div>
    );
  }

  if (closed) return closed;

  const values = state.values;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

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

      {state.error && (
        <p role="alert" className="text-sm text-disputed">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
        <Decision outcome="verified" className="btn-primary">
          Yes, I verify this
        </Decision>
        <Decision outcome="disputed" className="btn-outline">
          No, this isn&rsquo;t right
        </Decision>
      </div>
    </form>
  );
}

function Decision({ outcome, className, children }: { outcome: "verified" | "disputed"; className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="outcome" value={outcome} disabled={pending} className={className}>
      {pending ? "Recording…" : children}
    </button>
  );
}
