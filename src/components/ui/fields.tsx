import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Form primitives. Hairline inputs on a bare step up from paper that
 * brighten to ink on focus, with the label as a small muted line above.
 * Server-component safe — interactivity is the browser's own form behavior
 * plus the SubmitButton's pending state.
 */

const fieldClasses =
  "w-full rounded-(--radius-input) border border-rule-strong bg-paper-raised/60 px-3 py-3 text-lg text-ink " +
  "placeholder:text-ink-subtle focus:border-ink focus:bg-paper-raised focus:outline-none " +
  "transition-colors duration-(--duration-fast) disabled:opacity-50";

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
    <span className="relative block">
      <select {...props} className={`${fieldClasses} cursor-pointer appearance-none pr-9`}>
        {children}
      </select>
      <svg
        viewBox="0 0 12 12"
        className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-ink-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path d="M2 4.5l4 4 4-4" />
      </svg>
    </span>
  );
}

/** A yes/no as a square check, the identity's shape. */
export function Checkbox({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded-[2px] border border-rule-strong bg-transparent checked:border-ink checked:bg-ink"
      />
      <span>
        <span className="block font-bold">{label}</span>
        {hint && <span className="label text-ink-muted mt-0.5 block">{hint}</span>}
      </span>
    </label>
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
      <p role="status" className="text-ink-muted mt-3 text-sm">
        Saved.
      </p>
    );
  }

  return null;
}
