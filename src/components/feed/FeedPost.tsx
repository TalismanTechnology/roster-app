import Link from "next/link";

import { VerificationMark } from "@/components/record/VerificationMark";
import type { AchievementKind, VerificationState } from "@/lib/database.types";
import { kindLabel, recordDate, relativeTime } from "@/lib/format";

/**
 * A post in the feed.
 *
 * The attached-achievement case is the one that matters: logging a PR to your
 * record produces a feed moment automatically, so the athlete keeps one system
 * updated rather than two. The achievement renders as a quoted block — visibly
 * a piece of the record, not a re-typed caption.
 */

export interface FeedPostData {
  id: string;
  body: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  profiles: {
    handle: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  achievements: {
    title: string;
    value_display: string | null;
    unit: string | null;
    achieved_on: string;
    verification: VerificationState;
    kind: AchievementKind;
  } | null;
}

export function FeedPost({ post }: { post: FeedPostData }) {
  const author = post.profiles;

  return (
    <li className="border-rule border-b py-6">
      <div className="flex items-baseline gap-2 text-sm">
        {author ? (
          <Link
            href={`/${author.handle}`}
            className="text-ink hover:decoration-ink decoration-rule-strong cursor-pointer font-medium underline-offset-4 hover:underline"
          >
            {author.display_name}
          </Link>
        ) : (
          <span className="text-ink-subtle">Unknown athlete</span>
        )}

        {author && <span className="text-ink-subtle">@{author.handle}</span>}

        <time dateTime={post.created_at} className="text-ink-subtle ml-auto text-sm">
          {relativeTime(post.created_at)}
        </time>
      </div>

      {post.body && <p className="text-ink mt-3 leading-relaxed">{post.body}</p>}

      {post.achievements && <AchievementQuote achievement={post.achievements} />}

      <div className="text-ink-subtle mt-4 flex gap-6">
        <span className="label" data-numeric>
          {post.like_count} {post.like_count === 1 ? "recognition" : "recognitions"}
        </span>
        <span className="label" data-numeric>
          {post.comment_count} {post.comment_count === 1 ? "reply" : "replies"}
        </span>
      </div>
    </li>
  );
}

function AchievementQuote({
  achievement,
}: {
  achievement: NonNullable<FeedPostData["achievements"]>;
}) {
  return (
    <figure className="border-rule-strong mt-4 border-l-2 pl-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="label text-ink-subtle">{kindLabel(achievement.kind)}</p>
          <p className="text-ink mt-1 leading-snug font-medium">{achievement.title}</p>
        </div>

        {achievement.value_display && (
          <p className="font-display text-display-sm leading-none" data-numeric>
            {achievement.value_display}
            {achievement.unit && (
              <span className="text-ink-subtle ml-1 font-sans text-sm">{achievement.unit}</span>
            )}
          </p>
        )}
      </div>

      <figcaption className="mt-3 flex items-center gap-3">
        <time dateTime={achievement.achieved_on} className="label text-ink-subtle">
          {recordDate(achievement.achieved_on)}
        </time>
        <VerificationMark state={achievement.verification} />
      </figcaption>
    </figure>
  );
}
