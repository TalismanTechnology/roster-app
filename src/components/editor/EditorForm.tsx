"use client";
import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import type { FormState } from "@/lib/actions/resume";
import { FormNotice } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useFormDraft } from "@/components/ui/useFormDraft";

const IDLE: FormState = { ok: false, error: null };
export function EditorForm({ action, submitLabel, children, compact = false }: { action: (prev: FormState, formData: FormData) => Promise<FormState>; submitLabel: string; children: React.ReactNode; compact?: boolean }) {
  const [dirty, setDirty] = useState(false);
  const [resetEpoch, setResetEpoch] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const allowReset = useRef(false);
  const [state, formAction, pending] = useActionState(async (previous: FormState, data: FormData) => {
    const result = await action(previous, data);
    if (result.ok) { setDirty(false); if (submitLabel.startsWith("Add ") || submitLabel === "Create list") { allowReset.current = true; form.current?.reset(); allowReset.current = false; setResetEpoch(epoch => epoch + 1); } }
    return result;
  }, IDLE);
  const draft = useFormDraft(form, state, pending, Boolean(state.error) || !(submitLabel.startsWith("Add ") || submitLabel === "Create list"));
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.href === window.location.href || event.defaultPrevented) return;
      if (!window.confirm("You have unsaved changes. Leave this page without saving?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  return <form ref={form} action={formAction} onSubmit={event => { draft(event.currentTarget); }} onReset={event => { if (!allowReset.current) event.preventDefault(); }} onChange={() => setDirty(true)} className="flex flex-col gap-5"><fieldset disabled={pending} className="flex min-w-0 flex-col gap-5"><Fragment key={resetEpoch}>{children}</Fragment><div className={`flex flex-wrap items-center gap-4 ${compact ? "" : "border-t border-rule pt-5"}`}><SubmitButton className={compact ? "btn-row min-h-11" : "btn-primary min-h-11"}>{submitLabel}</SubmitButton>{dirty ? <p role="status" className="text-sm text-ink-muted">{pending ? "Saving changes…" : "Unsaved changes"}</p> : <FormNotice ok={state.ok} error={null} />}{state.error && <p role="alert" className="text-sm text-disputed">{state.error}</p>}</div></fieldset></form>;
}

export function RowAction({ action, fields, label, confirm }: { action: (data: FormData) => Promise<void>; fields: Record<string, string>; label: string; confirm?: string }) {
  const [error, setError] = useState("");
  return <form action={async data => { setError(""); try { await action(data); } catch (failure) { if (failure && typeof failure === "object" && "digest" in failure && String(failure.digest).startsWith("NEXT_REDIRECT")) throw failure; setError("Could not save this change. Please try again."); } }} onSubmit={event => { if (confirm && !window.confirm(confirm)) event.preventDefault(); }}>
    {Object.entries(fields).map(([name, value]) => <input type="hidden" key={name} name={name} value={value} />)}<SubmitButton className={`btn-row min-h-11 ${confirm ? "btn-row-danger" : ""}`}>{label}</SubmitButton>{error && <p role="alert" className="mt-2 text-sm text-disputed">{error}</p>}
  </form>;
}
