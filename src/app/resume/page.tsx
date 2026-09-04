import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AcademicsSection,
  ContactSection,
  IdentitySection,
  VisibilitySection,
} from "@/components/editor/ProfileSections";
import { CoachSection, FilmSection, RecordSection } from "@/components/editor/RecordSections";
import { signOut } from "@/lib/actions/auth";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";

export const metadata: Metadata = {
  title: "Edit your resume",
  robots: { index: false, follow: false },
};

/**
 * The athlete's editor — everything on their public page, editable in one
 * scroll. One page rather than a tabbed settings area: a resume is a single
 * document, and seeing all of it while editing any of it is how you notice
 * the section you left empty.
 */
export default async function ResumeEditorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const repo = await getRepository();
  const profile = await repo.getProfileById(user.id);

  // Signed in but no profile yet: onboarding was abandoned partway.
  if (!profile) redirect("/onboarding");

  const [entries, film, coaches] = await Promise.all([
    repo.listEntries(profile.id),
    repo.listFilm(profile.id),
    repo.listCoaches(profile.id, user.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-(--space-gutter) py-(--space-section)">
      <header className="flex flex-wrap items-baseline justify-between gap-4 pb-8">
        <div>
          <p className="label text-ink-subtle">Your resume</p>
          <h1 className="font-display text-display mt-2 leading-[0.95] tracking-tight">
            {profile.display_name}
          </h1>
          <p className="text-ink-muted mt-3 text-sm">
            Live at{" "}
            <Link
              href={`/${profile.handle}`}
              className="text-ink decoration-rule-strong hover:decoration-ink cursor-pointer underline underline-offset-4"
            >
              roster.us/{profile.handle}
            </Link>
            {profile.visibility !== "public" && (
              <span className="label text-pending ml-3">
                {profile.visibility === "private" ? "Private" : "Unlisted"}
              </span>
            )}
          </p>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="label text-ink-muted hover:text-ink cursor-pointer underline decoration-transparent underline-offset-4 transition-colors duration-(--duration-fast) hover:decoration-ink"
          >
            Sign out
          </button>
        </form>
      </header>

      <div className="flex flex-col gap-5">
        <IdentitySection profile={profile} />
        <RecordSection entries={entries} />
        <FilmSection clips={film} />
        <AcademicsSection profile={profile} />
        <CoachSection coaches={coaches} />
        <ContactSection profile={profile} />
        <VisibilitySection profile={profile} />
      </div>
    </main>
  );
}
