"use client";

import { useState, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** Whether this browser has a share sheet. False on the server, so the first paint matches. */
function useCanShare(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );
}

/**
 * The two things a person does with a resume besides read it: send it and
 * print it. Send opens the device's share sheet where there is one (phones,
 * mostly) and copies the link everywhere else. The link is built from the
 * page's own origin so it is right on every host.
 */
export function ShareBar({ handle, title, print = true }: { handle: string; title?: string; print?: boolean }) {
  const [isCopied, setIsCopied] = useState(false);
  const canShare = useCanShare();

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, permissions): the URL is in the
      // address bar; nothing to do.
    }
  }

  async function send() {
    const url = window.location.origin + "/" + handle;
    if (canShare) {
      try {
        await navigator.share({ title: title ?? document.title, url });
        return;
      } catch (error) {
        // Closing the sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Anything else (no user gesture, a refused share target): copy instead.
      }
    }
    await copy(url);
  }

  return (
    <div className="print-hidden flex flex-wrap gap-2">
      <button type="button" onClick={send} className="btn-outline min-h-9 px-4 text-sm" aria-live="polite">
        {isCopied ? "Copied" : canShare ? "Share link" : "Copy link"}
      </button>
      {print && (
        <button type="button" onClick={() => window.print()} className="btn-ghost min-h-9 px-3 text-sm">
          Print / PDF
        </button>
      )}
    </div>
  );
}
