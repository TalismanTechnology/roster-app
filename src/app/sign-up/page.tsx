import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { signUp } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Create your resume",
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/resume");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-(--space-gutter) py-(--space-section)">
      <p className="label text-ink-subtle">Roster</p>

      <h1 className="font-display text-display mt-4 leading-[0.95] tracking-tight text-balance">
        One resume. Every result.
      </h1>

      <p className="text-ink-muted mt-5 leading-relaxed">
        Free for athletes. Your record, your film, and your references — at one
        link a recruiter can open without an account.
      </p>

      <div className="mt-10">
        <AuthForm action={signUp} submitLabel="Create account" />
      </div>

      <p className="text-ink-muted mt-8 text-sm">
        Already on Roster?{" "}
        <Link
          href="/sign-in"
          className="text-ink decoration-rule-strong hover:decoration-ink cursor-pointer underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
