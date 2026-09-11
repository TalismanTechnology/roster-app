import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteForm, EmailForm, PasswordForm } from "@/components/account/AccountForms";
import { EditorSection, Panel, VisibilitySection } from "@/components/editor/ProfileSections";
import { Site } from "@/components/shell/Site";
import { Corner, CORNER } from "@/components/ui/marks";
import { signOut } from "@/lib/actions/auth";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { ProfileMedia } from "@/components/media/ProfileMedia";
import { MemberIdentityForm } from "@/components/account/MemberIdentityForm";
import { getNetworkRepository, type MemberSummary } from "@/lib/network";
import { ActionForm } from "@/components/network/ActionForm";

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
  let blocked: MemberSummary[] = [];
  let networkActive = false;
  let blockedUnavailable = false;
  try {
    const network = await getNetworkRepository();
    networkActive = (await network.getMembership())?.status === "active";
    if (networkActive) blocked = await network.getBlockedMembers();
  } catch { blockedUnavailable = true; }

  return (
    <Site>
      <main className="mx-auto w-full max-w-3xl" style={{ paddingInline: "var(--pad-x)", paddingBlock: "32px" }}>
        <header className="pb-6">
          <p className="label flex items-center gap-2 text-ink-muted">
            <Corner d={CORNER.tl} /> Settings
          </p>
          <h1 className="font-display text-4xl mt-4 leading-tight tracking-tight">Your account.</h1>
          <p className="mt-3 text-ink-muted">
            Signed in as {user.email}
            {profile && (
              <>
                {" · "}
                {isAthlete ? (
                  <Link href={`/${profile.handle}`} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
                    @{profile.handle}
                  </Link>
                ) : (
                  <span className="capitalize">{profile.account_kind}</span>
                )}
              </>
            )}
          </p>
        </header>

        <div className="flex flex-col gap-12">
          {profile && <EditorSection id="profile" title="Your profile" lede="Keep your identity and photos up to date.">
            <Panel><ProfileMedia avatarUrl={profile.avatar_url} coverUrl={profile.cover_url} /><MemberIdentityForm profile={profile} />
              {isAthlete && <Link className="btn-row mt-4" href="/resume?section=identity">Open your full athlete editor →</Link>}
            </Panel>
          </EditorSection>}
          <EditorSection id="email" title="Email">
            <Panel>
              <EmailForm email={user.email} />
            </Panel>
          </EditorSection>

          <EditorSection id="password" title="Password">
            <Panel>
              <PasswordForm />
            </Panel>
          </EditorSection>

          {profile && isAthlete && <VisibilitySection profile={profile} />}
          {(networkActive || blockedUnavailable) && <EditorSection id="blocked" title="Blocked members" lede="Blocking prevents social contact and hides posts. A public resume remains accessible to people with its link.">
            <Panel>{blockedUnavailable ? <p role="status">Your blocked list could not load. Refresh this page to try again.</p> : blocked.length ? <ul className="divide-y divide-rule">{blocked.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><strong className="text-sm">{member.name}</strong><p className="text-xs text-ink-muted">@{member.handle}</p></div><ActionForm operation="block" fields={{ id: member.id, enabled: "false" }} quiet label="Unblock" confirm={`Unblock ${member.name}? Their posts and profile will become visible again.`} /></li>)}</ul> : <p className="text-sm text-ink-muted">You haven’t blocked anyone.</p>}</Panel>
          </EditorSection>}

          <EditorSection id="session" title="Session">
            <form action={signOut}>
              <button type="submit" className="btn-outline">
                Sign out
              </button>
            </form>
          </EditorSection>

          <EditorSection id="delete" title="Delete account" lede="This removes your account, posts, conversations, resume, and photos. Evidence attached to reports stays restricted to staff and is deleted 90 days after the report is resolved.">
            <Panel>
              <DeleteForm confirmWith={profile?.handle ?? user.email} />
            </Panel>
          </EditorSection>
        </div>
      </main>
    </Site>
  );
}
