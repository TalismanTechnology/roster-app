import type { CoachContact, FilmClip, Profile } from "@/lib/database.types";

/**
 * The resume sections beyond the record: film, academics, references. Each
 * renders nothing when its data is absent — an empty "Film" heading on a
 * distance runner's resume reads as a deficiency the athlete does not have.
 */

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <header className="border-rule-strong flex items-baseline justify-between border-b pb-3">
      <h2 className="label text-ink">{title}</h2>
      {note && (
        <span className="label text-ink-subtle" data-numeric>
          {note}
        </span>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Film
// ---------------------------------------------------------------------------

export function FilmStrip({ clips }: { clips: FilmClip[] }) {
  if (clips.length === 0) return null;

  const featured = clips.find((clip) => clip.is_featured) ?? clips[0];
  const rest = clips.filter((clip) => clip.id !== featured.id);

  return (
    <section aria-label="Film">
      <SectionHeader title="Film" note={`${clips.length} ${clips.length === 1 ? "clip" : "clips"}`} />

      <div className="mt-5">
        <FilmEmbed clip={featured} />

        {rest.length > 0 && (
          <ol className="mt-2">
            {rest.map((clip) => (
              <li key={clip.id} className="border-rule border-b">
                <a
                  href={clip.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="group flex cursor-pointer items-baseline justify-between gap-4 py-3"
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
    </section>
  );
}

function FilmEmbed({ clip }: { clip: FilmClip }) {
  const embedUrl = embedFor(clip);

  // No documented embed for this host (Hudl, a raw file, anything else):
  // show an honest outbound link rather than a grey iframe.
  if (!embedUrl) {
    return (
      <a
        href={clip.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="border-rule bg-paper-sunken group flex cursor-pointer flex-col justify-between gap-8 border p-5"
      >
        <span className="label text-ink-subtle">
          Watch on {providerLabel(clip.provider) ?? "the source"} ↗
        </span>
        <span className="font-display text-display-sm text-ink group-hover:text-ink-muted leading-tight transition-colors duration-(--duration-fast)">
          {clip.title}
        </span>
      </a>
    );
  }

  return (
    <figure>
      <div className="border-rule aspect-video w-full overflow-hidden border">
        <iframe
          src={embedUrl}
          title={clip.title}
          className="size-full"
          allow="accelerometer; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
      <figcaption className="text-ink-muted mt-2 flex items-baseline justify-between gap-4 text-sm">
        <span className="min-w-0 truncate">{clip.title}</span>
        {clip.season && <span className="label text-ink-subtle shrink-0">{clip.season}</span>}
      </figcaption>
    </figure>
  );
}

/** Embed URLs only for providers whose id the database parsed — the two are
 *  one decision, made in migration 0007's `parse_film_url()`. */
function embedFor(clip: FilmClip): string | null {
  if (!clip.external_id) return null;

  switch (clip.provider) {
    case "youtube":
      return `https://www.youtube-nocookie.com/embed/${clip.external_id}`;
    case "vimeo":
      return `https://player.vimeo.com/video/${clip.external_id}`;
    default:
      return null;
  }
}

function providerLabel(provider: FilmClip["provider"]): string | null {
  switch (provider) {
    case "youtube":
      return "YouTube";
    case "vimeo":
      return "Vimeo";
    case "hudl":
      return "Hudl";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Academics
// ---------------------------------------------------------------------------

export function AcademicsStrip({ profile }: { profile: Profile }) {
  const items = [
    profile.gpa !== null && { label: "GPA", value: formatGpa(profile.gpa) },
    profile.sat_score !== null && { label: "SAT", value: String(profile.sat_score) },
    profile.act_score !== null && { label: "ACT", value: String(profile.act_score) },
    profile.ncaa_id && { label: "NCAA ID", value: profile.ncaa_id },
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  if (items.length === 0) return null;

  return (
    <section aria-label="Academics">
      <SectionHeader title="Academics" />

      <dl className="mt-5 grid grid-cols-2 gap-y-5 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <dd className="font-display text-display-sm leading-none" data-numeric>
              {item.value}
            </dd>
            <dt className="label text-ink-subtle">{item.label}</dt>
          </div>
        ))}
      </dl>
    </section>
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

export function ReferenceList({ coaches }: { coaches: CoachContact[] }) {
  if (coaches.length === 0) return null;

  return (
    <section aria-label="References">
      <SectionHeader title="References" />

      <ol className="mt-2">
        {coaches.map((coach) => (
          <li key={coach.id} className="border-rule border-b py-4">
            <p className="text-ink font-medium">{coach.name}</p>
            <p className="text-ink-muted mt-0.5 text-sm">
              {[coach.role, coach.org_name].filter(Boolean).join(" · ")}
            </p>

            <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
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
    </section>
  );
}
