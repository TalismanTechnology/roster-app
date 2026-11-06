import type { Profile } from "@/lib/database.types";
import { isSafeAvatarUrl } from "@/lib/avatars";
import { levelLabel } from "@/lib/format";
import { absoluteUrl } from "@/lib/site";
import { sportName } from "@/lib/sports";

/**
 * What a resume says about itself to machines: the one-line descriptor the
 * title, description, and share card share, and the schema.org record a
 * search engine reads. Pure — unit-tested directly.
 */

/** "Varsity · Football · Class of 2027" — empty parts dropped. */
export function profileDescriptor(profile: Pick<Profile, "level" | "primary_sport" | "grad_year">): string {
  return [levelLabel(profile.level), sportName(profile.primary_sport), profile.grad_year ? `Class of ${profile.grad_year}` : null]
    .filter(Boolean)
    .join(" · ");
}

/** An avatar as an absolute URL, or null when there is none worth showing. */
export function absoluteAvatarUrl(url: string | null): string | null {
  if (!isSafeAvatarUrl(url)) return null;
  return url.startsWith("/") ? absoluteUrl(url) : url;
}

/**
 * `ProfilePage` with the athlete as its `Person`. Only for public resumes:
 * the caller gates, and an unlisted or private one never gets this, since
 * structured data exists to be indexed.
 */
export function profileJsonLd(profile: Profile): Record<string, unknown> {
  const url = absoluteUrl(`/${profile.handle}`);
  const image = absoluteAvatarUrl(profile.avatar_url);
  const sport = sportName(profile.primary_sport);

  const person: Record<string, unknown> = {
    "@type": "Person",
    "@id": `${url}#person`,
    name: profile.display_name,
    alternateName: `@${profile.handle}`,
    url,
  };
  if (image) person.image = image;
  if (profile.bio) person.description = profile.bio;
  // schema.org has no `sport` on Person; `knowsAbout` is the documented fit.
  if (sport) person.knowsAbout = sport;
  if (profile.school) person.affiliation = { "@type": "Organization", name: profile.school };
  if (profile.location) person.homeLocation = { "@type": "Place", name: profile.location };

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    dateCreated: profile.created_at,
    dateModified: profile.updated_at,
    mainEntity: person,
  };
}

/**
 * JSON for an inline `<script type="application/ld+json">`. `<` is escaped
 * so a bio containing `</script>` can't close the tag early; the result is
 * still valid JSON with the same value.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
