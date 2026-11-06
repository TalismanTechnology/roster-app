import type { FilmProvider } from "@/lib/database.types";

/**
 * Mirror of `parse_film_url()` in migration 0007. Derived on write so
 * rendering never parses a URL, and so a host we do not recognise is recorded
 * as such — the resume then shows an honest outbound link instead of an
 * iframe that renders a grey box.
 */
export function parseFilmUrl(url: string): { provider: FilmProvider | null; external_id: string | null } {
  if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
    const id =
      url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] ??
      url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1] ??
      url.match(/\/embed\/([A-Za-z0-9_-]{11})/)?.[1] ??
      null;
    return { provider: "youtube", external_id: id };
  }

  if (/^https?:\/\/(www\.)?vimeo\.com\//i.test(url)) {
    return { provider: "vimeo", external_id: url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/)?.[1] ?? null };
  }

  if (/^https?:\/\/(www\.)?hudl\.com\//i.test(url)) {
    return { provider: "hudl", external_id: url.match(/hudl\.com\/video\/[^/]*\/([A-Za-z0-9]+)/)?.[1] ?? null };
  }

  return { provider: null, external_id: null };
}

/**
 * Mirror of the thumbnail half of `parse_film_url()` (0018). Only YouTube
 * serves a thumbnail at a URL derivable from the id.
 */
export function filmThumbnailUrl(parsed: { provider: FilmProvider | null; external_id: string | null }): string | null {
  return parsed.provider === "youtube" && parsed.external_id
    ? `https://i.ytimg.com/vi/${parsed.external_id}/hqdefault.jpg`
    : null;
}
