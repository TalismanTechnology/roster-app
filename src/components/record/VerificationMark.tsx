import type { VerificationState } from "@/lib/database.types";

/**
 * The trust signal, in the X language: verification IS the blue seal.
 *
 * The old system avoided the checkmark because social platforms devalued it;
 * adopting X's design language inverts that call deliberately — the scalloped
 * blue seal is the single most legible trust mark on the internet, and a
 * recruiter parses it in zero milliseconds. Roster's job is to make it mean
 * something again by only ever attaching it to an entry a coach stood behind.
 *
 * A verified entry gets the seal alone. The in-between states — in review,
 * disputed, not substantiated — stay worded pills, because "almost verified"
 * must never be mistakable for the real thing at a glance.
 */

const CHIP: Record<
  Exclude<VerificationState, "verified" | "unverified">,
  { label: string; className: string; description: string }
> = {
  submitted: {
    label: "In review",
    className: "text-pending bg-pending-bg",
    description: "Evidence submitted, awaiting review",
  },
  disputed: {
    label: "Disputed",
    className: "text-disputed bg-disputed-bg",
    description: "Flagged and under review",
  },
  rejected: {
    label: "Not substantiated",
    className: "text-ink-muted bg-wash",
    description: "Reviewed and not substantiated",
  },
};

export function VerificationMark({ state }: { state: VerificationState }) {
  // An unverified entry gets no mark at all. Absence is the signal — adding
  // "Unverified" to most of a young athlete's record would make the page read
  // as a list of doubts.
  if (state === "unverified") return null;

  if (state === "verified") {
    return <VerifiedSeal className="size-[18px]" />;
  }

  const chip = CHIP[state];

  return (
    <span
      className={`label inline-flex shrink-0 items-center rounded-full px-3 py-1 font-bold ${chip.className}`}
      title={chip.description}
    >
      {chip.label}
    </span>
  );
}

/**
 * The seal itself: a scalloped badge with a check, drawn to sit next to a
 * name or a mark. The geometry is Lucide's badge outline (ISC licensed),
 * filled — deliberately not X's own badge asset: the language is borrowed,
 * the artwork is ours to ship. Blue comes from `text-verified` so the one
 * token governs it everywhere.
 */
export function VerifiedSeal({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Verified"
      className={`text-verified inline-block shrink-0 align-text-bottom ${className ?? "size-5"}`}
    >
      <title>Verified — confirmed against submitted evidence</title>
      <path
        fill="currentColor"
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
      />
      <path
        d="m9 12 2 2 4-4"
        fill="none"
        stroke="var(--paper)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
