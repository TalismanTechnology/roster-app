import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buildChecklist, Checklist, firstUnfinished, type SectionId } from "@/components/editor/Checklist";
import { DirtyGuard } from "@/components/editor/DirtyGuard";
import { AcademicsSection, ContactSection, IdentitySection, VisibilitySection } from "@/components/editor/ProfileSections";
import { CoachSection, FilmSection, RecordSection } from "@/components/editor/RecordSections";
import { RequestsSection } from "@/components/editor/RequestsSection";
import { ScaledPreview } from "@/components/editor/ScaledPreview";
import { ResumeDocument } from "@/components/record/ResumeDocument";
import { ShareBar } from "@/components/record/ShareBar";
import { Site } from "@/components/shell/Site";
import { Corner, CORNER } from "@/components/ui/marks";
import { getRepository } from "@/lib/data";
import { homePathFor } from "@/lib/accounts";
import { getCurrentProfile, getCurrentUser } from "@/lib/data/auth";
import type { VerificationRequest } from "@/lib/data/types";
import { signInHref } from "@/lib/safe-next";
import { siteHost } from "@/lib/site";

export const metadata: Metadata = {
  title: "Edit your resume",
  robots: { index: false, follow: false },
};

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "record", label: "Record" },
  { id: "film", label: "Film" },
  { id: "academics", label: "Academics" },
  { id: "references", label: "References" },
  { id: "contact", label: "Contact" },
  { id: "visibility", label: "Visibility" },
  { id: "requests", label: "Requests" },
];

const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));

/**
 * The athlete's workspace. One section at a time — the section lives in the
 * URL so Back works and a link can point at "add your film" — chosen by a
 * checklist of what a recruiter would notice missing. A live preview of the
 * public resume sits beside it on wide screens, rendered by the same
 * component a recruiter gets and refreshed after every save. Leaving a
 * section with unsaved edits asks first (DirtyGuard).
 */
export default async function ResumeEditorPage({ searchParams }: PageProps<"/resume">) {
  const user = await getCurrentUser();
  if (!user) redirect(signInHref("/resume"));

  const repo = await getRepository();
  const profile = await getCurrentProfile();

  // Signed in but no profile yet: onboarding was abandoned partway.
  if (!profile) redirect("/onboarding");
  // Only athletes have a resume to edit; recruiters, coaches, brands, and
  // staff work from their lists.
  if (profile.account_kind !== "athlete") redirect(homePathFor(profile.account_kind));

  const [entries, film, coaches, publicCoaches, requests, weekViews, params] = await Promise.all([
    repo.listEntries(profile.id),
    repo.listFilm(profile.id),
    repo.listCoaches(profile.id, user.id),
    // What a recruiter gets — present only when public + recruitable.
    repo.listCoaches(profile.id, null),
    repo.listVerificationRequests(profile.id),
    repo.weeklyViews(profile.id),
    searchParams,
  ]);

  const checklist = buildChecklist(profile, entries, film, coaches);
  const requested = typeof params.section === "string" && SECTION_IDS.has(params.section) ? (params.section as SectionId) : null;
  const active: SectionId = requested ?? firstUnfinished(checklist);
  const visibility = { public: "Public", unlisted: "Unlisted", private: "Private" }[profile.visibility];
  const pendingCount = requests.filter((r: VerificationRequest) => r.status === "pending").length;

  return (
    <Site>
      <main className="flex flex-col gap-6 pb-16" style={{ paddingInline: "var(--pad-x)", paddingTop: "1.5rem" }}>
        <DirtyGuard />
        {/* Share bar: the link, the numbers, and the door to the public page. */}
        <section aria-label="Your resume" className="panel">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4" style={{ padding: "var(--feature-pad)" }}>
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
              <p className="flex items-center gap-2 whitespace-nowrap text-sm text-ink-muted">
                <Corner d={CORNER.tl} /> Your resume ·{" "}
                <span className={profile.visibility === "public" ? "font-bold text-ink" : "font-bold text-pending"}>{visibility}</span>
              </p>
              <p className="font-display mt-1 truncate text-display-sm">{profile.display_name}</p>
              <p className="truncate text-sm text-ink-muted">
                {siteHost()}/{profile.handle}
              </p>
            </div>

            <dl className="flex gap-8">
              {[
                [weekViews, "views this week"],
                [profile.verified_count, "verified"],
                [entries.length, entries.length === 1 ? "entry" : "entries"],
              ].map(([value, label]) => (
                <div key={String(label)}>
                  <dd className="font-display text-3xl leading-none tracking-tight" data-numeric>
                    {value}
                  </dd>
                  <dt className="mt-1 text-sm text-ink-muted">{label}</dt>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap items-center gap-2">
              <ShareBar handle={profile.handle} title={`${profile.display_name} · Roster`} print={false} />
              <Link href={`/${profile.handle}`} className="btn-primary min-h-10 px-4 text-sm">
                View as a recruiter
              </Link>
            </div>
          </div>
        </section>

        <Checklist items={checklist} active={active} pendingRequests={pendingCount} />

        <div className="grid min-w-0 gap-8 lg:grid-cols-12">
          {/* Section nav — desktop only; on phones the checklist chips navigate. */}
          <nav aria-label="Sections" className="print-hidden hidden min-w-0 lg:col-span-2 lg:block">
            <ol className="-mx-2 flex gap-1 overflow-x-auto px-2 pb-1 lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
              {SECTIONS.map((s) => {
                const isActive = s.id === active;
                // The section's own item; the extras (photo, a verified entry) show on the checklist.
                const isUnfinished = checklist.some((c) => c.key === s.id && !c.isDone);
                return (
                  <li key={s.id}>
                    <Link
                      href={`/resume?section=${s.id}`}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-2.5 text-base font-bold transition-colors ${
                        isActive ? "bg-ink text-paper" : "text-ink-muted hover:bg-wash hover:text-ink"
                      }`}
                    >
                      {s.label}
                      {s.id === "requests" && pendingCount > 0 && (
                        <span className={`rounded-full px-2 text-sm ${isActive ? "bg-paper/20" : "bg-pending-bg text-pending"}`} data-numeric>
                          {pendingCount}
                        </span>
                      )}
                      {isUnfinished && s.id !== "requests" && (
                        <span className={`size-2 rounded-full ${isActive ? "bg-paper/60" : "bg-pending"}`} aria-label="Not done" role="img" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* The active section */}
          <div className="min-w-0 lg:col-span-6">
            {active === "identity" && <IdentitySection profile={profile} />}
            {active === "record" && <RecordSection entries={entries} coaches={coaches} requests={requests} />}
            {active === "film" && <FilmSection clips={film} />}
            {active === "academics" && <AcademicsSection profile={profile} />}
            {active === "references" && <CoachSection coaches={coaches} />}
            {active === "contact" && <ContactSection profile={profile} />}
            {active === "visibility" && <VisibilitySection profile={profile} />}
            {active === "requests" && <RequestsSection requests={requests} entries={entries} coaches={coaches} />}

            <SectionPager active={active} />
          </div>

          {/* Live preview — the real page, as a recruiter sees it. */}
          <aside className="hidden lg:col-span-4 lg:block" aria-label="Live preview">
            <div className="sticky top-[calc(var(--header-h)+1rem)]">
              <p className="mb-2 flex items-center justify-between text-sm text-ink-muted">
                <span className="font-bold text-ink">Live preview</span>
                <span>As a recruiter sees it · updates on save</span>
              </p>
              <div className="max-h-[calc(100svh-var(--header-h)-4.5rem)] overflow-y-auto border border-rule bg-paper">
                <ScaledPreview scale={0.55}>
                  <ResumeDocument profile={profile} entries={entries} film={film} coaches={publicCoaches} />
                </ScaledPreview>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </Site>
  );
}

/** Previous / next section, so the editor reads like a form with steps. */
function SectionPager({ active }: { active: SectionId }) {
  const index = SECTIONS.findIndex((s) => s.id === active);
  const prev = SECTIONS[index - 1];
  const next = SECTIONS[index + 1];

  return (
    <nav aria-label="Previous and next section" className="mt-10 flex items-center justify-between gap-4 border-t border-rule pt-6">
      {prev ? (
        <Link href={`/resume?section=${prev.id}`} className="btn-ghost -ml-4">
          ← {prev.label}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={`/resume?section=${next.id}`} className="btn-outline">
          {next.label} →
        </Link>
      )}
    </nav>
  );
}
