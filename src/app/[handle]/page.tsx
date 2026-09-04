import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResumeFrame } from "@/components/record/ResumeFrame";
import { AppShell, SideCard } from "@/components/shell/AppShell";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { levelLabel, sportLabel } from "@/lib/format";

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
    return { title: "Not found" };
  }

  const descriptor = [
    levelLabel(profile.level),
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

  const isOwner = viewerId === profile.id;

  // Fire-and-forget: the view counter must never delay or fail the render.
  void repo.recordView(profile.id, viewerId);

  return (
    <AppShell
      right={
        isOwner ? (
          <SideCard title="Your resume">
            <p className="text-ink-muted text-sm leading-normal">
              {profile.visibility === "public"
                ? "Public — this is exactly what a recruiter sees."
                : profile.visibility === "unlisted"
                  ? "Unlisted — only people you send the link can see this."
                  : "Private — only you can see this."}
            </p>
            <Link href="/resume" className="btn-pill mt-1 self-start px-5">
              Edit resume
            </Link>
          </SideCard>
        ) : (
          <SideCard title="New to Roster?">
            <p className="text-ink-muted text-sm leading-normal">
              One link for your whole career — record, film, references,
              verified by your coaches. Free for athletes.
            </p>
            <Link href="/sign-up" className="btn-primary mt-1 self-start px-5">
              Create your resume
            </Link>
          </SideCard>
        )
      }
    >
      <ResumeFrame profile={profile} entries={entries} film={film} coaches={coaches} />
    </AppShell>
  );
}
