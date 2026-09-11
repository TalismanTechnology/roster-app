import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/auth";
import { getNetworkRepository } from "@/lib/network";

export async function networkContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/app");
  const repo = await getNetworkRepository();
  const membership = await repo.getMembership();
  if (!membership) redirect("/app/setup");
  if (membership.status !== "active") redirect("/app/setup?suspended=1");
  return { user, repo };
}
