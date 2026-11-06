import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { signInHref } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Set up your resume",
  robots: { index: false, follow: false },
};

/**
 * The screens between an account and a resume. Three steps, each asking
 * only for what the resume cannot exist without — handle, name, who may
 * see it — because every extra field here is a place to abandon; the rest
 * is filled in from the editor.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInHref("/onboarding"));

  const repo = await getRepository();
  if (await repo.getProfileById(user.id)) redirect("/resume");

  return (
    <AuthLayout label="Almost there" title="Claim your page." image="03">
      <OnboardingForm />
    </AuthLayout>
  );
}
