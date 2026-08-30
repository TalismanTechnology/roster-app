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
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {children}

      <div className="flex items-center gap-4">
        <SubmitButton>{submitLabel}</SubmitButton>
        <FormNotice ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
