import Link from "next/link";

import { Corner, CORNER } from "@/components/ui/marks";

/**
 * A verification link that cannot be answered, said plainly (#76). A coach
 * who clicks a stale link from their inbox should learn what happened and
 * what to do — not land on a bare 404 that reads like Roster is broken.
 *
 * `missing`: the token matches nothing — mistyped, truncated by a mail
 * client, or from before a reset. `expired`: past its 30 days, replaced by a
 * newer link, withdrawn by the athlete, or the entry was edited after it
 * was sent; the coach does not need to know which.
 */
export function LinkProblem({ kind, athleteName }: { kind: "missing" | "expired"; athleteName?: string }) {
  const copy =
    kind === "missing"
      ? {
          label: "Link not recognised",
          title: "This link doesn’t work.",
          body: "It may have been cut short by your email app, or mistyped. Try opening it again from the original message — or ask the athlete to send a fresh one.",
        }
      : {
          label: "Link expired",
          title: "This link has expired.",
          body: `${athleteName ?? "The athlete"} may have sent a newer link, changed the entry, or withdrawn the request. Links also stop working after 30 days. If they still need you, they can send a new one.`,
        };

  return (
    <div role="status" className="flex flex-col gap-3 border-t border-rule pt-5">
      <p className="label flex items-center gap-2 text-ink-muted">
        <Corner d={CORNER.tl} /> {copy.label}
      </p>
      <p className="font-display text-display-sm leading-tight">{copy.title}</p>
      <p className="max-w-prose text-ink-muted">{copy.body}</p>
      <p className="label text-ink-subtle">Nothing was recorded.</p>
      {kind === "missing" && (
        <p className="mt-2">
          <Link href="/" className="btn-row">
            What is Roster?
          </Link>
        </p>
      )}
    </div>
  );
}
