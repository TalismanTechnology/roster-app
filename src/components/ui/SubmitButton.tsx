"use client";

import { useFormStatus } from "react-dom";

/**
 * The primary action of a form, with a pending state read from the form it
 * sits inside. Must be rendered as a child of the <form> — useFormStatus only
 * sees an ancestor form's submission.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-ink text-paper hover:bg-ink-muted flex h-11 cursor-pointer items-center justify-center rounded-[2px] px-6 text-sm font-medium transition-colors duration-(--duration-fast) disabled:cursor-default disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
