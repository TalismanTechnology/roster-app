import Link from "next/link";

import { Frame, Unverified } from "@/components/ui/marks";
import type { CoachContact, FilmClip, Profile, RecordEntry } from "@/lib/database.types";
import { entryContext, fullDate, kindLabel, placementLabel, recordDate } from "@/lib/format";

import { posterFor, providerLabel } from "@/lib/film";
import { signInHref } from "@/lib/safe-next";
import { formatMeasurable } from "@/lib/sport-events";

import { FilmPlayer } from "./FilmPlayer";
import { VerificationMark } from "./VerificationMark";

/**
 * The body of the resume. Sections, not tabs: a resume is a document and
 * everything on it should be reachable by scrolling, printing, or Cmd-F.
 * Each section carries its own bracketed label; empty sections are omitted
 * entirely rather than rendered as an absence.
 */

export function SectionHeading({ id, label, count }: { id: string; label: string; count?: number }) {
  return (
    <h2 id={`${id}-title`} className="font-display flex items-baseline gap-3 text-display-sm">
      {label}
      {typeof count === "number" && (
        <span className="label font-normal text-ink-muted" data-numeric>
          {count}
        </span>
      )}
    </h2>
  );
}

// ---------------------------------------------------------------------------
// Highlights — the pinned entries as three framed numbers
// ---------------------------------------------------------------------------

export function Highlights({ entries }: { entries: RecordEntry[] }) {
  const pinned = entries.filter((e) => e.is_pinned).slice(0, 3);
  if (pinned.length === 0) return null;

  return (
    <section aria-label="Highlights" className="grid gap-4 @xl:grid-cols-3 @3xl:gap-6">
      {pinned.map((e) => {
        // A measurable leads with its number; an award or selection has no
        // number, so its title is the headline and the context sits under it.
        const measure = e.value_display ?? placementLabel(e);
        const headline = measure ?? e.title;
        const caption = measure ? e.title : (entryContext(e) || kindLabel(e.kind));
        const size =
          headline.length <= 8 ? "text-display" : headline.length <= 18 ? "text-[1.75rem]" : "text-xl";

        return (
          <Frame key={e.id} as="article" className="flex flex-col justify-between" style={{ padding: "var(--feature-pad)" }}>
            <p className="label flex items-center justify-between gap-3 text-ink-muted">
              <span>{kindLabel(e.kind)}</span>
              <time dateTime={e.achieved_on} title={fullDate(e.achieved_on)}>
                {recordDate(e.achieved_on)}
              </time>
            </p>
            <p className={`font-display mt-6 flex items-baseline gap-2 leading-none tracking-tight ${size}`} data-numeric>
              {headline}
              {measure && e.value_display && e.unit && <span className="text-lg font-normal text-ink-muted">{e.unit}</span>}
            </p>
            <p className="mt-3 flex items-start justify-between gap-3">
              <span className={`leading-snug ${measure ? "font-bold" : "text-ink-muted"}`}>{caption}</span>
              <VerificationMark state={e.verification} className="mt-0.5" />
            </p>
          </Frame>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The record — every entry, dated, with year dividers
// ---------------------------------------------------------------------------

export function RecordList({ entries, isOwner }: { entries: RecordEntry[]; isOwner: boolean }) {
  if (entries.length === 0) {
    return (
      <div className="border-t border-rule py-10">
        <p className="font-display text-display leading-tight">Nothing on the record yet.</p>
        <p className="mt-2 max-w-md text-ink-muted">
          Every PR, result, award, and commitment added becomes part of a permanent, verifiable history.
        </p>
        {isOwner && (
          <Link href="/resume" className="btn-outline mt-6">
            Add your first entry
          </Link>
        )}
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => b.achieved_on.localeCompare(a.achieved_on));

  return (
    <ol className="border-t border-rule">
      {sorted.map((e, i) => {
        const year = e.achieved_on.slice(0, 4);
        const showYear = i === 0 || sorted[i - 1].achieved_on.slice(0, 4) !== year;
        const context = entryContext(e);

        return (
          <li key={e.id} className="border-b border-rule">
            {showYear && (
              <p className="label pt-4 text-ink-subtle" data-numeric>
                {year}
              </p>
            )}
            <div className="grid grid-cols-[3.5rem_1fr_auto] items-start gap-x-4 py-4 @md:grid-cols-[4.5rem_1fr_auto]">
              <time className="label pt-1 text-ink-muted" dateTime={e.achieved_on} title={fullDate(e.achieved_on)} data-numeric>
                {recordDate(e.achieved_on).slice(0, 5)}
              </time>

              <div className="min-w-0">
                <p className="font-bold">{e.title}</p>
                <p className="label mt-0.5 flex flex-wrap items-center gap-x-2 text-ink-muted">
                  <span>
                    {kindLabel(e.kind)}
                    {context && <> · {context}</>}
                  </span>
                  {e.value_numeric !== null && e.unit && <MeasurableChip value={e.value_numeric} unit={e.unit} />}
                </p>
                {e.detail && <p className="mt-2 max-w-2xl leading-normal">{e.detail}</p>}
                <Provenance entry={e} />
              </div>

              <div className="flex max-w-[45%] items-center justify-end gap-2.5 pt-0.5 text-right">
                <span className="font-display text-xl tracking-tight" data-numeric>
                  <EntryValue entry={e} />
                </span>
                <VerificationMark state={e.verification} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Where an entry's status came from (#71), in the words a recruiter needs.
 * The chip says *what* the state is; this says who stood behind it and
 * when, or — for the states short of verified — what the state means for
 * how much weight the entry should carry.
 */
function Provenance({ entry }: { entry: RecordEntry }) {
  switch (entry.verification) {
    case "verified":
      if (!entry.verified_by && !entry.verified_at) return null;
      return (
        <p className="label mt-1.5 text-ink-muted">
          {entry.verified_by ? <>Verified by {entry.verified_by}</> : "Verified by a coach"}
          {entry.verified_at && (
            <>
              {" · "}
              <time dateTime={entry.verified_at} title={fullDate(entry.verified_at.slice(0, 10))}>
                {fullDate(entry.verified_at.slice(0, 10))}
              </time>
            </>
          )}
        </p>
      );
    case "disputed":
      return (
        <p className="mt-1.5 max-w-2xl text-sm leading-snug text-ink-muted">
          <span className="font-bold text-disputed">Disputed.</span> The coach asked to confirm this did not. Read it as
          self-reported until it is corrected and confirmed — or ask the athlete about it.
        </p>
      );
    case "submitted":
      return <p className="label mt-1.5 text-ink-subtle">Sent to a coach to confirm · awaiting their answer</p>;
    case "rejected":
      return (
        <p className="mt-1.5 max-w-2xl text-sm leading-snug text-ink-muted">
          Reviewed and not substantiated. Treat it as an unsupported claim.
        </p>
      );
    default:
      return (
        <p className="label mt-1.5 flex items-center gap-1.5 text-ink-subtle">
          <Unverified /> Self-reported
        </p>
      );
  }
}

/** How a mark is earned, once per record, for a reader deciding how far to trust it. */
export function VerificationNote() {
  return (
    <aside aria-labelledby="how-verification-works" className="mt-6 grid gap-3 border border-rule p-5 @3xl:grid-cols-[14rem_1fr] @3xl:gap-8">
      <p id="how-verification-works" className="label font-mono text-ink-muted">
        [ How verification works ]
      </p>
      <ol className="grid gap-2 text-sm leading-snug text-ink-muted @xl:grid-cols-3 @xl:gap-6">
        <li>
          <span className="label font-mono text-ink-subtle">01 </span>
          The athlete names a coach from their references for one entry.
        </li>
        <li>
          <span className="label font-mono text-ink-subtle">02 </span>
          The coach gets a single-use link and confirms or disputes it. Their name and role are recorded with the answer.
        </li>
        <li>
          <span className="label font-mono text-ink-subtle">03 </span>
          Changing a verified entry&rsquo;s result removes its mark until a coach confirms it again.
        </li>
      </ol>
    </aside>
  );
}

/**
 * #55: a mark stored as a number in a known unit — comparable, sortable —
 * flagged as such beside the entry. The display string stays the headline.
 */
function MeasurableChip({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="font-mono text-ink-subtle" title="Measured mark">
      [ {formatMeasurable(value, unit)} ]
    </span>
  );
}

function EntryValue({ entry, size = "row" }: { entry: RecordEntry; size?: "row" | "display" }) {
  const value = entry.value_display ?? placementLabel(entry) ?? entry.org_name;
  if (!value) return size === "display" ? <span className="text-ink-muted">—</span> : null;

  return (
    <>
      {value}
      {entry.value_display && entry.unit && (
        <span className={`font-normal text-ink-muted ${size === "display" ? "text-lg" : "ml-0.5 text-sm"}`}>{entry.unit}</span>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Film
// ---------------------------------------------------------------------------

export function FilmSection({ clips }: { clips: FilmClip[] }) {
  if (clips.length === 0) return null;
  const featured = clips.find((c) => c.is_featured) ?? clips[0];
  const rest = clips.filter((c) => c.id !== featured.id);

  // min-w-0 on both grid children: a truncated (no-wrap) title otherwise
  // sets the implicit track to its full width and overflows the page.
  return (
    <div className="grid gap-6 @3xl:grid-cols-12">
      <div className="min-w-0 @3xl:col-span-8">
        <FilmPlayer clip={featured} />
      </div>
      {rest.length > 0 && (
        <ol className="flex min-w-0 flex-col divide-y divide-rule border-y border-rule @3xl:col-span-4 @3xl:border-t-0">
          {rest.map((clip) => {
            const poster = posterFor(clip);
            return (
              <li key={clip.id}>
                <a
                  href={clip.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="group flex cursor-pointer items-center gap-4 py-3 transition-colors hover:bg-wash"
                >
                  <span
                    className="relative aspect-video w-24 shrink-0 overflow-hidden border border-rule bg-paper-raised"
                    style={poster ? { backgroundImage: `url(${poster})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{clip.title}</span>
                    <span className="label block text-ink-muted">
                      {[clip.season, providerLabel(clip.provider)].filter(Boolean).join(" · ")} ↗
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Academics
// ---------------------------------------------------------------------------

export function hasAcademics(profile: Profile): boolean {
  return profile.gpa !== null || profile.sat_score !== null || profile.act_score !== null || Boolean(profile.ncaa_id);
}

export function AcademicsSection({ profile }: { profile: Profile }) {
  const items = [
    profile.gpa !== null && { label: "GPA", value: String(Number(profile.gpa)) },
    profile.sat_score !== null && { label: "SAT", value: String(profile.sat_score) },
    profile.act_score !== null && { label: "ACT", value: String(profile.act_score) },
    profile.ncaa_id && { label: "NCAA ID", value: profile.ncaa_id },
  ].filter((i): i is { label: string; value: string } => Boolean(i));

  if (items.length === 0) return null;

  return (
    <div>
      <dl className="grid grid-cols-2 gap-px border border-rule bg-rule @xl:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
        {items.map((i) => (
          <div key={i.label} className="min-w-0 bg-paper" style={{ padding: "var(--feature-pad)" }}>
            <dt className="label text-ink-muted">{i.label}</dt>
            {/* Scores are numbers worth display size; an ID is a string, kept readable. */}
            <dd
              className={`font-display mt-2 leading-none tracking-tight break-all ${i.value.length > 5 ? "text-lg" : "text-display"}`}
              data-numeric
            >
              {i.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="label mt-3 text-ink-muted">Academic figures are athlete-reported. A transcript is provided on request.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export function ReferencesSection({
  coaches,
  isOwner,
  profile,
  contactHidden = false,
}: {
  coaches: CoachContact[];
  isOwner: boolean;
  profile: Pick<Profile, "visibility" | "is_recruitable" | "handle">;
  /** Email and phone were withheld from this viewer (lib/contact.ts). */
  contactHidden?: boolean;
}) {
  if (coaches.length === 0) return null;
  // Rows arrive only when the viewer may see them, and the owner always
  // may — so the owner can't tell from the rows whether a recruiter sees
  // them. The rule can: coach_contacts_select needs a public resume that is
  // open to recruiting.
  const isOwnerOnly = isOwner && !(profile.visibility === "public" && profile.is_recruitable);

  return (
    <div>
      <ol className="divide-y divide-rule border-y border-rule">
        {coaches.map((coach) => (
          <li key={coach.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{coach.name}</p>
              <p className="label mt-0.5 text-ink-muted">{[coach.role, coach.org_name].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="print-hidden flex shrink-0 gap-2">
              {coach.email && (
                <a href={`mailto:${coach.email}`} className="btn-outline min-h-8 px-4 text-sm">
                  Email
                </a>
              )}
              {coach.phone && (
                <a href={`tel:${coach.phone}`} className="btn-outline min-h-8 px-4 text-sm">
                  Call
                </a>
              )}
            </div>
            <p className="hidden text-sm text-ink-muted print:block">{[coach.email, coach.phone].filter(Boolean).join(" · ")}</p>
          </li>
        ))}
      </ol>
      {contactHidden && (
        <p className="print-hidden label mt-3 text-ink-muted">
          <Link href={signInHref(`/${profile.handle}`)} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
            Sign in
          </Link>{" "}
          as a recruiter or coach to email or call references.
        </p>
      )}
      {isOwnerOnly && (
        <p className="label mt-3 text-ink-muted">
          References appear to recruiters only while this resume is public and you&rsquo;re open to recruiting.
        </p>
      )}
    </div>
  );
}
