import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { Site } from "@/components/shell/Site";
import { PRIVACY_CONTACT, SAFETY_CONTACT } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Roster collects, who sees it, and how athletes — including minors — stay in control.",
  alternates: { canonical: "/privacy" },
};

/**
 * Privacy policy (#44). Written for the people it is about — many of them
 * high-school athletes and their parents — so it says what the product
 * actually does, section by section, and nothing it doesn't.
 */
export default function PrivacyPage() {
  return (
    <Site>
      <LegalPage
        label="Privacy"
        title="Your record. Your call."
        summary={
          <>
            <p>
              <strong>You choose who sees your resume:</strong> public, unlisted, or private — and you can change it any time.
            </p>
            <p>
              <strong>Your email and phone are never shown to the public.</strong> Only signed-in recruiters and coaches can see them,
              and only while you&rsquo;re open to recruiting.
            </p>
            <p>
              <strong>We don&rsquo;t sell your data</strong> and we don&rsquo;t run ads. Delete your account and it&rsquo;s gone.
            </p>
          </>
        }
      >
        <LegalSection n={1} title="What we collect">
          <p>
            <strong>Your account:</strong> email address and a password (stored only as a one-way hash).
          </p>
          <p>
            <strong>Your resume:</strong> what you type in — name, school, sport, results, film links, academics, references, and an optional
            photo. If you&rsquo;re under 18, we record that a parent or guardian agreed, and when.
          </p>
          <p>
            <strong>Usage:</strong> a daily view count per resume, and — if you opt in — how many signed-in recruiters and coaches looked this
            week. Counts only; never who. Server logs keep request details for troubleshooting, with email addresses masked.
          </p>
        </LegalSection>

        <LegalSection n={2} title="Who sees what">
          <p>
            <strong>Public</strong> resumes appear in search and can be opened by anyone with the link. <strong>Unlisted</strong> resumes open by
            link only and are hidden from search engines. <strong>Private</strong> resumes are visible only to you.
          </p>
          <p>
            Your <strong>contact email and phone</strong>, and your references&rsquo; contact details, are shown only to signed-in recruiter and
            coach accounts, only on a public resume, and only while you&rsquo;re marked open to recruiting. Everyone else sees a masked hint.
          </p>
          <p>
            Coaches you ask to verify an entry see that entry, your name, and your school — never your contact details.
          </p>
        </LegalSection>

        <LegalSection n={3} title="Athletes under 18">
          <p>
            Roster is for athletes 13 and older. If you&rsquo;re under 18, a parent or guardian must agree before you publish a resume, and you
            confirm that during setup. We recommend keeping a minor&rsquo;s resume unlisted until a parent has reviewed it.
          </p>
          <p>
            A parent or guardian can ask us to review, change, or delete a minor&rsquo;s resume at any time by emailing{" "}
            <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>. We do not knowingly collect information from children under 13;
            if we learn we have, we delete it.
          </p>
        </LegalSection>

        <LegalSection n={4} title="Who we share it with">
          <p>
            Only the services that run Roster: hosting (Vercel), our database and file storage (Supabase), and email delivery (Resend). They
            process data on our behalf and for no other purpose.
          </p>
          <p>We don&rsquo;t sell personal information, share it for advertising, or let third-party trackers onto the site.</p>
          <p>We&rsquo;ll disclose information if the law requires it, or to protect someone from harm.</p>
        </LegalSection>

        <LegalSection n={5} title="Your controls">
          <p>
            From <Link href="/settings">Settings</Link> and the editor you can change your visibility, edit or remove anything on your
            resume, change your email or password, and <strong>delete your account</strong> — which removes your resume, entries, film,
            references, and lists. Backups roll off within 30 days.
          </p>
          <p>
            For a copy of your data, or anything you can&rsquo;t do yourself, email <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.
          </p>
        </LegalSection>

        <LegalSection n={6} title="Security">
          <p>
            Passwords are hashed, verification links are stored only as hashes, every connection is encrypted, and access to data is enforced by
            row-level rules in the database itself. Forms that anyone can reach are rate-limited.
          </p>
        </LegalSection>

        <LegalSection n={7} title="Reporting a problem">
          <p>
            Every public resume has a <strong>Report</strong> link. For anything urgent — especially involving a minor&rsquo;s safety — email{" "}
            <a href={`mailto:${SAFETY_CONTACT}`}>{SAFETY_CONTACT}</a>.
          </p>
        </LegalSection>

        <LegalSection n={8} title="Changes">
          <p>
            If we change this policy in a way that matters, we&rsquo;ll update the date above and tell account holders by email before it takes
            effect. See also the <Link href="/terms">Terms</Link>.
          </p>
        </LegalSection>
      </LegalPage>
    </Site>
  );
}
