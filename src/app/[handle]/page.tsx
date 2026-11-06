import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { ReportProfile } from "@/components/record/ReportProfile";
import { ResumeDocument } from "@/components/record/ResumeDocument";
import { Site } from "@/components/shell/Site";
import { contactGate, redactForViewer } from "@/lib/contact";
import { getRepository } from "@/lib/data";
import { getCurrentProfile, getCurrentUser } from "@/lib/data/auth";
import { isStaff } from "@/lib/data/rules";
import { SAFETY_CONTACT } from "@/lib/legal";
import { logger } from "@/lib/logger";
import { profileDescriptor, profileJsonLd, serializeJsonLd } from "@/lib/seo";

/**
 * An athlete's resume — the link they send a recruiter.
 *
 * Every read goes through the repository with the viewer's id, so this
 * component never checks permissions itself. A private resume simply comes
 * back null and 404s, which is also the correct answer for privacy: a 403
 * would confirm the handle exists.
 *
 * Contact details (#44) are decided here too, once: the profile and the
 * references are redacted for this viewer before any component sees them
 * (lib/contact.ts), so a signed-out visitor's HTML never carries an address.
 */

export async function generateMetadata({ params }: PageProps<"/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const [repo, viewer] = await Promise.all([getRepository(), getCurrentUser()]);
  const profile = await repo.getProfileByHandle(handle, viewer?.id ?? null);

  if (!profile) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const descriptor = profileDescriptor(profile);
  const description = profile.bio ?? `${profile.display_name} on Roster. ${descriptor}`;
  const isPublic = profile.visibility === "public";

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
    // The image itself comes from ./opengraph-image and ./twitter-image.
    // A public resume gets the large card; an unlisted one is shared by
    // hand, one link at a time, so it keeps the small card and no bio.
    twitter: isPublic
      ? { card: "summary_large_image", title: `${profile.display_name} — ${descriptor}`, description }
      : { card: "summary", title: profile.display_name },
    // Only a public resume with something on it is indexable. Unlisted means
    // "reachable by link but not findable", and letting a crawler index it
    // would break that promise; an empty record is a thin page that would
    // sit in search results under the athlete's name saying nothing.
    robots:
      isPublic && profile.entry_count > 0
        ? { index: true, follow: true }
        : { index: false, follow: false },
  };
}

export default async function ResumePage({ params }: PageProps<"/[handle]">) {
  const { handle } = await params;
  const [repo, viewer, viewerProfile] = await Promise.all([getRepository(), getCurrentUser(), getCurrentProfile()]);
  const viewerId = viewer?.id ?? null;
  const profile = await repo.getProfileByHandle(handle, viewerId);

  // The repository already hides a suspended resume (#50) from everyone but
  // its owner and staff; this says so at the page too, so a regression in
  // either adapter fails closed.
  if (!profile || (profile.suspended_at !== null && profile.id !== viewerId && !isStaff(viewerProfile))) {
    notFound();
  }
  const isOwner = viewerId === profile.id;

  // Fetched in parallel — these are independent, and serialising them would
  // add round trips to the page a recruiter judges the product by.
  const [entries, film, allCoaches] = await Promise.all([
    repo.listEntries(profile.id),
    repo.listFilm(profile.id),
    repo.listCoaches(profile.id, viewerId),
  ]);
  const contactViewer = viewerProfile ? { id: viewerProfile.id, account_kind: viewerProfile.account_kind } : null;
  const contact = contactGate(profile, contactViewer);
  const shown = redactForViewer(profile, allCoaches, contactViewer);

  // After the response: the counter must never delay or fail the render,
  // but it must actually run — a bare un-awaited promise can be dropped
  // when the request ends (and a lazy PostgREST call never sends at all).
  after(async () => {
    try {
      await repo.recordView(profile.id, viewerId);
    } catch (error) {
      logger.error("profile.record_view.failed", { error, profileId: profile.id });
    }
  });

  return (
    <Site>
      {/* Structured data is for indexing, so only a public resume carries it. */}
      {profile.visibility === "public" && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(profileJsonLd(profile)) }} />
      )}
      <main>
        {isOwner && profile.suspended_at && (
          <p role="status" className="border-b border-rule bg-paper-raised/60 py-3 text-sm text-disputed" style={{ paddingInline: "var(--pad-x)" }}>
            This resume is suspended and hidden from everyone but you. If you think that&rsquo;s a mistake, email{" "}
            <a href={`mailto:${SAFETY_CONTACT}`} className="underline underline-offset-4">
              {SAFETY_CONTACT}
            </a>
            .
          </p>
        )}
        <ResumeDocument
          profile={shown.profile}
          entries={entries}
          film={film}
          coaches={shown.coaches}
          isOwner={isOwner}
          contact={contact}
          coachContactHidden={shown.coachContactHidden}
        />
        {!isOwner && <ReportProfile profileId={profile.id} name={profile.display_name} />}
      </main>
    </Site>
  );
}
