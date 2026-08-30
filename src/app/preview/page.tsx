import type { Metadata } from "next";

import { ProfileHeader } from "@/components/record/ProfileHeader";
import { RecordTimeline } from "@/components/record/RecordTimeline";
import {
  AcademicsStrip,
  FilmStrip,
  ReferenceList,
} from "@/components/record/ResumeSections";
import {
  previewCoaches,
  previewEntries,
  previewFilm,
  previewProfile,
} from "@/lib/fixtures";

/**
 * A database-free view of the resume.
 *
 * Renders the same components the live `/[handle]` route uses, against
 * fixtures. Useful for design review and for anyone who has cloned the repo
 * but not yet stood up a Supabase project.
 */
export const metadata: Metadata = {
  title: "Interface preview",
  robots: { index: false, follow: false },
};

export default function PreviewPage() {
  return (
    <>
      <PreviewBanner />

      <main className="mx-auto w-full max-w-3xl px-(--space-gutter) py-(--space-section)">
        <ProfileHeader
          profile={previewProfile}
          stats={{
            verified: previewProfile.verified_count,
            total: previewProfile.entry_count,
            film: previewFilm.length,
          }}
        />

        <div className="mt-(--space-section) flex flex-col gap-(--space-section)">
          <FilmStrip clips={previewFilm} />
          <RecordTimeline entries={previewEntries} />
          <AcademicsStrip profile={previewProfile} />
          <ReferenceList coaches={previewCoaches} />
        </div>
      </main>
    </>
  );
}

function PreviewBanner() {
  return (
    <div className="border-rule bg-paper-sunken border-b">
      <p className="text-ink-muted mx-auto w-full max-w-3xl px-(--space-gutter) py-3 text-sm">
        <span className="label text-ink mr-2">Preview</span>
        Sample data, no database. The live resume lives at{" "}
        <code className="text-ink">/[handle]</code>.
      </p>
    </div>
  );
}
