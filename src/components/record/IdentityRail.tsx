import Image from "next/image";

import type { Profile } from "@/lib/database.types";
import { heightLabel, levelLabel, sportLabel, weightLabel } from "@/lib/format";

/**
 * Who this is — the half of the resume that never changes while the tabs do.
 *
 * Ordered the way a recruiter reads it: name, then what they do and when they
 * graduate, then the vitals off a roster sheet, then how to reach them, with
 * the verified count as a footer.
 */
export function IdentityRail({
  profile,
  entryCount,
}: {
  profile: Profile;
  entryCount: number;
}) {
  return (
    <aside className="sheet flex shrink-0 flex-col gap-6 px-6 py-7 lg:min-h-0 lg:w-[21.5rem] lg:overflow-y-auto xl:w-[24rem]">
      <div className="flex items-start gap-4 lg:flex-col lg:gap-5">
        <Avatar profile={profile} />

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-display-sm leading-[1.05] tracking-tight text-balance">
            {profile.display_name}
          </h1>
          <p className="text-ink-subtle label mt-2">@{profile.handle}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <MetaLine
          className="text-ink text-base"
          parts={[
            levelLabel(profile.level),
            sportLabel(profile.primary_sport),
            profile.grad_year ? `Class of ${profile.grad_year}` : null,
          ]}
        />

        {profile.school && <p className="text-ink text-base">{profile.school}</p>}

        <MetaLine
          className="text-ink-muted text-sm"
          parts={[
            profile.positions.length > 0 ? profile.positions.join(" / ") : null,
            heightLabel(profile.height_cm),
            weightLabel(profile.weight_kg),
            profile.jersey ? `#${profile.jersey}` : null,
          ]}
        />

        {profile.location && <p className="text-ink-muted text-sm">{profile.location}</p>}
      </div>

      {profile.bio && (
        <p className="text-ink-muted line-clamp-4 text-sm leading-relaxed">{profile.bio}</p>
      )}

      <ProofLinks profile={profile} />

      {/* Pushed to the foot of the rail on desktop so the identity block reads
          as one unit and this sits apart from it as a footer. */}
      <VerifiedSummary verified={profile.verified_count} total={entryCount} />
    </aside>
  );
}

/**
 * The one number that is not already on a tab.
 *
 * The tabs count entries, film and references, so a three-up stat strip here
 * would restate them a few inches to the left. What no tab can say is how much
 * of the record someone else has stood behind — which is the number the whole
 * product is built to produce.
 */
function VerifiedSummary({ verified, total }: { verified: number; total: number }) {
  if (total === 0) return null;

  return (
    <div className="border-rule border-t pt-5 lg:mt-auto">
      <p className="flex items-baseline gap-2">
        <span className="font-display text-verified text-2xl leading-none" data-numeric>
          {verified}
        </span>
        <span className="text-ink-subtle text-sm" data-numeric>
          of {total} entries verified
        </span>
      </p>
    </div>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  if (profile.avatar_url) {
    // The one photograph on the sheet gets a real lift: shadow below, lit
    // edge above, like a print laid on the document.
    return (
      <Image
        src={profile.avatar_url}
        alt=""
        width={96}
        height={96}
        priority
        className="border-rule size-16 shrink-0 rounded-full border object-cover shadow-sm lg:size-24"
      />
    );
  }

  // Monogram fallback. Never an emoji or a stock silhouette — a blank-looking
  // resume undercuts the premium the whole product is selling.
  const initials = profile.display_name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  // The absence of a photo is recessed where a photo would be raised: an
  // empty seat in the document, not a fake object.
  return (
    <div
      aria-hidden
      className="bg-paper-sunken text-ink-subtle font-display flex size-16 shrink-0 items-center justify-center rounded-full text-xl shadow-[var(--recess)] lg:size-24 lg:text-2xl"
    >
      {initials}
    </div>
  );
}

function MetaLine({
  parts,
  className,
}: {
  parts: (string | null | undefined)[];
  className: string;
}) {
  const present = parts.filter((part): part is string => Boolean(part));

  if (present.length === 0) return null;

  // Separators are rendered rather than typed so an absent segment leaves no
  // orphan dot.
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
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

function ProofLinks({ profile }: { profile: Profile }) {
  const isContactable = profile.is_recruitable && profile.contact_email;

  const links = [
    profile.results_url && { label: "Results", href: profile.results_url },
    profile.hudl_url && { label: "Hudl", href: profile.hudl_url },
    profile.instagram && {
      label: "Instagram",
      href: `https://instagram.com/${profile.instagram.replace(/^@/, "")}`,
    },
  ].filter((link): link is { label: string; href: string } => Boolean(link));

  if (links.length === 0 && !isContactable) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Contact is the one action on the page, so it is a button and the rest
          are links. A recruiter who has decided should not have to hunt for
          the email among four identically-weighted underlines. */}
      {isContactable && (
        <a href={`mailto:${profile.contact_email}`} className="btn-primary">
          Contact
        </a>
      )}

      {links.length > 0 && (
        <nav aria-label="External profiles" className="flex flex-wrap gap-x-5 gap-y-2">
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
      )}
    </div>
  );
}
