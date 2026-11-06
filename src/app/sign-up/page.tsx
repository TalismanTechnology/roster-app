import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { signUp } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/data/auth";
import { safeNext, signInHref } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Create your resume",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const params = await searchParams;
  const next = safeNext(params.next, "") || undefined;

  if (await getCurrentUser()) redirect(next ?? "/resume");

  return (
    <AuthLayout
      label="Free for athletes"
      title={
        <>
          One resume. <span className="text-ink-muted">Every result.</span>
        </>
      }
      lede="Your record, your film, and your references — at one link a recruiter can open without an account."
      image="09"
      below={
        <>
          <p>
            Already on Roster?{" "}
            <Link href={signInHref(next)} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
              Sign in
            </Link>
          </p>
          <p className="label mt-4 text-ink-subtle">
            By creating an account you agree to the{" "}
            <Link href="/terms" className="text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-ink-muted underline decoration-rule-strong underline-offset-4 hover:text-ink">
              Privacy Policy
            </Link>
            . Under 18? You&rsquo;ll confirm a parent or guardian agrees when you set up your resume.
          </p>
        </>
      }
    >
      <AuthForm action={signUp} submitLabel="Create account" next={next} />
    </AuthLayout>
  );
}
