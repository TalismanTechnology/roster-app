import type { Metadata } from "next";
import Link from "next/link";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { ResetPasswordForm } from "@/components/auth/PasswordResetForms";
import { getRepository } from "@/lib/data";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

/**
 * Where a reset link lands. Local mode: `?token=` straight from the email
 * (outbox). Supabase: /auth/callback has already exchanged the link's code
 * for a recovery session, so there is no token here — the session is the
 * authority. Either way the repository decides whether it still counts.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" && params.token !== "" ? params.token : null;
  const usable = await (await getRepository()).canResetPassword(token);

  if (!usable) {
    return (
      <AuthLayout label="Password reset" title="Link expired." image="02">
        <div role="status">
          <p className="text-sm leading-relaxed text-ink-muted">
            This reset link has expired or was already used. Links work once, within the hour.
          </p>
          <Link href="/forgot-password" className="btn-outline mt-6">
            Send a new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      label="Password reset"
      title="New password."
      lede="Choose a new password. Every other device signed in to this account will be signed out."
      image="02"
    >
      <ResetPasswordForm token={token} />
    </AuthLayout>
  );
}
