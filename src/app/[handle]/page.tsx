import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader } from "@/components/record/ProfileHeader";
import { RecordTimeline } from "@/components/record/RecordTimeline";
import type { Membership, Organization, Profile, RecordEntry } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * An athlete's record — the link they send a recruiter.
 *
 * Every query here runs under the viewer's own RLS context, so this component
 * never checks permissions itself. A profile the viewer may not see simply
 * returns no rows and 404s, which is also the correct answer for privacy: a
 * 403 would confirm the handle exists.
 */

type MembershipWithOrg = Membership & { organizations: Organization | null };

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

  const descriptor = [profile.level, profile.primary_sport, profile.grad_year]
    .filter(Boolean)
    .join(" · ");

  return {
    title: profile.display_name,
    description: profile.bio ?? `${profile.display_name} on Roster. ${descriptor}`,
    // Only a profile its owner has made public is indexable. The site-wide
    // default in the root layout is noindex.
    robots:
      profile.visibility === "public"
        ? { index: true, follow: true }
        : { index: false, follow: false },
  };
}

export default async function RecordPage({ params }: PageProps<"/[handle]">) {
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
  // add a round trip to the page a recruiter judges the product by.
  const [entriesResult, membershipsResult, followersResult] = await Promise.all([
    supabase
      .from("record_entries")
      .select("*")
      .eq("profile_id", profile.id)
      .order("is_pinned", { ascending: false })
      .order("achieved_on", { ascending: false })
      .returns<RecordEntry[]>(),

    supabase
      .from("memberships")
      .select("*, organizations(*)")
      .eq("profile_id", profile.id)
      .order("started_on", { ascending: false })
      .returns<MembershipWithOrg[]>(),

    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", profile.id)
      .not("accepted_at", "is", null),
  ]);

  const entries = entriesResult.data ?? [];
  const memberships = membershipsResult.data ?? [];

  // Fire-and-forget: the view counter must never delay or fail the render.
  void supabase.rpc("record_profile_view", { target: profile.id });

  return (
    <main className="mx-auto w-full max-w-3xl px-(--space-gutter) py-(--space-section)">
      <ProfileHeader
        profile={profile}
        memberships={memberships}
        stats={{
          verified: entries.filter((entry) => entry.verification === "verified").length,
          total: entries.length,
          followers: followersResult.count ?? 0,
        }}
      />

      <div className="mt-(--space-section)">
        <RecordTimeline entries={entries} />
      </div>
    </main>
  );
}
