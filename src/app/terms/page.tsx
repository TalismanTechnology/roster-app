import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { Site } from "@/components/shell/Site";
import { PRIVACY_CONTACT, SAFETY_CONTACT } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms",
  description: "The rules for using Roster: honest records, real coaches, and respect for athletes.",
  alternates: { canonical: "/terms" },
};

/** Terms of use (#44). The rules the product already enforces, in plain words. */
export default function TermsPage() {
  return (
    <Site>
      <LegalPage
        label="Terms"
        title="Play it straight."
        summary={
          <>
            <p>
              <strong>Post only true results.</strong> A verification is a real coach vouching for a real performance.
            </p>
            <p>
              <strong>Recruiters and coaches:</strong> contact details are for recruiting, nothing else.
            </p>
            <p>
              <strong>Break the rules</strong> and we can hide or suspend the resume or account.
            </p>
          </>
        }
      >
        <LegalSection n={1} title="Who can use Roster">
          <p>
            You must be at least 13. If you&rsquo;re under 18, a parent or guardian must agree to your resume, and to these terms on your
            behalf. Recruiter and coach accounts must belong to real people at the program they name.
          </p>
        </LegalSection>

        <LegalSection n={2} title="Your content">
          <p>
            You own what you post. You give Roster permission to host and display it as your visibility settings allow — on your resume, in
            search, in share cards and printouts — and nothing more. Remove it and that permission ends.
          </p>
          <p>
            You&rsquo;re responsible for it being accurate, and for having the right to post it (film you didn&rsquo;t record may belong to
            someone else).
          </p>
        </LegalSection>

        <LegalSection n={3} title="Verification">
          <p>
            Verification links go to the coach you name. Asking someone to verify something they didn&rsquo;t see, verifying for yourself, or
            impersonating a coach is a violation and will be removed. A coach&rsquo;s answer is their statement, not Roster&rsquo;s; we show who
            made it.
          </p>
        </LegalSection>

        <LegalSection n={4} title="Don’t">
          <ul className="list-disc pl-5 [&>li]:mt-1">
            <li>Impersonate another athlete, coach, or program.</li>
            <li>Post false, inflated, or someone else&rsquo;s results.</li>
            <li>Harass, solicit, or contact athletes for anything other than recruiting.</li>
            <li>Scrape, bulk-download, or resell profiles or contact details.</li>
            <li>Probe, overload, or work around the site&rsquo;s security or rate limits.</li>
          </ul>
        </LegalSection>

        <LegalSection n={5} title="Moderation">
          <p>
            Anyone can report a resume. We review reports and may hide content, suspend a resume, or close an account that breaks these terms
            — immediately where a minor&rsquo;s safety is involved. If you think we got it wrong, email{" "}
            <a href={`mailto:${SAFETY_CONTACT}`}>{SAFETY_CONTACT}</a>.
          </p>
        </LegalSection>

        <LegalSection n={6} title="The service">
          <p>
            Roster is free for athletes and provided as is. We work to keep it available and accurate but can&rsquo;t promise it never goes
            down, and we aren&rsquo;t responsible for recruiting outcomes or for decisions others make from what they read here. To the extent
            the law allows, our liability is limited to the amount you paid us — for athletes, nothing.
          </p>
        </LegalSection>

        <LegalSection n={7} title="Leaving">
          <p>
            You can delete your account any time from <Link href="/settings">Settings</Link>. We may close accounts that violate these terms.
          </p>
        </LegalSection>

        <LegalSection n={8} title="Changes and contact">
          <p>
            We&rsquo;ll post changes here and email account holders before material ones take effect. Questions:{" "}
            <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>. How we handle data is in the <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </LegalSection>
      </LegalPage>
    </Site>
  );
}
