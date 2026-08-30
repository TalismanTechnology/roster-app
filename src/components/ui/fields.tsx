import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Form primitives in the editorial system: hairline underlines rather than
 * boxed inputs, so a form reads like a document being filled in rather than a
 * settings panel. Server-component-safe — interactivity lives in the browser's
 * own form behavior plus the SubmitButton's pending state.
 */

const fieldClasses =
  "w-full border-0 border-b border-rule bg-transparent px-0 py-2 text-base text-ink " +
  "placeholder:text-ink-subtle focus:border-ink focus:outline-none focus:ring-0 " +
  "transition-colors duration-(--duration-fast)";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label text-ink-muted">{label}</span>
      {children}
      {hint && <span className="text-ink-subtle mt-1 block text-sm">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={fieldClasses} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${fieldClasses} resize-y leading-relaxed`} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${fieldClasses} cursor-pointer appearance-none`}>
      {children}
    </select>
  );
}

/** Inline error/success line under a form. Rendered only when there is news. */
export function FormNotice({ ok, error }: { ok: boolean; error: string | null }) {
  if (error) {
    return (
      <p role="alert" className="text-disputed mt-3 text-sm">
        {error}
      </p>
    );
  }

  if (ok) {
    return (
      <p role="status" className="text-verified mt-3 text-sm">
        Saved.
      </p>
    );
  }

  return null;
}
