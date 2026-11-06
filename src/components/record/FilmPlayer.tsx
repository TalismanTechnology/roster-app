"use client";

import Image from "next/image";
import { useState } from "react";

import type { FilmClip } from "@/lib/database.types";
import { embedFor, posterFor, providerLabel } from "@/lib/film";

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
        <div className="aspect-video w-full overflow-hidden border border-rule">
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
        className="group relative block aspect-video w-full cursor-pointer overflow-hidden border border-rule bg-paper-raised"
      >
        {posterUrl && (
          <Image
            src={posterUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 60vw, 100vw"
            // Straight from YouTube, already a sized JPEG, like the clip list's
            // thumbnails. Through /_next/image the server fetches it itself,
            // and its SSRF guard 400s whenever the host resolves to a
            // non-public address (as it does behind a proxy or fake-IP DNS).
            unoptimized
            className="object-cover opacity-80 transition-opacity duration-(--duration-normal) group-hover:opacity-100"
          />
        )}

        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

        {/* Narrow, the play mark would sit on the title; the caption below carries it. */}
        <span className="absolute bottom-0 left-0 hidden max-w-[80%] p-5 text-left @md:block">
          <span className="font-display line-clamp-2 text-xl leading-tight text-white">{clip.title}</span>
        </span>

        <PlayMark />

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
      className="absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-paper/85 text-ink transition-transform duration-(--duration-fast) group-hover:scale-105 group-active:scale-95 @md:size-16"
    >
      <svg viewBox="0 0 24 24" className="ml-0.5 size-6 fill-current @md:size-7">
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
      className="group flex aspect-video cursor-pointer flex-col justify-between border border-rule bg-paper-raised/60 p-4 transition-colors hover:border-ink-subtle @md:p-6"
    >
      <span className="label text-ink-muted">Watch on {providerLabel(clip.provider) ?? "the source"} ↗</span>
      <span className="font-display text-display-sm leading-tight">{clip.title}</span>
    </a>
  );
}

function Caption({ clip }: { clip: FilmClip }) {
  return (
    <figcaption className="mt-3 flex items-baseline justify-between gap-4 text-sm text-ink-muted">
      <span className="min-w-0 truncate">{clip.title}</span>
      <span className="label shrink-0 text-ink-subtle">
        {[clip.season, providerLabel(clip.provider)].filter(Boolean).join(" · ")}
      </span>
    </figcaption>
  );
}
