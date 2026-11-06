/**
 * Puts submitted values back into a form after React 19 has reset it.
 *
 * React resets a `<form action={…}>` once its action settles, success or
 * not. For forms whose fields arrive as server-rendered children (the
 * editor), there is no client-side `defaultValue` to swap, so the action
 * returns what was submitted and this writes it back into the DOM. Runs in
 * an effect, which React schedules after the reset.
 *
 * Unchecked boxes are absent from FormData, so a checkbox missing from
 * `values` is restored unchecked. Hidden, password, and file inputs are
 * left alone.
 */
export function restoreFormValues(form: HTMLFormElement, values: Record<string, string>): void {
  for (const el of Array.from(form.elements)) {
    if (el instanceof HTMLInputElement) {
      if (!el.name || el.type === "hidden" || el.type === "password" || el.type === "file") continue;
      if (el.type === "checkbox") {
        el.checked = values[el.name] === (el.value || "on");
      } else if (el.type === "radio") {
        el.checked = values[el.name] === el.value;
      } else if (el.name in values) {
        el.value = values[el.name];
      }
    } else if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (el.name && el.name in values) el.value = values[el.name];
    }
  }
}
