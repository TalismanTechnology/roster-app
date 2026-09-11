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
  const live = requests;

  return (
    <EditorSection
      id="requests"
      title="Verification requests"
      count={live.length}
      lede="Requests expire after 30 days. Creating a link does not send an email; share it with the coach yourself."
    >
      {live.length === 0 ? (
        <div className="panel">
          <p className="text-ink-muted" style={{ padding: "var(--feature-pad)" }}>
            No requests yet. Open the Record section, choose an entry, and press <span className="font-bold text-ink">Request verification</span>.
          </p>
        </div>
      ) : (
        <ol className="panel divide-y divide-rule">
          {live.map((r) => {
            const entry = entryById.get(r.achievement_id);
            const coach = coachById.get(r.coach_contact_id);
            // Expired requests retain their history but do not offer an active link.
            const state: VerificationState = r.status === "pending" ? "submitted" : r.status === "verified" ? "verified" : "disputed";
            return (
              <li key={r.id} className="flex flex-wrap items-start gap-x-6 gap-y-3" style={{ padding: "var(--feature-pad)" }}>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-lg font-bold">{entry?.title ?? "Entry removed"}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    For {coach?.name ?? "a coach"} · created {fullDate(r.created_at.slice(0, 10))}
                    {r.responded_at && ` · answered ${fullDate(r.responded_at.slice(0, 10))}`}
                  </p>
                  {r.note && <p className="mt-2 max-w-prose italic text-ink-muted">“{r.note}”</p>}
                  {r.verifier_name && r.status !== "pending" && (
                    <p className="mt-1 text-sm text-ink-muted">
                      — {r.verifier_name}
                      {r.verifier_role ? `, ${r.verifier_role}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {r.status === "pending" && new Date(r.expires_at).getTime() >= Date.now() && r.token && <CopyButton value={`/verify/${r.token}`} label="Copy link" className="btn-row" />}
                  {r.status === "expired" || (r.status === "pending" && new Date(r.expires_at).getTime() < Date.now()) ? <span className="text-sm text-ink-muted">Expired</span> : <VerificationMark state={state} />}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </EditorSection>
  );
}
