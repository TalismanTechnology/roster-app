"use client";

import { useActionState } from "react";

import type { FormState } from "@/lib/actions/resume";
import { FormNotice } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/SubmitButton";

const IDLE: FormState = { ok: false, error: null };

/**
 * The client shell every editor section shares: action state, notice, submit.
 * The fields arrive as children from a Server Component, which is what lets
 * each section prefill from the database without shipping its data-fetching
 * to the browser.
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

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {children}

      <div className={`flex flex-wrap items-center gap-4 ${compact ? "" : "border-t border-rule pt-5"}`}>
        <SubmitButton className={compact ? "btn-row" : "btn-primary"}>{submitLabel}</SubmitButton>
        <FormNotice ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
