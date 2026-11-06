import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { ResumeDocument } from "@/components/record/ResumeDocument";
import { Site } from "@/components/shell/Site";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { levelLabel } from "@/lib/format";
import { sportName } from "@/lib/sports";

/**
 * An athlete's resume — the link they send a recruiter.
 *
 * Every read goes through the repository with the viewer's id, so this
 * component never checks permissions itself. A private resume simply comes
 * back null and 404s, which is also the correct answer for privacy: a 403
 * would confirm the handle exists.
 */

export async function generateMetadata({ params }: PageProps<"/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const [repo, viewer] = await Promise.all([getRepository(), getCurrentUser()]);
  const profile = await repo.getProfileByHandle(handle, viewer?.id ?? null);

  if (!profile) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const descriptor = [levelLabel(profile.level), sportName(profile.primary_sport), profile.grad_year ? `Class of ${profile.grad_year}` : null]
    .filter(Boolean)
    .join(" · ");
  const description = profile.bio ?? `${profile.display_name} on Roster. ${descriptor}`;

  return {
    title: profile.display_name,
    description,
    alternates: { canonical: `/${profile.handle}` },
    openGraph: {
      title: `${profile.display_name} — ${descriptor}`,
      description,
      type: "profile",
      url: `/${profile.handle}`,
    },
    // Only a public resume with something on it is indexable. Unlisted means
    // "reachable by link but not findable", and letting a crawler index it
    // would break that promise; an empty record is a thin page that would
    // sit in search results under the athlete's name saying nothing.
    robots:
      profile.visibility === "public" && profile.entry_count > 0
        ? { index: true, follow: true }
        : { index: false, follow: false },
  };
}

export default async function ResumePage({ params }: PageProps<"/[handle]">) {
  const { handle } = await params;
  const [repo, viewer] = await Promise.all([getRepository(), getCurrentUser()]);
  const viewerId = viewer?.id ?? null;
  const profile = await repo.getProfileByHandle(handle, viewerId);

  if (!profile) {
    notFound();
  }

  // Fetched in parallel — these are independent, and serialising them would
  // add round trips to the page a recruiter judges the product by.
  const [entries, film, coaches] = await Promise.all([
    repo.listEntries(profile.id),
    repo.listFilm(profile.id),
    repo.listCoaches(profile.id, viewerId),
  ]);

  // After the response: the counter must never delay or fail the render,
  // but it must actually run — a bare un-awaited promise can be dropped
  // when the request ends (and a lazy PostgREST call never sends at all).
  after(async () => {
    try {
      await repo.recordView(profile.id, viewerId);
    } catch (error) {
      console.error("[roster] recordView failed", error);
    }
  });

  return (
    <Site>
      <main>
        <ResumeDocument profile={profile} entries={entries} film={film} coaches={coaches} isOwner={viewerId === profile.id} />
      </main>
    </Site>
  );
}
