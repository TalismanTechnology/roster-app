"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/actions/auth";
import { AppIcon, type AppIconName } from "./AppIcon";

export type ShellMember = { name: string; handle: string; avatar: string | null; role: string };
export function AppNavigation({ member, counts }: { member: ShellMember; counts: { messages: number; notifications: number } | null }) {
  const pathname = usePathname();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  const workspace = member.role === "recruiter" ? "/lists" : member.role === "coach" ? "/app/coaching" : "/resume";
  const workspaceLabel = member.role === "recruiter" ? "Recruiting lists" : member.role === "coach" ? "Coach workspace" : "My resume";
  const primary: { href: string; label: string; mobile: string; icon: AppIconName; count?: number }[] = [
    { href: "/app", label: "Home", mobile: "Home", icon: "home" },
    { href: "/app/discover", label: "Discover", mobile: "Discover", icon: "discover" },
    { href: "/app/messages", label: "Messages", mobile: "Inbox", icon: "inbox", count: counts?.messages },
    { href: workspace, label: workspaceLabel, mobile: "Workspace", icon: "workspace" },
  ];
  const active = (href: string) => href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const badge = (value?: number) => value ? <span className="app-count">{value > 99 ? "99+" : value}</span> : null;
  const portrait = member.avatar ? <img src={member.avatar} alt="" width="40" height="40" /> : <span>{member.name.slice(0, 1).toUpperCase()}</span>;
  return <>
    <aside className="app-sidebar print-hidden">
      <Link href="/app" className="app-wordmark" aria-label="Roster home">Roster<span>.</span></Link>
      <span className="app-sidebar-label">YOUR NETWORK</span>
      <nav aria-label="App navigation" className="app-nav">
        {primary.map(item => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined}><AppIcon name={item.icon} /><span>{item.label}</span>{badge(item.count)}</Link>)}
        <Link href="/app/notifications" aria-current={active("/app/notifications") ? "page" : undefined}><AppIcon name="bell" /><span>Notifications</span>{badge(counts?.notifications)}</Link>
      </nav>
      <span className="app-sidebar-label">YOUR SPORT</span>
      <nav aria-label="Recruiting" className="app-nav">
        <Link href="/search" aria-current={active("/search") ? "page" : undefined}><AppIcon name="discover" /><span>Find athletes</span></Link>
        {workspace !== "/lists" && <Link href="/lists" aria-current={active("/lists") ? "page" : undefined}><AppIcon name="lists" /><span>Saved lists</span></Link>}
        {member.role === "staff" && <Link href="/app/moderation" aria-current={active("/app/moderation") ? "page" : undefined}><AppIcon name="shield" /><span>Moderation</span></Link>}
      </nav>
      <div className="app-sidebar-bottom">
        <Link href={`/app/people/${member.handle}`} className="app-member"><div className="app-avatar">{portrait}</div><span><strong>{member.name}</strong><small>@{member.handle}</small></span></Link>
        <div className="app-account-actions"><Link href="/settings">Settings</Link><form action={signOut}><button type="submit">Sign out</button></form></div>
        <Link href="/" className="app-site-link">Visit Roster website ↗</Link>
      </div>
    </aside>
    <header className="app-topbar print-hidden">
      <Link href="/app" className="app-wordmark app-mobile-wordmark" aria-label="Roster home">Roster<span>.</span></Link>
      <p className="app-topbar-context">Show your work. Build your future.</p>
      <div className="app-topbar-actions">
        <Link href="/app/notifications" className="app-icon-button" aria-label={counts?.notifications ? `${counts.notifications} unread notifications` : "Notifications"}><AppIcon name="bell" />{badge(counts?.notifications)}</Link>
        <Link href="/settings" className="app-icon-button" aria-label="Account settings"><AppIcon name="settings" /></Link>
        <Link href={`/app/people/${member.handle}`} className="app-avatar app-header-avatar" aria-label="Your member profile">{portrait}</Link>
      </div>
    </header>
    {offline && <div className="app-offline" role="status">You’re offline. Your open page is available; reconnect before saving or sending.</div>}
    <nav aria-label="Mobile app navigation" className="app-bottom-nav print-hidden">
      {primary.map(item => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined}><span className="relative"><AppIcon name={item.icon} />{badge(item.count)}</span><span>{item.mobile}</span></Link>)}
    </nav>
  </>;
}
