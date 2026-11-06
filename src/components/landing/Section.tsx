import type { ReactNode } from "react";

import { Corner, CORNER } from "@/components/ui/marks";
import { Reveal } from "@/components/ui/Reveal";

type Props = {
  id: string;
  label: string;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Skip the top hairline (for sections that start on an image). */
  flush?: boolean;
};

/**
 * A landing section: bracketed micro label, display title, content. Fades
 * up on first scroll into view. Server Component — the observer lives in
 * <Reveal>.
 */
export function Section({ id, label, title, aside, children, className = "", flush = false }: Props) {
  return (
    <Reveal
      as="section"
      id={id}
      aria-labelledby={`${id}-title`}
      className={`relative ${flush ? "" : "border-t border-rule"} ${className}`}
      style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}
    >
      <header
        className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
        style={{ marginBottom: "var(--section-head-gap)" }}
      >
        <div>
          <p className="label text-ink-muted flex items-center gap-2">
            <Corner d={CORNER.tl} />
            {label}
          </p>
          <h2 id={`${id}-title`} className="font-display text-display-lg mt-4 max-w-3xl leading-[1.02] tracking-tight text-balance">
            {title}
          </h2>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
    </Reveal>
  );
}
