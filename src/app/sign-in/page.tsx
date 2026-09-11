import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { signIn } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/data/auth";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getCurrentUser()) redirect("/resume");

  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <AuthLayout
      label="Welcome back"
      title="Sign in."
      image="02"
      below={
        <>
          New here?{" "}
          <Link href="/sign-up" className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
            Create your resume
          </Link>
        </>
      }
    >
      <AuthForm action={signIn} submitLabel="Sign in" next={next} />
    </AuthLayout>
  );
}
