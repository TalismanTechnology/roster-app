import type { FilmClip } from "@/lib/database.types";

/**
 * Pure helpers over a film clip. No React, no directive — importable from
 * Server and Client Components alike. (They used to live in FilmPlayer.tsx,
 * which is a client module; calling them from a Server Component is a
 * runtime error.)
 */

/** Embed URLs only for providers whose id the database parsed — the two are
 *  one decision, made in migration 0007's `parse_film_url()`. */
export function embedFor(clip: FilmClip): string | null {
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

/**
 * A poster without an API call. YouTube serves thumbnails on a predictable
 * path; Vimeo requires an oEmbed request per clip, which is not worth a
 * network round trip on render — those fall back to the typographic treatment.
 */
export function posterFor(clip: FilmClip): string | null {
  if (clip.thumbnail_url) return clip.thumbnail_url;
  if (clip.provider === "youtube" && clip.external_id) {
    return `https://i.ytimg.com/vi/${clip.external_id}/hqdefault.jpg`;
  }
  return null;
}

export function providerLabel(provider: FilmClip["provider"]): string | null {
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
