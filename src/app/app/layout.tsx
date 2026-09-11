import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/auth";
import { getRepository } from "@/lib/data";
import { AppShell } from "@/components/app/AppShell";
import "@/components/network/network.css";

export const metadata: Metadata = { title: { default: "Your network", template: "%s · Roster" }, robots: { index: false, follow: false } };
export default async function NetworkLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/app");
  const profile = await (await getRepository()).getProfileById(user.id);
  if (!profile) redirect("/onboarding");
  return <AppShell profile={profile}><main>{children}</main></AppShell>;
}
