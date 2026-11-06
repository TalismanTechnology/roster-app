import type { Metadata } from "next";
import Link from "next/link";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/PasswordResetForms";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

/** Open to anyone, signed in or not: the form never reveals whether an email has an account. */
export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      label="Password reset"
      title="Forgot it."
      lede="Enter the email you sign in with and we'll send a link to choose a new password."
      image="02"
      below={
        <>
          Remembered it?{" "}
          <Link href="/sign-in" className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
            Sign in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
