"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import type { FormState } from "@/lib/actions/resume";
import { FieldErrors, FormNotice } from "@/components/ui/fields";
import { restoreFormValues } from "@/components/ui/restore-form";
import { SubmitButton } from "@/components/ui/SubmitButton";

import { setFormDirty } from "./DirtyGuard";

const IDLE: FormState = { ok: false, error: null };

/**
 * The client shell every editor section shares: action state, notice, submit.
 * The fields arrive as children from a Server Component, which is what lets
 * each section prefill from the database without shipping its data-fetching
 * to the browser.
 *
 * On a failed save the action returns what was submitted and the fields are
 * put back, so one bad value never costs the athlete everything else they
 * typed. On success the reset stands: an "add" form clears for the next one,
 * and an edit form shows the saved values the server re-rendered.
 *
 * Any edit marks the form unsaved for the DirtyGuard until a save succeeds;
 * a failed save leaves it unsaved, because it is.
 */
export function EditorForm({
  action,
  submitLabel,
  children,
  compact = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children: React.ReactNode;
  /** Smaller submit, for inline edit forms inside a list row. */
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();

  useEffect(() => {
    if (state.error && state.values && formRef.current) restoreFormValues(formRef.current, state.values);
    if (state.ok) setFormDirty(id, false);
  }, [state, id]);

  // Leaving the section unmounts the form; it has nothing left to guard.
  useEffect(() => () => setFormDirty(id, false), [id]);

  return (
    <form ref={formRef} action={formAction} onChange={() => setFormDirty(id, true)} className="flex flex-col gap-6">
      <FieldErrors errors={state.fieldErrors}>{children}</FieldErrors>

      <div className={`flex flex-wrap items-center gap-4 ${compact ? "" : "border-t border-rule pt-5"}`}>
        <SubmitButton className={compact ? "btn-row" : "btn-primary"}>{submitLabel}</SubmitButton>
        <FormNotice ok={state.ok} error={state.error} savedAt={state.savedAt} />
      </div>
    </form>
  );
}
