import Link from "next/link";

import { Img } from "@/components/ui/Img";
import { ArrowUpRight, Corner, CORNER, Frame, Verified } from "@/components/ui/marks";
import { contactGate, type ContactGate } from "@/lib/contact";
import type { FilmClip, Profile, RecordEntry } from "@/lib/database.types";
import { heightLabel, levelLabel, weightLabel } from "@/lib/format";
import { recordLinks, socialLinks } from "@/lib/links";
import { signInHref } from "@/lib/safe-next";
import { siteHost } from "@/lib/site";
import { sportName } from "@/lib/sports";

import { Avatar } from "./Avatar";
import { ShareBar } from "./ShareBar";

/**
 * The top of the resume: who this is, in one read. Name at display size,
 * the roster-sheet line in bold, the context line muted, the bio, and the
 * three numbers a recruiter checks first in a frame on the right.
 */
export function IdentityBand({
  profile,
  entries,
  film,
  isOwner,
  contact,
}: {
  profile: Profile;
  entries: RecordEntry[];
  film: FilmClip[];
  isOwner: boolean;
  /** What "Contact" may show this viewer (lib/contact.ts). Omitted: the profile as given, revealed. */
  contact?: ContactGate;
}) {
  const roster = [
    profile.positions.length > 0 ? profile.positions.join(" / ") : null,
    heightLabel(profile.height_cm),
    weightLabel(profile.weight_kg),
    profile.jersey ? `#${profile.jersey}` : null,
  ].filter(Boolean);

  const context = [
    profile.school,
    profile.location,
    profile.grad_year ? `Class of ${profile.grad_year}` : null,
  ].filter(Boolean);

  const label = [levelLabel(profile.level), sportName(profile.primary_sport)].filter(Boolean).join(" · ") || "Athlete";
  // Same gate as the contact email and the references: open to recruiting,
  // on a public resume. Hudl and results pages are the record itself, so
  // they show whenever the resume does.
  const isRecruitingOpen = profile.is_recruitable && profile.visibility === "public";
  // Signed-out visitors and athletes get a masked hint, never the address (#44).
  const gate = contact ?? contactGate(profile, { id: profile.id, account_kind: profile.account_kind });
  const links = [...recordLinks(profile), ...(isRecruitingOpen ? socialLinks(profile) : [])];

  const stats = [
    { value: profile.verified_count, label: "Verified" },
    { value: entries.length, label: entries.length === 1 ? "Entry" : "Entries" },
    { value: film.length, label: film.length === 1 ? "Clip" : "Clips" },
  ];

  return (
    <section className="relative overflow-hidden border-b border-rule" aria-label="Identity">
      <div className="print-hidden absolute inset-0" aria-hidden>
        <Img id="10" className="absolute inset-0" imgClassName="opacity-30" sizes="100vw" quiet />
        <div className="absolute inset-0 bg-gradient-to-b from-paper/60 via-paper/70 to-paper" />
      </div>

      <div
        className="relative z-10 grid gap-8 @3xl:grid-cols-12 @3xl:items-end"
        style={{ paddingInline: "var(--pad-x)", paddingBlock: "clamp(2rem, 6vh, 4.5rem)" }}
      >
        <div className="@3xl:col-span-8">
          <p className="label flex items-center gap-2 text-ink-muted">
            <Corner d={CORNER.tl} />
            {label}
          </p>

          {/* Narrow: avatar over the name, never squeezed beside it. */}
          <div className="mt-4 flex flex-col items-start gap-4 @md:flex-row @md:items-end @md:gap-5">
            {profile.avatar_url && <Avatar url={profile.avatar_url} name={profile.display_name} className="size-20 @xl:size-28" sizes="112px" />}
            <div className="min-w-0 max-w-full">
              <h1 className="font-display text-display-lg flex flex-wrap items-center gap-x-3 leading-[0.95] tracking-tight">
                {profile.display_name}
                {profile.identity_verified_at && <Verified className="text-[0.5em]" label="Identity verified" />}
              </h1>

              <p className="mt-2 break-all text-ink-muted">
                {siteHost()}/{profile.handle}
              </p>
            </div>
          </div>

          {roster.length > 0 && <Dotted items={roster} className="mt-5 text-lg font-bold" />}
          {context.length > 0 && <Dotted items={context} className="mt-1 text-ink-muted" />}
          {profile.bio && <p className="mt-5 max-w-2xl whitespace-pre-line leading-relaxed">{profile.bio}</p>}

          {links.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Links">
              {links.map((link) => (
                <li key={link.kind}>
                  {/* rel=me ties the account to this page; nofollow because
                      the athlete, not Roster, vouches for the destination. */}
                  <a href={link.href} rel="me nofollow noopener noreferrer" target="_blank" className="chip group min-h-10 px-4 transition-colors hover:border-ink hover:text-ink sm:min-h-8 sm:px-3">
                    {link.label}
                    <ArrowUpRight className="!size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </a>
                  <span className="hidden print:inline"> {link.href}</span>
                </li>
              ))}
            </ul>
          )}

          {isOwner && (
            <p className="print-hidden label mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-muted">
              <span>
                This is your resume ·{" "}
                <span className={profile.visibility === "public" ? "text-ink" : "text-pending"}>
                  {profile.visibility === "public" ? "Public" : profile.visibility === "unlisted" ? "Unlisted" : "Private"}
                </span>
              </span>
              <Link href="/resume" className="inline-flex min-h-11 items-center text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink sm:min-h-0">
                Edit
              </Link>
            </p>
          )}
        </div>

        <Frame as="aside" className="lifted @3xl:col-span-4" aria-label="At a glance">
          <div className="flex flex-col gap-5" style={{ padding: "var(--feature-pad)" }}>
            <dl className="grid grid-cols-3 gap-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <dd className="font-display text-display leading-none tracking-tight" data-numeric>
                    {s.value}
                  </dd>
                  <dt className="label mt-1 text-ink-muted">{s.label}</dt>
                </div>
              ))}
            </dl>

            <div className="print-hidden flex flex-wrap items-center gap-2 border-t border-rule pt-4">
              {gate.state === "revealed" && gate.email && (
                <a href={`mailto:${gate.email}`} className="btn-primary min-h-9 px-4 text-sm max-sm:w-full">
                  Contact
                </a>
              )}
              {gate.state === "revealed" && gate.phone && (
                <a href={`tel:${gate.phone}`} className="btn-outline min-h-9 px-4 text-sm max-sm:flex-1">
                  Call
                </a>
              )}
              {gate.state === "gated" && (
                <Link href={signInHref(`/${profile.handle}`)} className="btn-primary min-h-9 px-4 text-sm max-sm:w-full" data-contact-gate>
                  Request contact
                </Link>
              )}
              <ShareBar handle={profile.handle} />
            </div>
            {gate.state === "gated" && (
              <p className="print-hidden label -mt-2 text-ink-muted">
                <span className="text-ink-subtle">{[gate.maskedEmail, gate.maskedPhone].filter(Boolean).join(" · ")}</span>
                <br />
                Contact details open to signed-in recruiters and coaches.
              </p>
            )}
          </div>
        </Frame>
      </div>
    </section>
  );
}

/** A " · " line whose dots stay with the item before them, so a wrap never
 *  starts a line on a separator. */
function Dotted({ items, className }: { items: (string | null)[]; className: string }) {
  return <p className={className}>{items.join("\u00a0· ")}</p>;
}
