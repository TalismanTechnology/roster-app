import type { VerificationState } from "@/lib/database.types";

/**
 * The trust signal on a record entry.
 *
 * Deliberately not a blue checkmark. Roster's claim is that its verification
 * means something, and the checkmark is the single most devalued symbol on the
 * internet — it now reads as "paid for" as often as "confirmed". So the mark is
 * typographic: a small-caps word behind a hairline rule, which looks like a
 * document stamp rather than a social badge.
 *
 * Colour never carries the meaning alone; the word is always present.
 */

const PRESENTATION: Record<
  VerificationState,
  { label: string; className: string; description: string } | null
> = {
  // An unverified entry gets no mark at all. Absence is the signal — adding
  // "Unverified" to most of a young athlete's record would make the page read
  // as a list of doubts.
  unverified: null,

  submitted: {
    label: "In review",
    className: "text-pending bg-pending-bg",
    description: "Evidence submitted, awaiting review",
  },
  verified: {
    label: "Verified",
    className: "text-verified bg-verified-bg",
    description: "Confirmed against submitted evidence",
  },
  disputed: {
    label: "Disputed",
    className: "text-disputed bg-disputed-bg",
    description: "Flagged and under review",
  },
  rejected: {
    label: "Not substantiated",
    className: "text-ink-subtle bg-paper-sunken",
    description: "Reviewed and not substantiated",
  },
};

export function VerificationMark({ state }: { state: VerificationState }) {
  const presentation = PRESENTATION[state];

  if (!presentation) return null;

  return (
    <span
      className={`label inline-flex shrink-0 items-center gap-1.5 rounded-[2px] px-1.5 py-1 ${presentation.className}`}
      title={presentation.description}
    >
      <VerificationGlyph state={state} />
      {presentation.label}
    </span>
  );
}

/**
 * A 8×8 glyph that differs in *shape* per state, not only in colour — so the
 * distinction survives greyscale printing and colour-blind vision, which the
 * checkmark-plus-colour convention does not.
 */
function VerificationGlyph({ state }: { state: VerificationState }) {
  const common = {
    width: 8,
    height: 8,
    viewBox: "0 0 8 8",
    "aria-hidden": true,
    className: "shrink-0",
  } as const;

  if (state === "verified") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.6}>
        <path d="M1 4.2 3 6.2 7 1.8" strokeLinecap="square" />
      </svg>
    );
  }

  if (state === "submitted") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.3}>
        <circle cx="4" cy="4" r="3.1" />
        <path d="M4 2.2V4l1.4 1.1" strokeLinecap="square" />
      </svg>
    );
  }

  if (state === "disputed") {
    return (
      <svg {...common} fill="currentColor">
        <path d="M4 0.4 7.7 7H0.3L4 0.4Z" />
      </svg>
    );
  }

  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.4}>
      <path d="M1.6 1.6 6.4 6.4M6.4 1.6 1.6 6.4" strokeLinecap="square" />
    </svg>
  );
}
