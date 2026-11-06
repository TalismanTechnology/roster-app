import type { ReactNode } from "react";

import { Corner, CORNER } from "@/components/ui/marks";
import { LEGAL_UPDATED } from "@/lib/legal";
import { fullDate } from "@/lib/format";

/**
 * The frame for /privacy and /terms: the same label-over-display heading as
 * the rest of the site, a summary box up top (what most people came for),
 * then numbered, hairline-ruled sections. Plain words; short.
 */
export function LegalPage({
  label,
  title,
  summary,
  children,
}: {
  label: string;
  title: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <main style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}>
      <div className="mx-auto max-w-3xl">
        <p className="label flex items-center gap-2 text-ink-muted">
          <Corner d={CORNER.tl} /> {label}
        </p>
        <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">{title}</h1>
        <p className="label mt-4 text-ink-subtle">Last updated {fullDate(LEGAL_UPDATED)}</p>

        <div className="mt-10 border border-rule bg-paper-raised/60 p-6">
          <h2 className="label text-ink-muted">[ The short version ]</h2>
          <div className="mt-3 flex flex-col gap-2 leading-relaxed">{summary}</div>
        </div>

        <ol className="mt-10 flex flex-col divide-y divide-rule border-y border-rule">{children}</ol>
      </div>
    </main>
  );
}

/** One numbered section. */
export function LegalSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid gap-3 py-8 sm:grid-cols-[4rem_1fr]">
      <span className="font-display text-2xl tracking-tighter text-ink-subtle" aria-hidden>
        {String(n).padStart(2, "0")}
      </span>
      <div>
        <h2 className="font-display text-display-sm tracking-tight">{title}</h2>
        <div className="mt-3 flex flex-col gap-3 leading-relaxed text-ink-muted [&_strong]:text-ink [&_a]:text-ink [&_a]:underline [&_a]:decoration-rule-strong [&_a]:underline-offset-4">
          {children}
        </div>
      </div>
    </li>
  );
}
