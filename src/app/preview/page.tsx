import type { Metadata } from "next";

import { FeedPost } from "@/components/feed/FeedPost";
import { ProfileHeader } from "@/components/record/ProfileHeader";
import { RecordTimeline } from "@/components/record/RecordTimeline";
import {
  previewEntries,
  previewMemberships,
  previewPosts,
  previewProfile,
} from "@/lib/fixtures";

/**
 * A database-free view of the interface.
 *
 * Renders the same components the live routes use, against fixtures. Useful
 * for design review and for anyone who has cloned the repo but not yet stood
 * up a Supabase project.
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
          memberships={previewMemberships}
          stats={{
            verified: previewEntries.filter((e) => e.verification === "verified").length,
            total: previewEntries.length,
            followers: 214,
          }}
        />

        <div className="mt-(--space-section)">
          <RecordTimeline entries={previewEntries} />
        </div>

        <section className="mt-(--space-section)" aria-labelledby="preview-feed">
          <header className="border-rule-strong flex items-baseline justify-between border-b pb-3">
            <h2 id="preview-feed" className="label text-ink">
              The feed
            </h2>
          </header>

          <ol>
            {previewPosts.map((post) => (
              <FeedPost key={post.id} post={post} />
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}

function PreviewBanner() {
  return (
    <div className="border-rule bg-paper-sunken border-b">
      <p className="text-ink-muted mx-auto w-full max-w-3xl px-(--space-gutter) py-3 text-sm">
        <span className="label text-ink mr-2">Preview</span>
        Sample data, no database. The live record lives at{" "}
        <code className="text-ink">/[handle]</code>.
      </p>
    </div>
  );
}
