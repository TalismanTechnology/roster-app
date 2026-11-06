import { Suspense, type ReactNode } from "react";

import { getCurrentProfile, getCurrentUser } from "@/lib/data/auth";

import { SiteFooter } from "./SiteFooter";
import { SiteHeader, type HeaderUser } from "./SiteHeader";

/**
 * Header + content + footer. Server Component: the only client pieces are
 * the header's scroll glass and its phone menu.
 *
 * The signed-in state is the one per-visitor thing on most pages, so it is
 * an island (#102): the header streams in behind a <Suspense> boundary
 * while the page itself renders, rather than every page waiting on a
 * session lookup (an auth round trip in Supabase mode) before its first
 * byte. The fallback is the same bar with the account controls held blank.
 */
export function Site({
  children,
  variant = "app",
  footer = true,
}: {
  children: ReactNode;
  variant?: "landing" | "app";
  footer?: boolean;
}) {
  return (
    <>
      <SiteHeaderIsland variant={variant} />
      {children}
      {footer && <SiteFooter />}
    </>
  );
}

/** The header with the visitor's account state, streamed. */
export function SiteHeaderIsland({ variant = "app" }: { variant?: "landing" | "app" }) {
  return (
    <Suspense fallback={<SiteHeader user={null} variant={variant} pending />}>
      <ResolvedHeader variant={variant} />
    </Suspense>
  );
}

async function ResolvedHeader({ variant }: { variant: "landing" | "app" }) {
  return <SiteHeader user={await currentHeaderUser()} variant={variant} />;
}

export async function currentHeaderUser(): Promise<HeaderUser> {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await getCurrentProfile();

  return {
    email: user.email,
    handle: profile?.handle ?? null,
    displayName: profile?.display_name ?? null,
    accountKind: profile?.account_kind ?? null,
  };
}
