"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { Verified } from "./marks";

/**
 * Form primitives. Solid inputs on the raised surface with a visible edge
 * that brightens to ink on focus, 16px text, and the label as a bold line
 * above. Client components, but every prop a server page passes is plain
 * data — they render from Server Components unchanged.
 *
 * Field-level errors come from the nearest <FieldErrors> (the form shell
 * provides it from its action state): an input whose name has a message is
 * marked aria-invalid and described by that message, printed under it.
 * Outside a provider nothing changes.
 */

type FieldErrorMap = Record<string, string[]> | undefined;

const FieldErrorsContext = createContext<{ errors: FieldErrorMap; prefix: string }>({ errors: undefined, prefix: "" });

/** Supplies an action's `fieldErrors` to every input below it. */
export function FieldErrors({ errors, children }: { errors: FieldErrorMap; children: ReactNode }) {
  const prefix = useId();
  return <FieldErrorsContext.Provider value={{ errors, prefix }}>{children}</FieldErrorsContext.Provider>;
}

/** The first message for a field and the id it is printed under, or null. */
function useFieldError(name: string | undefined): { id: string; message: string } | null {
  const { errors, prefix } = useContext(FieldErrorsContext);
  const message = name ? errors?.[name]?.[0] : undefined;
  return name && message ? { id: `${prefix}${name}-error`, message } : null;
}

/** aria-invalid plus the error's id merged into whatever the caller described the input with. */
function errorAria(error: { id: string } | null, describedBy: string | undefined) {
  if (!error) return {};
  return {
    "aria-invalid": true as const,
    "aria-describedby": [describedBy, error.id].filter(Boolean).join(" "),
  };
}

function ErrorText({ error }: { error: { id: string; message: string } | null }) {
  if (!error) return null;
  return (
    <span id={error.id} className="mt-2 flex items-baseline gap-1.5 text-sm font-bold text-disputed">
      <span aria-hidden>[!]</span> {error.message}
    </span>
  );
}

/**
 * A field's error printed where the caller wants it — for an input that
 * passed `externalError` because its own layout has no room underneath.
 */
export function FieldError({ name }: { name: string }) {
  return <ErrorText error={useFieldError(name)} />;
}

const fieldClasses =
  "w-full rounded-(--radius-input) border border-rule-strong bg-paper-sunken px-3.5 py-3 text-base text-ink " +
  "placeholder:text-ink-subtle focus:border-ink focus:outline-none " +
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
      <span className="mb-2 block text-sm font-bold">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-sm text-ink-muted">{hint}</span>}
    </label>
  );
}

const invalidClasses = "aria-invalid:border-disputed aria-invalid:focus:border-disputed";

export function TextInput({
  externalError = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  /** The caller prints the error itself with <FieldError>. */
  externalError?: boolean;
}) {
  const error = useFieldError(props.name);
  return (
    <>
      <input {...props} {...errorAria(error, props["aria-describedby"])} className={`${fieldClasses} ${invalidClasses}`} />
      {!externalError && <ErrorText error={error} />}
    </>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const error = useFieldError(props.name);
  return (
    <>
      <textarea
        rows={3}
        {...props}
        {...errorAria(error, props["aria-describedby"])}
        className={`${fieldClasses} ${invalidClasses} resize-y leading-normal`}
      />
      <ErrorText error={error} />
    </>
  );
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const error = useFieldError(props.name);
  return (
    <>
      <span className="relative block">
        <select
          {...props}
          {...errorAria(error, props["aria-describedby"])}
          className={`${fieldClasses} ${invalidClasses} cursor-pointer appearance-none pr-10`}
        >
          {children}
        </select>
        <svg
          viewBox="0 0 12 12"
          className="pointer-events-none absolute top-1/2 right-3.5 size-3.5 -translate-y-1/2 text-ink-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M2 4.5l4 4 4-4" />
        </svg>
      </span>
      <ErrorText error={error} />
    </>
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
        className="mt-0.5 size-5 shrink-0 cursor-pointer appearance-none rounded-[3px] border border-rule-strong bg-paper-sunken checked:border-ink checked:bg-ink"
      />
      <span>
        <span className="block font-bold">{label}</span>
        {hint && <span className="mt-0.5 block text-sm text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** "just now", "4m ago", "2h ago" — coarse on purpose; it ticks twice a minute. */
function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function SavedAgo({ at }: { at: number }) {
  // Starts at the save itself, so the first render is pure and says "just now".
  const [now, setNow] = useState(at);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [at]);
  return <span className="font-normal text-ink-muted">· {ago(Math.max(0, now - at))}</span>;
}

/**
 * Inline error/success line under a form. Rendered only when there is news.
 * With `savedAt` (from the action), success reads "Saved · 3m ago".
 */
export function FormNotice({ ok, error, savedAt }: { ok: boolean; error: string | null; savedAt?: number }) {
  if (error) {
    return (
      <p role="alert" className="text-sm font-bold text-disputed">
        {error}
      </p>
    );
  }

  if (ok) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm font-bold">
        <Verified label="Saved" /> Saved
        {savedAt !== undefined && <SavedAgo key={savedAt} at={savedAt} />}
      </p>
    );
  }

  return null;
}
