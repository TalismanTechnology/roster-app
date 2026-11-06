import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { signIn } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/data/auth";
import { safeNext, signInHref } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/** Copy for the `?error=` codes other routes send here. */
const ERRORS: Record<string, string> = {
  confirmation: "That confirmation link didn't work — it may have expired or already been used. Sign in, or create your account again for a fresh link.",
  reset: "That reset link didn't work — it may have expired or already been used. Request a new one from “Forgot password?” below.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNext(params.next, "") || undefined;

  if (await getCurrentUser()) redirect(next ?? "/resume");

  const error = typeof params.error === "string" ? (ERRORS[params.error] ?? null) : null;

  return (
    <AuthLayout
      label="Welcome back"
      title="Sign in."
      image="02"
      below={
        <>
          New here?{" "}
          <Link href={signInHref(next, "/sign-up")} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
            Create your resume
          </Link>
        </>
      }
    >
      <AuthForm action={signIn} submitLabel="Sign in" next={next} initialError={error} />
    </AuthLayout>
  );
}
