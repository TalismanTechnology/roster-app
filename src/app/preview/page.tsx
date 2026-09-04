import type { Metadata } from "next";

import { ResumeFrame } from "@/components/record/ResumeFrame";
import {
  previewCoaches,
  previewEntries,
  previewFilm,
  previewProfile,
} from "@/lib/fixtures";

/**
 * A database-free view of the resume.
 *
 * Renders the same frame the live `/[handle]` route uses, against fixtures.
 * Useful for design review and for anyone who has cloned the repo but not yet
 * stood up a Supabase project.
 */
export const metadata: Metadata = {
  title: "Interface preview",
  robots: { index: false, follow: false },
};

export default function PreviewPage() {
  return (
    // `max-lg:flex-1` rather than a plain `flex-1`: as a flex item, `flex-1`
    // sets `flex-basis: 0%` and then grows to fit content, which silently wins
    // over `h-dvh` and lets the frame run past the viewport — at which point
    // the panel's internal scrolling never engages and the rail's footer ends
    // up below the fold. Above `lg` the height must be definite and nothing
    // else may negotiate it.
    <div className="flex flex-col max-lg:flex-1 lg:h-dvh lg:overflow-hidden">
      <PreviewBanner />

      <ResumeFrame
        profile={previewProfile}
        entries={previewEntries}
        film={previewFilm}
        coaches={previewCoaches}
      />
    </div>
  );
}

/** Written straight on the desk, not boxed: chrome should sit a layer below
 *  the document, and a bordered strip would compete with the sheets. */
function PreviewBanner() {
  return (
    <p className="text-ink-muted shrink-0 px-5 pt-4 pb-0.5 text-sm sm:px-6">
      <span className="label text-ink mr-2">Preview</span>
      Sample data, no database. The live resume lives at{" "}
      <code className="text-ink">/[handle]</code>.
    </p>
  );
}
