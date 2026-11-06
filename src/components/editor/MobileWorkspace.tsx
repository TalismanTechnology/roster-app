"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type RefObject } from "react";

import { ScaledPreview } from "./ScaledPreview";

/**
 * The editor below lg, where there is no side-by-side preview and no section
 * column: a sticky strip of sections a thumb can swipe, and a Preview button
 * that lays the live resume over the editor full screen. The editor stays
 * mounted underneath — unsaved fields, scroll position, and section are all
 * where the athlete left them when they tap Edit.
 *
 * The preview is one element in both layouts: from lg it is the scaled
 * column beside the form, below lg the drawer. Rendering it once keeps the
 * page to one resume (one h1, one set of ids).
 */

type PreviewState = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
};

const PreviewContext = createContext<PreviewState | null>(null);

function usePreview(): PreviewState {
  const state = useContext(PreviewContext);
  if (!state) throw new Error("usePreview outside <PreviewProvider>");
  return state;
}

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  return <PreviewContext.Provider value={{ isOpen, setIsOpen, toggleRef }}>{children}</PreviewContext.Provider>;
}

export type BarSection = { id: string; label: string; badge?: number; isUnfinished?: boolean };

/** The sticky section strip with the Preview toggle at its end. Below lg only. */
export function SectionBar({ sections, active }: { sections: BarSection[]; active: string }) {
  const { isOpen, setIsOpen, toggleRef } = usePreview();
  const navRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLOListElement>(null);
  const isFirst = useRef(true);

  useEffect(() => {
    // The active pill scrolled to the middle of the strip, not off its edge.
    const scroller = scrollerRef.current;
    const pill = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (scroller && pill) scroller.scrollLeft = pill.offsetLeft - (scroller.clientWidth - pill.offsetWidth) / 2;

    // Switching while the strip is stuck: the new section starts right under
    // it, not wherever the old one had been scrolled to. (Links don't scroll
    // to the top — that would bury the strip under the checklist again.)
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const nav = navRef.current;
    const above = nav?.previousElementSibling;
    if (!nav || !above || !nav.parentElement) return;
    const gap = parseFloat(getComputedStyle(nav.parentElement).rowGap) || 0;
    const stuckAt = parseFloat(getComputedStyle(nav).top) || 0;
    const target = above.getBoundingClientRect().bottom + window.scrollY + gap - stuckAt;
    if (window.scrollY > target) window.scrollTo({ top: target });
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label="Sections"
      className="print-hidden bar-blur sticky z-30 -mx-(--pad-x) border-y border-rule lg:hidden"
      style={{ top: "calc(var(--header-h) + var(--safe-top))" }}
    >
      <div className="flex items-center gap-2 py-1.5 pr-(--pad-x)">
        <ol
          ref={scrollerRef}
          className="scrollbar-none flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain scroll-smooth pl-(--pad-x) [mask-image:linear-gradient(to_right,transparent,#000_0.75rem,#000_calc(100%-1.5rem),transparent)]"
        >
          {sections.map((s) => {
            const isActive = s.id === active;
            return (
              <li key={s.id} className="shrink-0">
                <Link
                  href={`/resume?section=${s.id}`}
                  scroll={false}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-bold transition-colors ${
                    isActive ? "bg-ink text-paper" : "text-ink-muted hover:bg-wash hover:text-ink active:bg-wash"
                  }`}
                >
                  {s.label}
                  {typeof s.badge === "number" && s.badge > 0 && (
                    <span className={`rounded-full px-1.5 text-xs leading-5 ${isActive ? "bg-paper/20" : "bg-pending-bg text-pending"}`} data-numeric>
                      {s.badge}
                    </span>
                  )}
                  {s.isUnfinished && <span className={`size-1.5 rounded-full ${isActive ? "bg-paper/60" : "bg-pending"}`} aria-label="Not done" role="img" />}
                </Link>
              </li>
            );
          })}
        </ol>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={isOpen}
          aria-controls="live-preview"
          onClick={() => setIsOpen(true)}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-(--radius-input) border border-ink-muted px-3 text-sm font-bold transition-colors hover:border-ink hover:bg-ink hover:text-paper"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
            <circle cx="8" cy="8" r="2" />
          </svg>
          Preview
        </button>
      </div>
    </nav>
  );
}

/**
 * The live resume: a scaled sticky column from lg; below lg nothing until
 * Preview, then a full-screen sheet with an Edit button back.
 */
export function PreviewPane({ children }: { children: React.ReactNode }) {
  const { isOpen, setIsOpen, toggleRef } = usePreview();
  const editRef = useRef<HTMLButtonElement>(null);
  const [isWide, setIsWide] = useState(true);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setIsWide(wide.matches);
      // The sheet has no meaning beside a visible column.
      if (wide.matches) setIsOpen(false);
    };
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, [setIsOpen]);

  useEffect(() => {
    if (!isOpen) return;
    // The page under the sheet holds still — and keeps its scroll position.
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    editRef.current?.focus();
    const toggle = toggleRef.current;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      toggle?.focus({ preventScroll: true });
    };
  }, [isOpen, setIsOpen, toggleRef]);

  return (
    <aside
      id="live-preview"
      aria-label="Live preview"
      role={isOpen ? "dialog" : undefined}
      aria-modal={isOpen ? true : undefined}
      className={isOpen ? "fixed inset-0 z-50 flex flex-col bg-paper" : "hidden lg:col-span-4 lg:block"}
    >
      {isOpen && (
        <div className="pt-safe shrink-0 border-b border-rule bg-paper" style={{ paddingInline: "var(--pad-x)" }}>
          <div className="flex min-h-14 items-center justify-between gap-3">
            <p className="min-w-0 text-sm text-ink-muted">
              <span className="block font-bold text-ink">Live preview</span>
              <span className="block truncate">As a recruiter sees it · updates on save</span>
            </p>
            <button ref={editRef} type="button" onClick={() => setIsOpen(false)} className="btn-primary shrink-0 px-4 text-sm">
              ← Edit
            </button>
          </div>
        </div>
      )}
      <div className={isOpen ? "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe [&_nav]:!top-0" : "sticky top-[calc(var(--header-h)+var(--safe-top)+1rem)]"}>
        <p className={isOpen ? "hidden" : "mb-2 flex items-center justify-between text-sm text-ink-muted"}>
          <span className="font-bold text-ink">Live preview</span>
          <span>As a recruiter sees it · updates on save</span>
        </p>
        <div className={isOpen ? "" : "max-h-[calc(100svh-var(--header-h)-4.5rem)] overflow-y-auto border border-rule bg-paper"}>
          <ScaledPreview scale={isWide ? 0.55 : 1}>{children}</ScaledPreview>
        </div>
      </div>
    </aside>
  );
}
