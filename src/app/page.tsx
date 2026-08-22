import Link from "next/link";

import { FeedPost, type FeedPostData } from "@/components/feed/FeedPost";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * The app entry point.
 *
 * Signed in, this is the feed. Signed out, it is a gate — the marketing site
 * at myroster.us does the selling, so this page only needs to get an existing
 * member in and point everyone else at the application form.
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return <SignedOutGate />;
  }

  const supabase = await createClient();

  // RLS already restricts posts to profiles the viewer can see, but that
  // includes every members-only profile on the network. The feed additionally
  // narrows to people they actually follow, plus themselves.
  const { data: following } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", user.id)
    .not("accepted_at", "is", null);

  const authorIds = [user.id, ...(following ?? []).map((row) => row.following_id)];

  const { data: posts } = await supabase
    .from("posts")
    .select(
      `id, body, created_at, like_count, comment_count,
       profiles!posts_author_id_fkey (handle, display_name, avatar_url),
       achievements (title, value_display, unit, achieved_on, verification, kind)`,
    )
    .in("author_id", authorIds)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<FeedPostData[]>();

  return (
    <main className="mx-auto w-full max-w-2xl px-(--space-gutter) py-(--space-section)">
      <header className="border-rule-strong flex items-baseline justify-between border-b pb-3">
        <h1 className="label text-ink">The feed</h1>
        <Link
          href="/record"
          className="label text-ink-muted hover:text-ink cursor-pointer transition-colors duration-(--duration-fast)"
        >
          Add to record →
        </Link>
      </header>

      {posts && posts.length > 0 ? (
        <ol>
          {posts.map((post) => (
            <FeedPost key={post.id} post={post} />
          ))}
        </ol>
      ) : (
        <EmptyFeed />
      )}
    </main>
  );
}

function EmptyFeed() {
  return (
    <div className="py-16 text-center">
      <p className="font-display text-display-sm">Quiet in here.</p>
      <p className="text-ink-muted mx-auto mt-3 max-w-sm text-sm leading-relaxed">
        Follow athletes who compete where you do, and their moments show up here.
      </p>
      <Link
        href="/search"
        className="label text-ink decoration-rule-strong hover:decoration-ink mt-6 inline-block cursor-pointer underline underline-offset-[6px] transition-colors duration-(--duration-fast)"
      >
        Find athletes →
      </Link>
    </div>
  );
}

function SignedOutGate() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-(--space-gutter) py-(--space-section)">
      <p className="label text-ink-subtle">Roster</p>

      <h1 className="font-display text-display mt-4 leading-[0.95] tracking-tight text-balance">
        Where athletes build their name.
      </h1>

      <p className="text-ink-muted mt-5 leading-relaxed">
        The private network for serious athletes. Membership is limited.
      </p>

      <div className="mt-10 flex flex-col gap-3">
        <Link
          href="/sign-in"
          className="bg-ink text-paper hover:bg-ink-muted flex h-12 cursor-pointer items-center justify-center rounded-[2px] text-sm font-medium transition-colors duration-(--duration-fast)"
        >
          Sign in
        </Link>

        <Link
          href="/request-access"
          className="border-rule-strong text-ink hover:border-ink flex h-12 cursor-pointer items-center justify-center rounded-[2px] border text-sm font-medium transition-colors duration-(--duration-fast)"
        >
          Request early access
        </Link>
      </div>
    </main>
  );
}
