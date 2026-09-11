import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { signIn } from "@/lib/actions/auth";
import { safeAuthReturn } from "@/lib/auth-return";
import { getCurrentUser } from "@/lib/data/auth";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect(safeAuthReturn(params.next));
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <AuthLayout
      label="Welcome back"
      title="Sign in."
      image="02"
      below={
        <>
          New here?{" "}
          <Link href={`/sign-up?next=${encodeURIComponent(safeAuthReturn(next))}`} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
            Create an account
          </Link>
        </>
      }
    >
      <AuthForm action={signIn} submitLabel="Sign in" next={next} />
    </AuthLayout>
  );
}
