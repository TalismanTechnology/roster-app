import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { VerificationMark } from "@/components/record/VerificationMark";
import { Site } from "@/components/shell/Site";
import { VerifyForm } from "@/components/verify/VerifyForm";
import { Img } from "@/components/ui/Img";
import { Corner, CORNER, Frame } from "@/components/ui/marks";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { canRespondToRequest } from "@/lib/data/local/rules";
import { entryContext, fullDate, kindLabel, placementLabel } from "@/lib/format";
import { sportName } from "@/lib/sports";

export const metadata: Metadata = {
  title: "Verify an entry",
  robots: { index: false, follow: false },
};

/**
 * What a coach sees when they open the link an athlete sent. One entry,
 * the athlete it belongs to, and a yes/no. No account, no sign-up: the
 * point of the product is that a coach's word is one tap away.
 */
export default async function VerifyPage({ params }: PageProps<"/verify/[token]">) {
  const { token } = await params;
  const [repo, user] = await Promise.all([getRepository(), getCurrentUser()]);
  const request = await repo.getVerificationRequest(token);

  if (!request) notFound();

  const { athlete, entry, coach } = request;
  const allowed = canRespondToRequest(request, user?.id ?? null);
  const measure = entry.value_display ?? placementLabel(entry);
  const context = entryContext(entry);

  return (
    <Site footer={false}>
      <main className="grid min-h-[calc(100svh-var(--header-h))] lg:grid-cols-12">
        <section className="flex flex-col justify-center lg:col-span-7" style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}>
          <div className="mx-auto w-full max-w-2xl">
            <p className="label flex items-center gap-2 text-ink-muted">
              <Corner d={CORNER.tl} /> Verification request
            </p>
            <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">
              {athlete.display_name} says this happened.
            </h1>
            <p className="mt-4 max-w-xl text-ink-muted">
              They listed you — {coach.name}
              {coach.role ? `, ${coach.role}` : ""} — as the coach who saw it. If it&rsquo;s right, say so and it carries your name on their resume. If it isn&rsquo;t, say that instead.
            </p>

            <Frame as="article" className="lifted mt-10" aria-label="The entry">
              <div style={{ padding: "var(--feature-pad)", paddingBlock: "clamp(1.5rem, 3vw, 2.25rem)" }}>
                <p className="label flex items-center justify-between gap-3 text-ink-muted">
                  <span>{kindLabel(entry.kind)}</span>
                  <time dateTime={entry.achieved_on}>{fullDate(entry.achieved_on)}</time>
                </p>
                <p className="font-display mt-4 leading-none tracking-tight" style={{ fontSize: measure ? "var(--text-display-lg)" : "var(--text-display)" }} data-numeric>
                  {measure ?? entry.title}
                  {measure && entry.unit && <span className="ml-1 text-xl font-normal text-ink-muted">{entry.unit}</span>}
                </p>
                <p className="mt-3 font-bold">{measure ? entry.title : context || kindLabel(entry.kind)}</p>
                {measure && context && <p className="label mt-1 text-ink-muted">{context}</p>}
                {entry.detail && <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">{entry.detail}</p>}
                <p className="label mt-5 flex flex-wrap items-center gap-x-2 border-t border-rule pt-4 text-ink-muted">
                  <Link href={`/${athlete.handle}`} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
                    {athlete.display_name}
                  </Link>
                  · {[sportName(athlete.primary_sport), athlete.school, athlete.grad_year ? `Class of ${athlete.grad_year}` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
            </Frame>

            <div className="mt-10">
              {allowed.ok ? (
                <VerifyForm token={token} coachName={coach.name} coachRole={coach.role} />
              ) : (
                <Outcome reason={allowed.reason} request={request} />
              )}
            </div>
          </div>
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

function Outcome({
  reason,
  request,
}: {
  reason: "used" | "expired" | "self";
  request: { status: string; verifier_name: string | null; note: string | null; responded_at: string | null };
}) {
  if (reason === "self") {
    return (
      <p role="status" className="border-t border-rule pt-5 text-ink-muted">
        You&rsquo;re signed in as the athlete. A record can&rsquo;t verify itself — send this link to your coach.
      </p>
    );
  }
  if (reason === "expired") {
    return (
      <p role="status" className="border-t border-rule pt-5 text-ink-muted">
        This link has expired. Ask the athlete to send a new one.
      </p>
    );
  }
  const state = request.status === "verified" ? "verified" : "disputed";
  // The action's revalidation re-renders this page the moment a coach
  // answers, so "just answered" is rendered here from the timestamp rather
  // than held in client state that would unmount.
  const isFresh = Boolean(request.responded_at && Date.now() - new Date(request.responded_at).getTime() < 2 * 60_000);

  if (isFresh) {
    return (
      <div role="status" className="flex flex-col gap-2 border-t border-rule pt-5">
        <p className="font-display flex items-center gap-2 text-display-sm">
          <VerificationMark state={state} />
          {request.status === "verified" ? "Verified. Thank you." : "Recorded as disputed."}
        </p>
        <p className="text-sm text-ink-muted">
          {request.status === "verified"
            ? "The entry now carries your name on the athlete's resume."
            : "The athlete will see your note and can correct the entry or ask again."}
        </p>
        <p className="label text-ink-muted">Each link works once.</p>
      </div>
    );
  }

  return (
    <div role="status" className="flex flex-col gap-2 border-t border-rule pt-5">
      <p className="flex items-center gap-2 font-bold">
        <VerificationMark state={state} />
        {request.status === "verified" ? "Already verified" : "Already answered"}
        {request.verifier_name && <span className="font-normal text-ink-muted">by {request.verifier_name}</span>}
        {request.responded_at && <span className="label text-ink-subtle">· {fullDate(request.responded_at.slice(0, 10))}</span>}
      </p>
      {request.note && <p className="text-sm italic text-ink-muted">“{request.note}”</p>}
      <p className="label text-ink-muted">Each link works once.</p>
    </div>
  );
}
