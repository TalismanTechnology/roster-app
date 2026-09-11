import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { safeAuthReturn } from "@/lib/auth-return";
import { signUp } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/data/auth";

export const metadata: Metadata = {
  title: "Create your resume",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({searchParams}: {searchParams: Promise<{next?: string}>}) {
  const next = safeAuthReturn((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthLayout
      label="Athletes, coaches, and recruiters"
      title={
        <>
          One resume. <span className="text-ink-muted">Every result.</span>
        </>
      }
      lede="Your record, your film, and your references — at one link a recruiter can open without an account."
      image="09"
      below={
        <>
          Already on Roster?{" "}
          <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
            Sign in
          </Link>
        </>
      }
    >
      <AuthForm action={signUp} submitLabel="Create account" next={next} />
    </AuthLayout>
  );
}
