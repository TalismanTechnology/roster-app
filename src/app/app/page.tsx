import Link from "next/link";
import { networkContext } from "@/components/network/server";
import { getRepository } from "@/lib/data";
import { PageHeading, EmptyState } from "@/components/network/primitives";
import { Composer } from "@/components/network/Composer";
import { PostCard } from "@/components/network/PostCard";
import { RefreshControl } from "@/components/network/ActionForm";

export default async function Home({ searchParams }: { searchParams: Promise<{ feed?: string; cursor?: string; share?: string }> }) {
  const { user, repo } = await networkContext();
  const query = await searchParams;
  const mode = query.feed === "following" ? "following" : "explore";
  const records = await getRepository();
  const [feed, profile, ownEntries] = await Promise.all([
    repo.getFeed({ mode, cursor: query.cursor, limit: 15 }),
    records.getProfileById(user.id),
    query.share ? records.listEntries(user.id) : Promise.resolve([]),
  ]);
  const sharedEntry = query.share ? ownEntries.find(entry => entry.id === query.share) : undefined;
  const achievementDraft = sharedEntry
    ? [sharedEntry.title, sharedEntry.value_display, sharedEntry.achieved_on].filter(Boolean).join(" · ")
    : "";
  const workspace = profile?.account_kind === "coach"
    ? { title: "Support athletes. Recognize the work.", href: "/app/coaching", label: "Open coaching workspace" }
    : profile?.account_kind === "recruiter"
      ? { title: "Find talent. Build relationships.", href: "/lists", label: "Open recruiting workspace" }
      : profile?.account_kind === "brand"
        ? { title: "Find people who share your ambition.", href: "/app/discover", label: "Discover the community" }
        : profile?.account_kind === "staff"
          ? { title: "Help keep this community welcoming.", href: "/app/moderation", label: "Review community reports" }
          : { title: "Your work deserves a record.", href: "/resume", label: "Build your résumé" };
  return <div className="network-page"><PageHeading eyebrow="THE WORK. THE PEOPLE. THE NEXT LEVEL." title={`Your next chapter${profile?.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""}.`}>A place for the moments and people that move your game forward.</PageHeading>
    <div className="network-workspace-strip"><div><span className="network-eyebrow">YOUR WORKSPACE</span><strong>{workspace.title}</strong></div><Link className="network-button-quiet" href={workspace.href}>{workspace.label} ↗</Link></div>
    {query.share && <div className="network-panel mb-5 p-5" role="status">{sharedEntry ? <><h2 className="text-sm font-semibold">Share your achievement</h2><p className="network-help mt-2">Your achievement is prepared below. Review or edit the text, then choose Publish post to share it with Roster members. Nothing has been posted yet.</p></> : <p className="network-help">This achievement is unavailable or does not belong to your account. You can still write a new post.</p>}</div>}
    <Composer key={sharedEntry?.id ?? "new-post"} initialText={achievementDraft} /><nav className="network-tabs" aria-label="Feed"><Link aria-current={mode === "explore" ? "page" : undefined} className={mode === "explore" ? "active" : ""} href="/app?feed=explore">Explore</Link><Link aria-current={mode === "following" ? "page" : undefined} className={mode === "following" ? "active" : ""} href="/app?feed=following">Following</Link><span>Latest first</span></nav>
    <RefreshControl />
    <div className="network-feed">{feed.items.length ? feed.items.map(post => <PostCard key={post.id} post={post} viewerId={user.id} />) : <EmptyState title={mode === "following" ? "Build your circle." : "Start the conversation."} href="/app/discover" label="Discover people">{mode === "following" ? "Follow athletes and coaches to see their latest work here." : "Share a training update, introduce yourself, or find your people."}</EmptyState>}</div>
    {feed.nextCursor && <Link className="network-button" href={`/app?feed=${mode}&cursor=${encodeURIComponent(feed.nextCursor)}`}>Older posts</Link>}
  </div>;
}
