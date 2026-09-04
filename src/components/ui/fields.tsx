import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Form primitives in the X language: bordered rounded inputs that light up
 * blue on focus, with the label as a small muted line above. Server-component
 * safe — interactivity is the browser's own form behavior plus the
 * SubmitButton's pending state.
 */

const fieldClasses =
  "w-full rounded-(--radius-input) border border-rule-strong bg-transparent px-3 py-3 text-lg text-ink " +
  "placeholder:text-ink-subtle focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none " +
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
      <span className="label text-ink-muted mb-1.5 block font-bold">{label}</span>
      {children}
      {hint && <span className="label text-ink-muted mt-1.5 block">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={fieldClasses} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${fieldClasses} resize-y leading-normal`} />;
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
