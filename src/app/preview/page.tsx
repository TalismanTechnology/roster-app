import type { Metadata } from "next";
import Link from "next/link";

import { ResumeFrame } from "@/components/record/ResumeFrame";
import { AppShell, SideCard } from "@/components/shell/AppShell";
import {
  previewCoaches,
  previewEntries,
  previewFilm,
  previewProfile,
} from "@/lib/fixtures";

/**
 * A database-free view of the resume.
 *
 * Renders the same shell and profile column the live `/[handle]` route uses,
 * against fixtures. Useful for design review and for anyone who has cloned
 * the repo but not yet stood up a Supabase project.
 */
export const metadata: Metadata = {
  title: "Interface preview",
  robots: { index: false, follow: false },
};

export default function PreviewPage() {
  return (
    <AppShell
      right={
        <SideCard title="This is a preview">
          <p className="text-ink-muted text-sm leading-normal">
            Sample data, no database. The live resume lives at{" "}
            <code className="text-ink">/[handle]</code>.
          </p>
          <Link href="/sign-up" className="btn-primary mt-1 self-start px-5">
            Create yours
          </Link>
        </SideCard>
      }
    >
      <ResumeFrame
        profile={previewProfile}
        entries={previewEntries}
        film={previewFilm}
        coaches={previewCoaches}
      />
    </AppShell>
  );
}
