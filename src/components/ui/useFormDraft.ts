"use client";
import { useEffect, useRef, type RefObject } from "react";

/** React resets function-action forms after a handled result, including validation errors. */
export function useFormDraft(form: RefObject<HTMLFormElement | null>, result: unknown, pending: boolean, retain: boolean) {
  const submitted = useRef<FormData | null>(null);
  const restored = useRef<unknown>(null);
  useEffect(() => {
    if (pending || !retain || !submitted.current || !form.current || restored.current === result) return;
    restored.current = result;
    const values = submitted.current;
    const restore = () => {
      if (!form.current) return;
      for (const field of Array.from(form.current.elements)) {
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) || !field.name || field.dataset.controlled === "true") continue;
        if (field instanceof HTMLInputElement && ["file", "hidden", "submit", "button"].includes(field.type)) continue;
        if (field instanceof HTMLInputElement && ["radio", "checkbox"].includes(field.type)) field.checked = values.getAll(field.name).includes(field.value);
        else if (field instanceof HTMLSelectElement && field.multiple) for (const option of field.options) option.selected = values.getAll(field.name).includes(option.value);
        else { const value = values.get(field.name); if (typeof value === "string") field.value = value; }
      }
    };
    restore();
  }, [form, result, pending, retain]);
  return (element: HTMLFormElement) => { submitted.current = new FormData(element); };
}
