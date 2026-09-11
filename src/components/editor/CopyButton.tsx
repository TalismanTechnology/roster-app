"use client";

import { useState } from "react";

/** Copies a value to the clipboard and says so for two seconds. */
export function CopyButton({
  value,
  label = "Copy",
  className = "btn-outline min-h-8 px-3 text-sm",
}: {
  /** Absolute URL or path; a path is resolved against the page's origin. */
  value: string;
  label?: string;
  className?: string;
}) {
  const [isCopied, setIsCopied] = useState(false);

  async function copy() {
    const text = value.startsWith("/") ? window.location.origin + value : value;
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard blocked; the value is visible beside the button.
    }
  }

  return (
    <button type="button" onClick={copy} className={className} aria-live="polite">
      {isCopied ? "Copied" : label}
    </button>
  );
}
