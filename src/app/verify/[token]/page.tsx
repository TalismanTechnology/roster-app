import type { Metadata } from "next";
import Link from "next/link";

import { VerificationMark } from "@/components/record/VerificationMark";
import { Site } from "@/components/shell/Site";
import { CoachBatch } from "@/components/verify/CoachBatch";
import { LinkProblem } from "@/components/verify/LinkProblem";
import { VerifyForm } from "@/components/verify/VerifyForm";
import { Img } from "@/components/ui/Img";
import { Corner, CORNER, Frame } from "@/components/ui/marks";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { canRespondToRequest } from "@/lib/data/rules";
import type { VerificationRequestDetail } from "@/lib/data/types";
import type { RecordEntry } from "@/lib/database.types";
import { entryContext, fullDate, kindLabel, placementLabel } from "@/lib/format";
import { sportName } from "@/lib/sports";

export const metadata: Metadata = {
  title: "Verify an entry",
  robots: { index: false, follow: false },
  // Belt to next.config's header: the token is the credential.
  referrer: "no-referrer",
};

/**
 * What a coach sees when they open the link an athlete sent. One entry,
 * the athlete it belongs to, who they're answering as, and a decision. No
 * account, no sign-up: the point of the product is that a coach's word is
 * one tap away. Below it, any other entries the same athlete is waiting on
 * this coach for, answerable on the same visit (#81).
 */
export default async function VerifyPage({ params }: PageProps<"/verify/[token]">) {
  const { token } = await params;
  const [repo, user] = await Promise.all([getRepository(), getCurrentUser()]);
  const request = await repo.getVerificationRequest(token);

  if (!request) {
    return (
      <Shell>
        <LinkProblem kind="missing" />
      </Shell>
    );
  }

  const { athlete, entry, coach } = request;
  const allowed = canRespondToRequest(request, user?.id ?? null);
  // The athlete viewing their own link gets no batch to answer either.
  const batch = allowed.ok || allowed.reason === "used" ? await repo.getCoachBatchRequests(token) : [];
  const answerable = user?.id === request.profile_id ? [] : batch;

  return (
    <Shell>
      <p className="label flex items-center gap-2 text-ink-muted">
        <Corner d={CORNER.tl} /> Verification request
      </p>
      <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">
        {athlete.display_name} says this happened.
      </h1>
      <p className="mt-4 max-w-xl text-ink-muted">
        They listed you as the coach who saw it. If it&rsquo;s right, say so and it carries your name on their resume. If it isn&rsquo;t, say that instead.
      </p>

      {/* #78: who the athlete thinks they're asking, before anything else. */}
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-y border-rule py-3 text-sm" aria-label="Who this was sent to">
        <dt className="label text-ink-subtle">[ Sent to ]</dt>
        <dd className="font-bold">
          {coach.name}
          {coach.role && <span className="font-normal text-ink-muted"> · {coach.role}</span>}
        </dd>
        {coach.org_name && (
          <>
            <dt className="label text-ink-subtle">[ Program ]</dt>
            <dd className="text-ink-muted">{coach.org_name}</dd>
          </>
        )}
        <dt className="label text-ink-subtle">[ Athlete ]</dt>
        <dd className="text-ink-muted">
          {[athlete.display_name, sportName(athlete.primary_sport), athlete.school, athlete.grad_year ? `Class of ${athlete.grad_year}` : null]
            .filter(Boolean)
            .join(" · ")}
        </dd>
      </dl>

      <EntryCard entry={entry} athlete={athlete} className="mt-8" />

      <div className="mt-10">
        <VerifyForm
          token={token}
          coachName={coach.name}
          coachRole={coach.role}
          athleteName={athlete.display_name}
          closed={allowed.ok ? null : allowed.reason === "expired" ? <LinkProblem kind="expired" athleteName={athlete.display_name} /> : <Outcome reason={allowed.reason} request={request} />}
        />
      </div>

      <CoachBatch
        token={token}
        coachName={coach.name}
        coachRole={coach.role}
        athleteName={athlete.display_name}
        items={answerable.map((sibling) => ({
          id: sibling.id,
          card: <EntryCard entry={sibling.entry} athlete={sibling.athlete} compact />,
        }))}
      />
    </Shell>
  );
}

/** The page frame: content left, the quiet photograph right on wide screens. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Site footer={false}>
      <main className="grid min-h-[calc(100svh-var(--header-h))] lg:grid-cols-12">
        <section className="flex flex-col justify-center lg:col-span-7" style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}>
          <div className="mx-auto w-full max-w-2xl">{children}</div>
        </section>

        <aside className="relative hidden lg:col-span-5 lg:block" aria-hidden>
          <Img id="04" className="absolute inset-0" sizes="42vw" quiet priority imgClassName="opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-paper to-transparent" />
        </aside>
      </main>
    </Site>
  );
}

function EntryCard({
  entry,
  athlete,
  compact = false,
  className = "",
}: {
  entry: RecordEntry;
  athlete: VerificationRequestDetail["athlete"];
  compact?: boolean;
  className?: string;
}) {
  const measure = entry.value_display ?? placementLabel(entry);
  const context = entryContext(entry);
  const size = compact ? "var(--text-display)" : measure ? "var(--text-display-lg)" : "var(--text-display)";

  return (
    <Frame as="article" className={`lifted ${className}`} aria-label={compact ? entry.title : "The entry"}>
      <div style={{ padding: "var(--feature-pad)", paddingBlock: compact ? "1.25rem" : "clamp(1.5rem, 3vw, 2.25rem)" }}>
        <p className="label flex items-center justify-between gap-3 text-ink-muted">
          <span>{kindLabel(entry.kind)}</span>
          <time dateTime={entry.achieved_on}>{fullDate(entry.achieved_on)}</time>
        </p>
        <p className="font-display mt-4 leading-none tracking-tight" style={{ fontSize: size }} data-numeric>
          {measure ?? entry.title}
          {measure && entry.unit && <span className="ml-1 text-xl font-normal text-ink-muted">{entry.unit}</span>}
        </p>
        <p className="mt-3 font-bold">{measure ? entry.title : context || kindLabel(entry.kind)}</p>
        {measure && context && <p className="label mt-1 text-ink-muted">{context}</p>}
        {entry.detail && <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">{entry.detail}</p>}
        {!compact && (
          <p className="label mt-5 flex flex-wrap items-center gap-x-2 border-t border-rule pt-4 text-ink-muted">
            <Link href={`/${athlete.handle}`} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
              {athlete.display_name}
            </Link>
            · {[sportName(athlete.primary_sport), athlete.school, athlete.grad_year ? `Class of ${athlete.grad_year}` : null].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </Frame>
  );
}

function Outcome({
  reason,
  request,
}: {
  reason: "used" | "self";
  request: {
    status: string;
    verifier_name: string | null;
    note: string | null;
    responded_at: string | null;
    flagged_unknown_athlete: boolean;
  };
}) {
  if (reason === "self") {
    return (
      <p role="status" className="border-t border-rule pt-5 text-ink-muted">
        You&rsquo;re signed in as the athlete. A record can&rsquo;t verify itself — send this link to your coach.
      </p>
    );
  }
  // "Just answered" is VerifyForm's to say — it holds the action's result.
  // Here the link was answered before this render, by whoever answered it.
  const state = request.status === "verified" ? "verified" : "disputed";

  return (
    <div role="status" className="flex flex-col gap-2 border-t border-rule pt-5">
      <p className="flex items-center gap-2 font-bold">
        <VerificationMark state={state} />
        {request.status === "verified"
          ? "Already verified"
          : request.flagged_unknown_athlete
            ? "Already answered — coach doesn’t know this athlete"
            : "Already answered"}
        {request.verifier_name && <span className="font-normal text-ink-muted">by {request.verifier_name}</span>}
        {request.responded_at && <span className="label text-ink-subtle">· {fullDate(request.responded_at.slice(0, 10))}</span>}
      </p>
      {request.note && <p className="text-sm italic text-ink-muted">“{request.note}”</p>}
      <p className="label text-ink-muted">Each link works once.</p>
    </div>
  );
}
