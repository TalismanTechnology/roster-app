import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { signIn } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getCurrentUser()) redirect("/resume");

  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-(--space-gutter) py-(--space-section)">
      <p className="label text-ink-subtle">Roster</p>

      <h1 className="font-display text-display mt-4 leading-[0.95] tracking-tight">
        Sign in
      </h1>

      <div className="mt-10">
        <AuthForm action={signIn} submitLabel="Sign in" next={next} />
      </div>

      <p className="text-ink-muted mt-8 text-sm">
        New here?{" "}
        <Link
          href="/sign-up"
          className="text-ink decoration-rule-strong hover:decoration-ink cursor-pointer underline underline-offset-4"
        >
          Create your resume
        </Link>
      </p>
    </main>
  );
}
