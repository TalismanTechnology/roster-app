"use client";

import { useEffect, useId, useState } from "react";

/**
 * The search filters on a phone or tablet: folded behind one "Filters"
 * button, with a count and the applied filters as chips beside it, so the
 * results start above the fold. From lg the panel is always open and the
 * button is gone — the filters are the left column.
 *
 * Folding is presentation only: the fields stay mounted inside the one GET
 * form, so a query typed in the bar still submits every filter with it.
 */
export function FilterDisclosure({
  count,
  chips,
  children,
}: {
  /** Applied filters, not counting the name query (it's in the bar). */
  count: number;
  /** The applied filters, each a link that removes it. */
  chips?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  // Growing past lg shows the panel anyway; don't come back to it open.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => wide.matches && setIsOpen(false);
    wide.addEventListener("change", onWide);
    return () => wide.removeEventListener("change", onWide);
  }, []);

  return (
    <>
      <div className="flex min-w-0 items-center gap-2 lg:hidden">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((o) => !o)}
          className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-(--radius-input) border px-3.5 text-sm font-bold transition-colors ${
            isOpen ? "border-ink bg-wash text-ink" : "border-rule-strong text-ink hover:border-ink-muted"
          }`}
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M2 4h12M4.5 8h7M7 12h2" strokeLinecap="round" />
          </svg>
          Filters
          {count > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-xs leading-5 text-paper" data-numeric>
              {count}
              <span className="sr-only"> applied</span>
            </span>
          )}
          <svg
            viewBox="0 0 12 12"
            className={`size-3 text-ink-muted transition-transform duration-(--duration-fast) ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path d="M2 4.5l4 4 4-4" />
          </svg>
        </button>
        {chips}
      </div>

      <div id={panelId} className={`${isOpen ? "flex" : "hidden"} flex-col gap-5 max-lg:border-t max-lg:border-rule max-lg:pt-5 lg:flex`}>
        {children}
      </div>
    </>
  );
}
