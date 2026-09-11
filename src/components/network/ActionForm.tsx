"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { networkAction } from "@/lib/actions/network";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useFormDraft } from "@/components/ui/useFormDraft";

export function ActionForm({ operation, fields = {}, label, children, confirm, className = "", reset = false, quiet = false, submitDisabled = false }: { operation: string; fields?: Record<string, string>; label: string; children?: React.ReactNode; confirm?: string; className?: string; reset?: boolean; quiet?: boolean; submitDisabled?: boolean }) {
  const [state, action, pending] = useActionState(networkAction, {});
  const key = useRef("");
  const keyInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const allowReset = useRef(false);
  const draft = useFormDraft(form, state, pending, Boolean(state.error));
  const router = useRouter();
  useEffect(() => {
    if (!state.revision) return;
    if (reset) { allowReset.current = true; form.current?.reset(); allowReset.current = false; key.current = ""; }
    if (state.destination) router.push(state.destination);
    router.refresh();
  }, [state.revision, state.destination, reset, router]);
  return <form ref={form} action={action} className={`network-form ${className}`} onReset={event => { if (!allowReset.current) event.preventDefault(); }} onSubmit={event => { if (submitDisabled || (confirm && !window.confirm(confirm))) event.preventDefault(); else { if (!key.current) key.current = crypto.randomUUID(); if (keyInput.current) keyInput.current.value = key.current; draft(event.currentTarget); } }}>
    <input type="hidden" name="operation" value={operation} />
    <input ref={keyInput} type="hidden" name="key" defaultValue="" />
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <fieldset disabled={pending}>{children}<SubmitButton disabled={submitDisabled} className={quiet ? "network-button-quiet" : "network-button"} pendingLabel="Saving…">{label}</SubmitButton></fieldset>
    {state.error && <p role="alert" className="network-error">{state.error}</p>}
    {!quiet && state.success && !state.destination && <p role="status" className="network-success">{state.success}</p>}
  </form>;
}

export function RefreshControl({ interval = 20000 }: { interval?: number }) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const refresh = () => { setOffline(!navigator.onLine); if (navigator.onLine && document.visibilityState === "visible") router.refresh(); };
    const id = window.setInterval(refresh, interval);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => { window.clearInterval(id); window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); };
  }, [router, interval]);
  return <div className="network-live"><span>{offline ? "You’re offline. Your draft stays here." : "Updates automatically"}</span><button className="network-button-quiet" onClick={() => router.refresh()}>Refresh</button></div>;
}
