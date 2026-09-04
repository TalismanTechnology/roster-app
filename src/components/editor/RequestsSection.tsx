import type { CoachContact, RecordEntry, VerificationState } from "@/lib/database.types";
import type { VerificationRequest } from "@/lib/data/types";
import { VerificationMark } from "@/components/record/VerificationMark";
import { fullDate } from "@/lib/format";

import { CopyButton } from "./CopyButton";
import { EditorSection } from "./ProfileSections";

/**
 * The verification inbox: every link the athlete has created, what the
 * coach said, and — for pending ones — the link itself, in case the first
 * message didn't land.
 */
export function RequestsSection({
  requests,
  entries,
  coaches,
}: {
  requests: VerificationRequest[];
  entries: RecordEntry[];
  coaches: CoachContact[];
}) {
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const coachById = new Map(coaches.map((c) => [c.id, c]));
  const live = requests.filter((r) => r.status !== "expired");

  return (
    <EditorSection
      id="requests"
      title="Verification requests"
      count={live.length}
      lede="A verified entry carries the name of the coach who confirmed it. Requests expire after 30 days."
    >
      {live.length === 0 ? (
        <p className="border-y border-rule py-6 text-sm text-ink-muted">
          No requests yet. Open an entry above and choose <span className="text-ink">Request verification</span>.
        </p>
      ) : (
        <ol className="border-t border-rule">
          {live.map((r) => {
            const entry = entryById.get(r.achievement_id);
            const coach = coachById.get(r.coach_contact_id);
            // `live` excludes expired, so the remaining statuses map onto the
            // entry's own verification states one-to-one.
            const state: VerificationState = r.status === "pending" ? "submitted" : r.status === "verified" ? "verified" : "disputed";
            return (
              <li key={r.id} className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-rule py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{entry?.title ?? "Entry removed"}</p>
                  <p className="label mt-0.5 text-ink-muted">
                    To {coach?.name ?? "a coach"} · sent {fullDate(r.created_at.slice(0, 10))}
                    {r.responded_at && ` · answered ${fullDate(r.responded_at.slice(0, 10))}`}
                  </p>
                  {r.note && <p className="mt-2 max-w-prose text-sm italic text-ink-muted">“{r.note}”</p>}
                  {r.verifier_name && r.status !== "pending" && (
                    <p className="label mt-1 text-ink-muted">
                      — {r.verifier_name}
                      {r.verifier_role ? `, ${r.verifier_role}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {r.status === "pending" && <CopyButton value={`/verify/${r.token}`} label="Copy link" />}
                  <VerificationMark state={state} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </EditorSection>
  );
}
