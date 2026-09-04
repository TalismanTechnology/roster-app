"use client";

import { useState } from "react";

/**
 * The two things a person does with a resume besides read it: send it and
 * print it. Copy takes the page's own URL so it is right on every host.
 */
export function ShareBar({ handle }: { handle: string }) {
  const [isCopied, setIsCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/" + handle);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, permissions): the URL is in the
      // address bar; nothing to do.
    }
  }

  return (
    <div className="print-hidden flex flex-wrap gap-2">
      <button type="button" onClick={copy} className="btn-outline min-h-9 px-4 text-sm" aria-live="polite">
        {isCopied ? "Copied" : "Copy link"}
      </button>
      <button type="button" onClick={() => window.print()} className="btn-ghost min-h-9 px-3 text-sm">
        Print / PDF
      </button>
    </div>
  );
}
