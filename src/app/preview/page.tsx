import type { Metadata } from "next";
import Link from "next/link";

import { ResumeDocument } from "@/components/record/ResumeDocument";
import { Site } from "@/components/shell/Site";
import { previewCoaches, previewEntries, previewFilm, previewProfile } from "@/lib/fixtures";

/**
 * A database-free view of the resume.
 *
 * Renders exactly the component the live `/[handle]` route uses, against
 * fixtures. Useful for design review and for anyone who has cloned the repo
 * but not yet stood up a database.
 */
export const metadata: Metadata = {
  title: "Interface preview",
  robots: { index: false, follow: false },
};

export default function PreviewPage() {
  return (
    <Site>
      <p
        className="print-hidden label flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-paper-raised/60 py-2 text-ink-muted"
        style={{ paddingInline: "var(--pad-x)" }}
      >
        <span>Preview — sample data, no database. Every name here is fictional.</span>
        <Link href="/sign-up" className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
          Create yours
        </Link>
      </p>
      <main>
        <ResumeDocument profile={previewProfile} entries={previewEntries} film={previewFilm} coaches={previewCoaches} />
      </main>
    </Site>
  );
}
