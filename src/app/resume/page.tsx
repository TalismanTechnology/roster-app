import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AcademicsSection, ContactSection, IdentitySection, VisibilitySection } from "@/components/editor/ProfileSections";
import { CoachSection, FilmSection, RecordSection } from "@/components/editor/RecordSections";
import { RequestsSection } from "@/components/editor/RequestsSection";
import { ResumeDocument } from "@/components/record/ResumeDocument";
import { ShareBar } from "@/components/record/ShareBar";
import { Site } from "@/components/shell/Site";
import { Corner, CORNER, Frame } from "@/components/ui/marks";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";

export const metadata: Metadata = {
  title: "Edit your resume",
  robots: { index: false, follow: false },
};

const RAIL = [
  ["identity", "Identity"],
  ["record", "Record"],
  ["film", "Film"],
  ["academics", "Academics"],
  ["references", "References"],
  ["contact", "Contact"],
  ["visibility", "Visibility"],
  ["requests", "Requests"],
] as const;

/**
 * The athlete's workspace. Left: every section of the resume as a form.
 * Right: the resume itself, rendered by the same component a recruiter
 * gets, refreshed after every save — one renderer, so the preview can never
 * drift from the page. The share bar on top answers "is it working?".
 */
export default async function ResumeEditorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const repo = await getRepository();
  const profile = await repo.getProfileById(user.id);

  // Signed in but no profile yet: onboarding was abandoned partway.
  if (!profile) redirect("/onboarding");

  const [entries, film, coaches, publicCoaches, requests, weekViews] = await Promise.all([
    repo.listEntries(profile.id),
    repo.listFilm(profile.id),
    repo.listCoaches(profile.id, user.id),
    // What a recruiter gets — redacted unless public + recruitable.
    repo.listCoaches(profile.id, null),
    repo.listVerificationRequests(profile.id),
    repo.weeklyViews(profile.id),
  ]);

  const visibility = { public: "Public", unlisted: "Unlisted", private: "Private" }[profile.visibility];

  return (
    <Site>
      <main className="flex flex-col" style={{ paddingInline: "var(--pad-x)" }}>
        {/* Share bar: the link, the numbers, and the door to the public page. */}
        <Frame as="section" aria-label="Your resume" className="lifted my-6">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4" style={{ padding: "var(--feature-pad)" }}>
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
              <p className="label flex items-center gap-2 whitespace-nowrap text-ink-muted">
                <Corner d={CORNER.tl} /> Your resume · <span className={profile.visibility === "public" ? "text-ink" : "text-pending"}>{visibility}</span>
              </p>
              <p className="font-display mt-1 truncate text-display-sm">roster.us/{profile.handle}</p>
            </div>

            <dl className="flex gap-6">
              {[
                [weekViews, "views this week"],
                [profile.verified_count, "verified"],
                [entries.length, entries.length === 1 ? "entry" : "entries"],
              ].map(([value, label]) => (
                <div key={String(label)}>
                  <dd className="font-display text-2xl leading-none tracking-tight" data-numeric>
                    {value}
                  </dd>
                  <dt className="label mt-1 text-ink-muted">{label}</dt>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap items-center gap-2">
              <ShareBar handle={profile.handle} print={false} />
              <Link href={`/${profile.handle}`} className="btn-primary min-h-9 px-4 text-sm">
                View as a recruiter
              </Link>
            </div>
          </div>
        </Frame>

        <div className="grid min-w-0 gap-10 pb-16 lg:grid-cols-12">
          {/* Rail — min-w-0 so the scrolling list can't widen the column. */}
          <nav aria-label="Sections" className="print-hidden min-w-0 lg:col-span-2">
            <ol className="-mx-3 flex gap-1 overflow-x-auto lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:mx-0 lg:flex-col lg:gap-0.5">
              {RAIL.map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="block whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-wash hover:text-ink"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Forms */}
          <div className="min-w-0 lg:col-span-6">
            <IdentitySection profile={profile} />
            <RecordSection entries={entries} coaches={coaches} requests={requests} />
            <FilmSection clips={film} />
            <AcademicsSection profile={profile} />
            <CoachSection coaches={coaches} />
            <ContactSection profile={profile} />
            <VisibilitySection profile={profile} />
            <RequestsSection requests={requests} entries={entries} coaches={coaches} />
          </div>

          {/* Live preview — the real page, as a recruiter sees it. */}
          <aside className="hidden lg:col-span-4 lg:block" aria-label="Live preview">
            <div className="sticky top-[calc(var(--header-h)+1rem)]">
              <p className="label mb-2 flex items-center justify-between text-ink-muted">
                <span>Live preview — as a recruiter sees it</span>
                <span>Updates on save</span>
              </p>
              <div className="max-h-[calc(100svh-var(--header-h)-4.5rem)] overflow-y-auto border border-rule bg-paper">
                <div style={{ zoom: 0.55 }}>
                  <ResumeDocument profile={profile} entries={entries} film={film} coaches={publicCoaches} />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </Site>
  );
}
