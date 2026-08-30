import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProfileHeader } from "@/components/record/ProfileHeader";
import { RecordTimeline } from "@/components/record/RecordTimeline";
import {
  AcademicsStrip,
  FilmStrip,
  ReferenceList,
} from "@/components/record/ResumeSections";
import type { CoachContact, FilmClip, Profile, RecordEntry } from "@/lib/database.types";
import { levelLabel, sportLabel } from "@/lib/format";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * An athlete's resume — the link they send a recruiter.
 *
 * Every query here runs under the viewer's own RLS context, so this component
 * never checks permissions itself. A private resume simply returns no rows and
 * 404s, which is also the correct answer for privacy: a 403 would confirm the
 * handle exists.
 */

export async function generateMetadata({ params }: PageProps<"/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, handle, bio, visibility, level, primary_sport, grad_year")
    .eq("handle", handle)
    .maybeSingle();

  if (!profile) {
    return { title: "Not found" };
  }

  const descriptor = [
    levelLabel(profile.level as Profile["level"]),
    sportLabel(profile.primary_sport),
    profile.grad_year ? `Class of ${profile.grad_year}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title: profile.display_name,
    description: profile.bio ?? `${profile.display_name} on Roster. ${descriptor}`,
    // Only a public resume is indexable. Unlisted means "reachable by link but
    // not findable", and letting a crawler index it would break that promise.
    robots:
      profile.visibility === "public"
        ? { index: true, follow: true }
        : { index: false, follow: false },
  };
}

export default async function ResumePage({ params }: PageProps<"/[handle]">) {
  const { handle } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("handle", handle)
    .maybeSingle<Profile>();

  if (!profile) {
    notFound();
  }

  // Fetched in parallel — these are independent, and serialising them would
  // add round trips to the page a recruiter judges the product by.
  const [entriesResult, filmResult, coachesResult, viewer] = await Promise.all([
    supabase
      .from("record_entries")
      .select("*")
      .eq("profile_id", profile.id)
      .order("is_pinned", { ascending: false })
      .order("achieved_on", { ascending: false })
      .returns<RecordEntry[]>(),

    supabase
      .from("film_clips")
      .select("*")
      .eq("profile_id", profile.id)
      .order("is_featured", { ascending: false })
      .order("position")
      .order("created_at")
      .returns<FilmClip[]>(),

    supabase
      .from("coach_contacts")
      .select("*")
      .eq("profile_id", profile.id)
      .order("position")
      .order("created_at")
      .returns<CoachContact[]>(),

    getCurrentUser(),
  ]);

  const entries = entriesResult.data ?? [];
  const film = filmResult.data ?? [];
  const coaches = coachesResult.data ?? [];
  const isOwner = viewer?.id === profile.id;

  // Fire-and-forget: the view counter must never delay or fail the render.
  void supabase.rpc("record_profile_view", { target: profile.id });

  return (
    <main className="mx-auto w-full max-w-3xl px-(--space-gutter) py-(--space-section)">
      {isOwner && <OwnerBar visibility={profile.visibility} />}

      <ProfileHeader
        profile={profile}
        stats={{
          verified: profile.verified_count,
          total: profile.entry_count,
          film: film.length,
        }}
      />

      <div className="mt-(--space-section) flex flex-col gap-(--space-section)">
        <FilmStrip clips={film} />
        <RecordTimeline entries={entries} />
        <AcademicsStrip profile={profile} />
        {profile.is_recruitable && <ReferenceList coaches={coaches} />}
      </div>
    </main>
  );
}

/** Shown only to the athlete on their own page: the state of the door. */
function OwnerBar({ visibility }: { visibility: Profile["visibility"] }) {
  const note =
    visibility === "public"
      ? "This is your public resume — what a recruiter sees."
      : visibility === "unlisted"
        ? "Unlisted — only people you send the link can see this."
        : "Private — only you can see this.";

  return (
    <div className="border-rule bg-paper-sunken mb-8 flex flex-wrap items-baseline justify-between gap-3 border p-4">
      <p className="text-ink-muted text-sm">{note}</p>
      <Link
        href="/resume"
        className="label text-ink decoration-rule-strong hover:decoration-ink cursor-pointer underline underline-offset-4"
      >
        Edit resume →
      </Link>
    </div>
  );
}
