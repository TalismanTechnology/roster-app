import Image from "next/image";

import type { Membership, Organization, Profile } from "@/lib/database.types";
import { levelLabel, sportLabel } from "@/lib/format";

type MembershipWithOrg = Membership & { organizations: Organization | null };

/**
 * The masthead of an athlete's record.
 *
 * Reads top-down as name → what they do → where → proof links, because that is
 * the order a recruiter needs it in. The stat strip sits directly under the
 * name so the two things a coach checks first — level and class year — are
 * above the fold on a phone.
 */
export function ProfileHeader({
  profile,
  memberships,
  stats,
}: {
  profile: Profile;
  memberships: MembershipWithOrg[];
  stats: { verified: number; total: number; followers: number };
}) {
  const current = memberships.find((m) => m.is_current);
  const level = levelLabel(profile.level);

  return (
    <header className="border-rule-strong border-b pb-(--space-gutter)">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        <Avatar profile={profile} />

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-display leading-[0.95] tracking-tight text-balance">
            {profile.display_name}
          </h1>

          <p className="text-ink-subtle label mt-3">@{profile.handle}</p>

          {/* The identity line: level · sport · class. Separators are rendered
              rather than typed so an absent segment leaves no orphan dot. */}
          <IdentityLine
            parts={[
              level,
              sportLabel(profile.primary_sport),
              profile.grad_year ? `Class of ${profile.grad_year}` : null,
              current?.organizations?.name ?? null,
            ]}
          />

          {profile.bio && (
            <p className="text-ink-muted mt-5 max-w-prose leading-relaxed">{profile.bio}</p>
          )}
        </div>
      </div>

      <StatStrip stats={stats} />

      <ProofLinks profile={profile} />
    </header>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  if (profile.avatar_url) {
    return (
      <Image
        src={profile.avatar_url}
        alt=""
        width={112}
        height={112}
        priority
        className="border-rule size-20 shrink-0 rounded-full border object-cover sm:size-28"
      />
    );
  }

  // Monogram fallback. Never an emoji or a stock silhouette — a blank-looking
  // record undercuts the premium the whole product is selling.
  const initials = profile.display_name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <div
      aria-hidden
      className="border-rule bg-paper-sunken text-ink-subtle font-display flex size-20 shrink-0 items-center justify-center rounded-full border text-2xl sm:size-28 sm:text-3xl"
    >
      {initials}
    </div>
  );
}

function IdentityLine({ parts }: { parts: (string | null | undefined)[] }) {
  const present = parts.filter((part): part is string => Boolean(part));

  if (present.length === 0) return null;

  return (
    <p className="text-ink mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-lg">
      {present.map((part, index) => (
        <span key={part} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden className="text-ink-subtle">
              ·
            </span>
          )}
          <span>{part}</span>
        </span>
      ))}
    </p>
  );
}

function StatStrip({ stats }: { stats: { verified: number; total: number; followers: number } }) {
  const items = [
    { label: "Verified", value: stats.verified },
    { label: "Entries", value: stats.total },
    { label: "Followers", value: stats.followers },
  ];

  return (
    <dl className="border-rule mt-(--space-gutter) grid grid-cols-3 border-t pt-5">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <dd className="font-display text-display-sm leading-none" data-numeric>
            {item.value}
          </dd>
          <dt className="label text-ink-subtle">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function ProofLinks({ profile }: { profile: Profile }) {
  const links = [
    profile.results_url && { label: "Results", href: profile.results_url },
    profile.hudl_url && { label: "Film", href: profile.hudl_url },
    profile.instagram && {
      label: "Instagram",
      href: `https://instagram.com/${profile.instagram.replace(/^@/, "")}`,
    },
  ].filter((link): link is { label: string; href: string } => Boolean(link));

  if (links.length === 0) return null;

  return (
    <nav aria-label="External profiles" className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="label text-ink-muted hover:text-ink decoration-rule-strong hover:decoration-ink cursor-pointer underline underline-offset-[6px] transition-colors duration-(--duration-fast)"
        >
          {link.label} ↗
        </a>
      ))}
    </nav>
  );
}
