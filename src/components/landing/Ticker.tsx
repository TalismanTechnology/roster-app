"use client";

import ScrollVelocity from "@/components/bits/ScrollVelocity";

const ROWS = [
  "Verified by coaches  ·  One link  ·  No account to view  ·  ",
  "Results  ·  Film  ·  Academics  ·  References  ·  Any sport  ·  ",
];

/** Two counter-scrolling rows that speed up with scroll velocity. */
export function Ticker() {
  return (
    <div className="overflow-hidden border-y border-rule py-6 lg:py-8" aria-hidden>
      <ScrollVelocity
        texts={ROWS}
        velocity={40}
        numCopies={4}
        className="font-display tracking-tight text-ink-subtle"
        scrollerClassName="text-[clamp(1.75rem,3.5vw,3.25rem)] leading-[1.15]"
      />
    </div>
  );
}
