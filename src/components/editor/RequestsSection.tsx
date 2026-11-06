import Link from "next/link";

import type { CoachContact, RecordEntry, VerificationState } from "@/lib/database.types";
import type { VerificationRequest } from "@/lib/data/types";
import { VerificationMark } from "@/components/record/VerificationMark";
import { revokeVerification } from "@/lib/actions/resume";
import { isLiveRequest } from "@/lib/data/rules";
import { fullDate } from "@/lib/format";

import { EditorSection } from "./ProfileSections";
import { ResendRequest } from "./ResendRequest";

/**
 * The verification inbox: every link the athlete has created and what the
 * coach said. Links themselves are not here — only their hashes are stored —
 * so a pending row offers Revoke, and a new link comes from Resend or the
 * entry's row in the Record section. A dispute links straight back to that
 * row (#77).
 *
 * Expired links stay listed (#58), dimmed: superseded, revoked, or run out.
 * The newest request for an entry that is still unverified offers Resend —
 * a new link to the same coach — so a coach who missed the email is one
 * click from a second chance. Older expired rows are history only.
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
  // `requests` is newest first: the first row per entry is its latest.
  const latestForEntry = new Map<string, string>();
  for (const r of requests) if (!latestForEntry.has(r.achievement_id)) latestForEntry.set(r.achievement_id, r.id);

  return (
    <EditorSection
      id="requests"
      title="Verification requests"
      count={requests.length}
      lede="A verified entry carries the name of the coach who confirmed it. Requests expire after 30 days — resend one to give the coach a fresh link."
    >
      {requests.length === 0 ? (
        <div className="panel">
          <p className="text-ink-muted" style={{ padding: "var(--feature-pad)" }}>
            No requests yet. Open the Record section, choose an entry, and press <span className="font-bold text-ink">Request verification</span>.
          </p>
        </div>
      ) : (
        <ol className="panel divide-y divide-rule">
          {requests.map((r) => {
            const entry = entryById.get(r.achievement_id);
            const coach = coachById.get(r.coach_contact_id);
            const isLive = r.status === "pending" && isLiveRequest(r);
            // Closed (status expired) or out of date with no answer.
            const lapsed = r.status === "expired" || (r.status === "pending" && !isLive);
            const canResend =
              lapsed && Boolean(entry && coach) && entry?.verification !== "verified" && latestForEntry.get(r.achievement_id) === r.id;
            const state: VerificationState | null =
              r.status === "verified" ? "verified" : r.status === "disputed" ? "disputed" : isLive ? "submitted" : null;
            return (
              <li
                key={r.id}
                className={`flex flex-wrap items-start gap-x-6 gap-y-3 ${lapsed && !canResend ? "opacity-60" : ""}`}
                style={{ padding: "var(--feature-pad)" }}
              >
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-lg font-bold">{entry?.title ?? "Entry removed"}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    To {coach?.name ?? "a coach"} · sent {fullDate(r.created_at.slice(0, 10))}
                    {r.responded_at && ` · answered ${fullDate(r.responded_at.slice(0, 10))}`}
                  </p>
                  {r.flagged_unknown_athlete && (
                    <p className="label mt-2 text-disputed">[ Coach says they don&rsquo;t know you — check the reference ]</p>
                  )}
                  {r.note && <p className="mt-2 max-w-prose italic text-ink-muted">“{r.note}”</p>}
                  {r.verifier_name && r.status !== "pending" && (
                    <p className="mt-1 text-sm text-ink-muted">
                      — {r.verifier_name}
                      {r.verifier_role ? `, ${r.verifier_role}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {isLive && <span className="label text-ink-subtle">Expires {fullDate(r.expires_at.slice(0, 10))}</span>}
                  {r.status === "pending" && !isLive && <span className="label text-ink-subtle">Expired unanswered</span>}
                  {r.status === "expired" && <span className="label font-mono text-ink-subtle">[ Closed ]</span>}
                  {canResend && entry && coach && <ResendRequest entryId={entry.id} coachId={coach.id} coachName={coach.name} />}
                  {r.status === "pending" && (
                    // A lapsed link is already dead to the coach; closing it
                    // also takes the entry back out of "awaiting answer".
                    <form action={revokeVerification}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="btn-row">
                        {isLive ? "Revoke" : "Close"}
                      </button>
                    </form>
                  )}
                  {r.status === "disputed" && entry?.verification === "disputed" && (
                    <Link href={`/resume?section=record#entry-${r.achievement_id}`} className="btn-row">
                      Fix entry &amp; request again
                    </Link>
                  )}
                  {state && <VerificationMark state={state} />}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </EditorSection>
  );
}
