import type { VerificationState } from "@/lib/database.types";
import { Verified } from "@/components/ui/marks";

/**
 * The trust signal. A verified entry gets the ink disc; the in-between
 * states — in review, disputed, not substantiated — stay worded chips so
 * "almost verified" is never mistakable for the real thing at a glance.
 *
 * Monochrome on purpose: the mark is the reading colour at full strength,
 * so it reads as part of the record rather than a badge stuck on it.
 */

const CHIP: Record<
  Exclude<VerificationState, "verified" | "unverified">,
  { label: string; className: string; description: string }
> = {
  submitted: {
    label: "In review",
    className: "text-pending bg-pending-bg",
    description: "Sent to a coach, awaiting their answer",
  },
  disputed: {
    label: "Disputed",
    className: "text-disputed bg-disputed-bg",
    description: "The coach did not confirm this entry",
  },
  rejected: {
    label: "Not substantiated",
    className: "text-ink-muted bg-wash",
    description: "Reviewed and not substantiated",
  },
};

export function VerificationMark({ state, className = "" }: { state: VerificationState; className?: string }) {
  // An unverified entry gets no visible mark. Absence is the signal — adding
  // "Unverified" to most of a young athlete's record would make the page read
  // as a list of doubts. A screen reader can't hear an absence, though, so
  // the status is still spoken, in the record's own neutral word.
  if (state === "unverified") return <span className="sr-only-text">Self-reported</span>;

  // Spoken as text rather than an SVG label: a labelled inline SVG is skipped
  // by some screen reader and browser pairings.
  if (state === "verified") {
    return (
      <span className={`inline-flex shrink-0 ${className}`}>
        <Verified className="text-[1.125em]" decorative />
        <span className="sr-only-text">Verified by coach</span>
      </span>
    );
  }

  const chip = CHIP[state];

  return (
    <span
      className={`label inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 font-bold ${chip.className} ${className}`}
      title={chip.description}
    >
      {chip.label}
      {/* `title` is hover-only and rarely announced; say the meaning outright. */}
      <span className="sr-only-text">. {chip.description}</span>
    </span>
  );
}

/** Kept for call sites that only ever want the verified mark itself. */
export function VerifiedSeal({ className = "" }: { className?: string }) {
  return <Verified className={className} />;
}
