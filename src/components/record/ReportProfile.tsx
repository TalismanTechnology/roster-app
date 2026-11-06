"use client";

import { useActionState, useEffect, useRef } from "react";

import { Field, FieldErrors, Select, TextArea } from "@/components/ui/fields";
import { restoreFormValues } from "@/components/ui/restore-form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { reportProfile, type ReportState } from "@/lib/actions/moderation";

const IDLE: ReportState = { ok: false, error: null };

/** Labels for `REPORT_REASONS` (lib/data/types.ts), in the order offered. */
const REASONS: [string, string][] = [
  ["impersonation", "Impersonation — this isn't who it claims to be"],
  ["false_record", "False or inflated results"],
  ["minor_safety", "A minor's safety"],
  ["inappropriate", "Inappropriate content"],
  ["spam", "Spam or advertising"],
  ["other", "Something else"],
];

/**
 * "Report this profile" (#50) — quiet, at the foot of the resume, closed
 * until asked for. Works signed out. The answer is the same whether or not
 * the report was a duplicate, so the form can't be used to probe.
 */
export function ReportProfile({ profileId, name }: { profileId: string; name: string }) {
  const [state, formAction] = useActionState(reportProfile, IDLE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.error && state.values && formRef.current) restoreFormValues(formRef.current, state.values);
  }, [state]);

  return (
    <details className="print-hidden group border-t border-rule py-6" style={{ paddingInline: "var(--pad-x)" }}>
      <summary className="label inline-flex min-h-11 cursor-pointer items-center gap-2 text-ink-subtle transition-colors hover:text-ink sm:min-h-0">
        Report this profile
      </summary>

      {state.ok ? (
        <p role="status" className="mt-4 max-w-xl text-sm text-ink-muted">
          Thanks — the report is in. We review every one, and act quickly where a minor&rsquo;s safety is involved.
        </p>
      ) : (
        <form ref={formRef} action={formAction} className="mt-5 flex max-w-xl flex-col gap-5">
          <input type="hidden" name="profile_id" value={profileId} />
          {/* Honeypot: off-screen and out of the tab order; people never fill it. */}
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <FieldErrors errors={state.fieldErrors}>
            <Field label={`What's wrong with ${name}'s profile?`}>
              <Select name="reason" required defaultValue="">
                <option value="" disabled>
                  Pick a reason
                </option>
                {REASONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Details (optional)" hint="What should we look at? Links help. Not shared with the athlete.">
              <TextArea name="detail" maxLength={1000} rows={3} />
            </Field>
          </FieldErrors>
          {state.error && (
            <p role="alert" className="text-sm text-disputed">
              {state.error}
            </p>
          )}
          <div>
            <SubmitButton pendingLabel="Sending…" className="btn-outline min-h-9 px-4 text-sm">
              Send report
            </SubmitButton>
          </div>
        </form>
      )}
    </details>
  );
}
