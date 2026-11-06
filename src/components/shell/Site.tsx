import type { ReactNode } from "react";

import { getCurrentProfile, getCurrentUser } from "@/lib/data/auth";

import { SiteFooter } from "./SiteFooter";
import { SiteHeader, type HeaderUser } from "./SiteHeader";

/**
 * Header + content + footer, with the signed-in state resolved once here so
 * pages don't each re-derive it. Server Component: the only client pieces
 * are the header's scroll glass and its phone menu.
 */
export async function Site({
  children,
  variant = "app",
  footer = true,
}: {
  children: ReactNode;
  variant?: "landing" | "app";
  footer?: boolean;
}) {
  const user = await currentHeaderUser();

  return (
    <>
      <SiteHeader user={user} variant={variant} />
      {children}
      {footer && <SiteFooter />}
    </>
  );
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
