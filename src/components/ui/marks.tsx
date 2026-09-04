import type { HTMLAttributes, ReactNode } from "react";

/**
 * The identity's marks. All pure SVG, all server-safe.
 *
 * Corner brackets frame a block instead of a card border; the checker and
 * the globe are the only ornament on the site; the verified mark is an ink
 * disc — monochrome on purpose, so the trust signal is the reading colour at
 * full strength rather than a second hue.
 */

export const CORNER = {
  tl: "M0 11.5V0.5H11.5",
  tr: "M0.5 0.5H11.5V11.5",
  bl: "M0 0.5V11.5H11.5",
  br: "M0.5 11.5H11.5V0.5",
} as const;

export function Corner({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`corner ${className}`} aria-hidden>
      <path d={d} />
    </svg>
  );
}

type FrameTag = "div" | "article" | "section" | "aside" | "li" | "figure" | "form";

/** Four corner brackets around whatever it wraps. */
export function Frame({
  children,
  className = "",
  as = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: FrameTag;
} & HTMLAttributes<HTMLElement>) {
  // Every tag in `FrameTag` accepts a div's attributes; narrowing once keeps
  // the spread typed without a cast per tag.
  const Tag = as as "div";
  return (
    <Tag className={`relative ${className}`} {...rest}>
      <Corner d={CORNER.tl} className="absolute top-0 left-0" />
      <Corner d={CORNER.tr} className="absolute top-0 right-0" />
      <Corner d={CORNER.bl} className="absolute bottom-0 left-0" />
      <Corner d={CORNER.br} className="absolute bottom-0 right-0" />
      {children}
    </Tag>
  );
}

const CHECKER_ROWS = [0, 4.5, 9, 13.5];
const CHECKER_COLS = [0, 7.6, 15.2, 22.8, 30.4];

export function Checker({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 18"
      className={`inline-block translate-y-[2px] ${className}`}
      style={{ width: "var(--checker-w)", height: "var(--checker-h)" }}
      aria-hidden
    >
      {CHECKER_ROWS.map((y, row) =>
        CHECKER_COLS.map((x) => (
          <rect
            key={`${row}-${x}`}
            x={x + (row % 2 ? 2.25 : 0)}
            y={y}
            width={3.8}
            height={3.8}
            fill="currentColor"
          />
        )),
      )}
    </svg>
  );
}

export function Globe({ className = "" }: { className?: string }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.2 } as const;
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      style={{ width: "var(--globe)", height: "var(--globe)" }}
      aria-hidden
    >
      <circle cx="32" cy="32" r="28" {...stroke} />
      <line x1="4" y1="32" x2="60" y2="32" {...stroke} />
      <ellipse cx="32" cy="32" rx="28" ry="14" {...stroke} />
      <ellipse cx="32" cy="32" rx="28" ry="24" {...stroke} />
      <line x1="32" y1="4" x2="32" y2="60" {...stroke} />
      <ellipse cx="32" cy="32" rx="14" ry="28" {...stroke} />
      <ellipse cx="32" cy="32" rx="24" ry="28" {...stroke} />
    </svg>
  );
}

/** The verification mark: an ink disc with a check, sized to the text. */
export function Verified({
  className = "",
  label = "Verified by coach",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`inline-block size-[1em] shrink-0 ${className}`}
      role="img"
      aria-label={label}
    >
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path
        d="M4.5 8.2l2.3 2.3 4.7-4.8"
        fill="none"
        stroke="var(--paper)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The empty ring that marks a self-reported entry beside verified ones. */
export function Unverified({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block size-[1em] shrink-0 rounded-full border border-ink-subtle ${className}`}
      role="img"
      aria-label="Self-reported"
    />
  );
}

export function ArrowUpRight({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={{ width: "var(--icon)", height: "var(--icon)" }}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}
