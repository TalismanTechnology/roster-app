import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteForm, EmailForm, PasswordForm } from "@/components/account/AccountForms";
import { EditorSection, VisibilitySection } from "@/components/editor/ProfileSections";
import { Site } from "@/components/shell/Site";
import { Corner, CORNER } from "@/components/ui/marks";
import { signOut } from "@/lib/actions/auth";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

/**
 * The account, as distinct from the resume: sign-in email, password,
 * visibility (a shortcut to the editor's section), and the door out.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/settings");

  const repo = await getRepository();
  const profile = await repo.getProfileById(user.id);
  const isAthlete = profile?.account_kind === "athlete";

  return (
    <Site>
      <main className="mx-auto w-full max-w-3xl" style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}>
        <header className="pb-6">
          <p className="label flex items-center gap-2 text-ink-muted">
            <Corner d={CORNER.tl} /> Settings
          </p>
          <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">Your account.</h1>
          <p className="mt-3 text-ink-muted">
            Signed in as {user.email}
            {profile && (
              <>
                {" · "}
                {isAthlete ? (
                  <Link href={`/${profile.handle}`} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
                    roster.us/{profile.handle}
                  </Link>
                ) : (
                  <span className="capitalize">{profile.account_kind}</span>
                )}
              </>
            )}
          </p>
        </header>

        <EditorSection id="email" title="Email">
          <EmailForm email={user.email} />
        </EditorSection>

        <EditorSection id="password" title="Password">
          <PasswordForm />
        </EditorSection>

        {profile && isAthlete && <VisibilitySection profile={profile} />}

        <EditorSection id="session" title="Session">
          <form action={signOut}>
            <button type="submit" className="btn-outline">
              Sign out
            </button>
          </form>
        </EditorSection>

        <EditorSection id="delete" title="Delete account" lede="This removes your account and everything you've added. If you only want to hide your resume, set it to private instead.">
          <DeleteForm confirmWith={profile?.handle ?? user.email} />
        </EditorSection>
      </main>
    </Site>
  );
}
