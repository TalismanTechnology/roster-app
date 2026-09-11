import type { ReactNode } from "react";

import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";

import { SiteFooter } from "./SiteFooter";
import { SiteHeader, type HeaderUser } from "./SiteHeader";

/**
 * Header + content + footer, with the signed-in state resolved once here so
 * pages don't each re-derive it. Server Component: the only client piece is
 * the header's scroll glass.
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

  const repo = await getRepository();
  const profile = await repo.getProfileById(user.id);

  return {
    email: user.email,
    handle: profile?.handle ?? null,
    displayName: profile?.display_name ?? null,
    accountKind: profile?.account_kind ?? null,
  };
}
