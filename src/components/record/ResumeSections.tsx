import type { CoachContact, FilmClip, Profile } from "@/lib/database.types";

import { FilmPlayer, providerLabel } from "./FilmPlayer";

/**
 * The resume sections beyond the record: film, academics, references — each
 * a bare panel with no heading of its own, because the tab above it already
 * says the word. Styled as X panels: full-width cells, hairlines, washes.
 */

// ---------------------------------------------------------------------------
// Film
// ---------------------------------------------------------------------------

export function FilmPanel({ clips }: { clips: FilmClip[] }) {
  if (clips.length === 0) return null;

  const featured = clips.find((clip) => clip.is_featured) ?? clips[0];
  const rest = clips.filter((clip) => clip.id !== featured.id);

  return (
    <div>
      <div className="px-4 py-3">
        <FilmPlayer clip={featured} />
      </div>

      {rest.length > 0 && (
        <ol>
          {rest.map((clip) => (
            <li key={clip.id} className="border-rule border-t">
              <a
                href={clip.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="wash-hover flex cursor-pointer items-baseline justify-between gap-4 px-4 py-3"
              >
                <span className="min-w-0 truncate font-bold">{clip.title}</span>
                <span className="label text-ink-muted shrink-0">
                  {[clip.season, providerLabel(clip.provider)].filter(Boolean).join(" · ")} ↗
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Academics
// ---------------------------------------------------------------------------

export function AcademicsPanel({ profile }: { profile: Profile }) {
  const items = [
    profile.gpa !== null && { label: "GPA", value: formatGpa(profile.gpa) },
    profile.sat_score !== null && { label: "SAT", value: String(profile.sat_score) },
    profile.act_score !== null && { label: "ACT", value: String(profile.act_score) },
    profile.ncaa_id && { label: "NCAA ID", value: profile.ncaa_id },
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  if (items.length === 0) return null;

  // Settings-list cells: label left, bold figure right — the way X renders
  // any about-panel of facts.
  return (
    <div>
      <dl>
        {items.map((item) => (
          <div
            key={item.label}
            className="border-rule flex items-center justify-between border-b px-4 py-4"
          >
            <dt className="text-ink-muted">{item.label}</dt>
            <dd className="text-lg font-bold" data-numeric>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="label text-ink-muted px-4 py-4">
        Academic figures are athlete-reported. A transcript is provided on request.
      </p>
    </div>
  );
}

/** 3.9 stores as 3.90; athletes write it 3.9. Trailing-zero GPAs read as
 *  padding on a document meant to feel exact. */
function formatGpa(gpa: number): string {
  return String(Number(gpa));
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export function ReferencePanel({ coaches }: { coaches: CoachContact[] }) {
  if (coaches.length === 0) return null;

  // User cells: round monogram, bold name over muted role, actions as small
  // pills on the right — the who-to-follow module's anatomy, repurposed for
  // the people a recruiter calls next.
  return (
    <ol>
      {coaches.map((coach) => (
        <li
          key={coach.id}
          className="border-rule flex items-center gap-3 border-b px-4 py-3"
        >
          <span
            aria-hidden
            className="bg-paper-sunken text-ink-muted flex size-10 shrink-0 items-center justify-center rounded-full font-bold"
          >
            {coach.name
              .split(/\s+/)
              .slice(0, 2)
              .map((word) => word[0])
              .join("")
              .toUpperCase()}
          </span>

          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-bold">{coach.name}</p>
            <p className="text-ink-muted label mt-0.5 truncate">
              {[coach.role, coach.org_name].filter(Boolean).join(" · ")}
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
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
        </li>
      ))}
    </ol>
  );
}
