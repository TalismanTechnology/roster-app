"use client";

import Image from "next/image";
import { useState } from "react";

import type { FilmClip } from "@/lib/database.types";

/**
 * The featured clip: a poster that becomes a player on click.
 *
 * Two reasons this is not a plain iframe. The obvious one is weight — an
 * embedded player is several hundred kilobytes of third-party JavaScript, and
 * most people opening a resume read the record without ever pressing play.
 *
 * The other is authorship. An embedded player paints the *uploader's* title
 * over the video, so a clip an athlete titled "D1 State Final — 400m, lane 5"
 * displays whatever it was called when it was uploaded. On a document whose
 * entire value is that the athlete curated it, that is the wrong title.
 */
export function FilmPlayer({ clip }: { clip: FilmClip }) {
  const [isPlaying, setIsPlaying] = useState(false);

  const embedUrl = embedFor(clip);
  const posterUrl = posterFor(clip);

  // No documented embed for this host (Hudl, a raw file, anything else): an
  // honest outbound link beats an iframe that renders a grey box.
  if (!embedUrl) {
    return <OutboundCard clip={clip} />;
  }

  if (isPlaying) {
    return (
      <figure>
        <div className="border-rule aspect-video w-full overflow-hidden border">
          <iframe
            src={`${embedUrl}?autoplay=1`}
            title={clip.title}
            className="size-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        </div>
        <Caption clip={clip} />
      </figure>
    );
  }

  return (
    <figure>
      <button
        type="button"
        onClick={() => setIsPlaying(true)}
        className="group border-rule hover:border-rule-strong relative block aspect-video w-full cursor-pointer overflow-hidden border bg-paper-sunken transition-colors duration-(--duration-fast)"
      >
        {posterUrl && (
          <Image
            src={posterUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover opacity-80 transition-opacity duration-(--duration-normal) group-hover:opacity-100"
          />
        )}

        {/* A scrim, so the title stays legible over whatever frame the
            provider chose for the thumbnail. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
        />

        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-left">
          <span className="font-display text-display-sm leading-tight text-white">
            {clip.title}
          </span>
          <PlayMark />
        </span>

        <span className="sr-only-text">Play {clip.title}</span>
      </button>

      <Caption clip={clip} />
    </figure>
  );
}

function PlayMark() {
  return (
    <span
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur-sm transition-transform duration-(--duration-normal) ease-(--ease-out-expo) group-hover:scale-110"
    >
      {/* Optically centred: a triangle's visual centre sits left of its
          bounding box, so it is nudged right by a pixel. */}
      <svg viewBox="0 0 24 24" className="ml-px size-5 fill-white">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

function OutboundCard({ clip }: { clip: FilmClip }) {
  return (
    <a
      href={clip.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="border-rule bg-paper-sunken hover:border-rule-strong group flex aspect-video cursor-pointer flex-col justify-between border p-6 transition-colors duration-(--duration-fast)"
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

function Caption({ clip }: { clip: FilmClip }) {
  return (
    <figcaption className="text-ink-muted mt-3 flex items-baseline justify-between gap-4 text-sm">
      <span className="min-w-0 truncate">{clip.title}</span>
      <span className="label text-ink-subtle shrink-0">
        {[clip.season, providerLabel(clip.provider)].filter(Boolean).join(" · ")}
      </span>
    </figcaption>
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

/**
 * A poster without an API call. YouTube serves thumbnails on a predictable
 * path; Vimeo requires an oEmbed request per clip, which is not worth a
 * network round trip on render — those fall back to the typographic treatment.
 */
function posterFor(clip: FilmClip): string | null {
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
