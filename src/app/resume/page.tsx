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
import type { CoachContact, FilmClip, Profile, RecordEntry } from "@/lib/database.types";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

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

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  // Signed in but no profile yet: onboarding was abandoned partway.
  if (!profile) redirect("/onboarding");

  const [entriesResult, filmResult, coachesResult] = await Promise.all([
    supabase
      .from("record_entries")
      .select("*")
      .eq("profile_id", user.id)
      .order("achieved_on", { ascending: false })
      .returns<RecordEntry[]>(),

    supabase
      .from("film_clips")
      .select("*")
      .eq("profile_id", user.id)
      .order("is_featured", { ascending: false })
      .order("position")
      .order("created_at")
      .returns<FilmClip[]>(),

    supabase
      .from("coach_contacts")
      .select("*")
      .eq("profile_id", user.id)
      .order("position")
      .order("created_at")
      .returns<CoachContact[]>(),
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

      <div className="flex flex-col gap-12">
        <IdentitySection profile={profile} />
        <RecordSection entries={entriesResult.data ?? []} />
        <FilmSection clips={filmResult.data ?? []} />
        <AcademicsSection profile={profile} />
        <CoachSection coaches={coachesResult.data ?? []} />
        <ContactSection profile={profile} />
        <VisibilitySection profile={profile} />
      </div>
    </main>
  );
}
