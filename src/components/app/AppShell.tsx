import type { ReactNode } from "react";
import type { Profile } from "@/lib/database.types";
import { getNetworkRepository } from "@/lib/network";
import { AppNavigation } from "./AppNavigation";
import "./app.css";
import "@/components/network/network.css";

export async function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  let counts: { messages: number; notifications: number } | null = null;
  let networkUnavailable = false;
  try {
    const network = await getNetworkRepository();
    const membership = await network.getMembership();
    if (membership?.status === "active") counts = await network.getUnreadCounts();
  } catch {
    networkUnavailable = true;
  }
  return <div className="app-shell">
    <a href="#app-content" className="app-skip-link">Skip to content</a>
    <AppNavigation member={{ name: profile.display_name, handle: profile.handle, avatar: profile.avatar_url, role: profile.account_kind }} counts={counts} />
    <div id="app-content" className="app-content" tabIndex={-1}>
      {networkUnavailable && <div className="app-service-notice" role="status">Network updates are temporarily unavailable. You can still work on your resume.</div>}
      {children}
    </div>
  </div>;
}
