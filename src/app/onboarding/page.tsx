import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set up your resume",
  robots: { index: false, follow: false },
};

/**
 * The one screen between an account and a resume. Asks only for what the
 * resume cannot exist without — name, handle, level — because every extra
 * field here is a place to abandon; the rest is filled in from the editor.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) redirect("/resume");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-(--space-gutter) py-(--space-section)">
      <p className="label text-ink-subtle">Almost there</p>

      <h1 className="font-display text-display mt-4 leading-[0.95] tracking-tight">
        Claim your page
      </h1>

      <div className="mt-10">
        <OnboardingForm />
      </div>
    </main>
  );
}
