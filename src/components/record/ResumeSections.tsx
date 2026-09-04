import type { CoachContact, FilmClip, Profile } from "@/lib/database.types";

import { FilmPlayer, providerLabel } from "./FilmPlayer";

/**
 * The resume sections beyond the record: film, academics, references.
 *
 * Each is a bare panel with no heading of its own — the tab in `ResumeFrame`
 * names it, and repeating that name at the top of the panel would say
 * "Film / Film" to anyone who just clicked the tab.
 */

// ---------------------------------------------------------------------------
// Film
// ---------------------------------------------------------------------------

export function FilmPanel({ clips }: { clips: FilmClip[] }) {
  if (clips.length === 0) return null;

  const featured = clips.find((clip) => clip.is_featured) ?? clips[0];
  const rest = clips.filter((clip) => clip.id !== featured.id);

  return (
    <div className="mx-auto max-w-3xl">
      <FilmPlayer clip={featured} />

      {rest.length > 0 && (
        <ol className="mt-8">
          {rest.map((clip) => (
            <li key={clip.id} className="border-rule border-b first:border-t">
              <a
                href={clip.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group flex cursor-pointer items-baseline justify-between gap-4 py-4"
              >
                <span className="text-ink group-hover:text-ink-muted min-w-0 truncate transition-colors duration-(--duration-fast)">
                  {clip.title}
                </span>
                <span className="label text-ink-subtle shrink-0">
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

  return (
    <div className="mx-auto max-w-3xl">
      <dl className="border-rule grid grid-cols-2 gap-x-8 gap-y-10 border-t pt-8 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-2">
            <dd className="font-display text-display-sm leading-none" data-numeric>
              {item.value}
            </dd>
            <dt className="label text-ink-subtle">{item.label}</dt>
          </div>
        ))}
      </dl>

      <p className="text-ink-subtle mt-10 max-w-prose text-sm leading-relaxed">
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

  return (
    <div className="mx-auto max-w-3xl">
      <ol>
        {coaches.map((coach) => (
          <li key={coach.id} className="border-rule border-b py-5 first:border-t">
            <p className="text-ink font-medium">{coach.name}</p>
            <p className="text-ink-muted mt-0.5 text-sm">
              {[coach.role, coach.org_name].filter(Boolean).join(" · ")}
            </p>

            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
              {coach.email && (
                <a
                  href={`mailto:${coach.email}`}
                  className="label text-ink-muted hover:text-ink decoration-rule-strong hover:decoration-ink cursor-pointer underline underline-offset-4 transition-colors duration-(--duration-fast)"
                >
                  {coach.email}
                </a>
              )}
              {coach.phone && (
                <a
                  href={`tel:${coach.phone}`}
                  className="label text-ink-muted hover:text-ink decoration-rule-strong hover:decoration-ink cursor-pointer underline underline-offset-4 transition-colors duration-(--duration-fast)"
                  data-numeric
                >
                  {coach.phone}
                </a>
              )}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
