"use client";

import { useState } from "react";

import { Corner, CORNER } from "@/components/ui/marks";

import { VerifyForm } from "./VerifyForm";

/**
 * The athlete's other entries waiting on this coach (#81), each answered on
 * its own with this page's link as authority.
 *
 * Holds the list it first rendered with. Answering one revalidates the page,
 * and the server's fresh list no longer contains it — without this the row
 * would unmount the instant it was answered and take its "Recorded" with it.
 * The page renders this unconditionally for the same reason.
 */
export function CoachBatch({
  token,
  coachName,
  coachRole,
  athleteName,
  items,
}: {
  token: string;
  coachName: string;
  coachRole: string | null;
  athleteName: string;
  /** Each sibling request with its entry card, rendered on the server. */
  items: { id: string; card: React.ReactNode }[];
}) {
  const [shown] = useState(items);
  if (shown.length === 0) return null;

  return (
    <section className="mt-16 border-t border-rule pt-8" aria-labelledby="batch-heading">
      <p id="batch-heading" className="label flex items-center gap-2 text-ink-muted">
        <Corner d={CORNER.tl} /> Also waiting on you · {shown.length}
      </p>
      <p className="mt-3 max-w-xl text-sm text-ink-muted">
        {athleteName} sent you {shown.length === 1 ? "another entry" : `${shown.length} more entries`}. Answer{" "}
        {shown.length === 1 ? "it" : "them"} here as {coachName} — each one on its own.
      </p>
      <ol className="mt-6 flex flex-col gap-8">
        {shown.map((item) => (
          <li key={item.id} className="flex flex-col gap-4">
            {item.card}
            <VerifyForm token={token} requestId={item.id} coachName={coachName} coachRole={coachRole} athleteName={athleteName} compact />
          </li>
        ))}
      </ol>
    </section>
  );
}
