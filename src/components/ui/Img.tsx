"use client";

import Image from "next/image";
import { useState } from "react";

import { Corner, CORNER } from "./marks";

/**
 * Page imagery, by id. Every photo the site uses is listed here so a missing
 * file degrades to an intentional placeholder rather than a broken box, and
 * so alt text lives in one place.
 */
export const IMAGES = {
  "hero-base": { file: "/img/bg-base.jpg", label: "Hero · base", alt: "" },
  "hero-reveal": { file: "/img/bg-reveal.jpg", label: "Hero · reveal", alt: "Football player in an all-black uniform" },
  "01": { file: "/img/01-film-catch.jpg", label: "Film · the catch", alt: "Receiver making a catch under stadium lights" },
  "02": { file: "/img/02-coach.jpg", label: "Coach · sideline", alt: "Head coach on the sideline" },
  "03": { file: "/img/03-build.jpg", label: "Build · locker room", alt: "Athlete entering results on a phone in the locker room" },
  "04": { file: "/img/04-verify.jpg", label: "Verify · coach's hands", alt: "Coach confirming an entry on a phone" },
  "05": { file: "/img/05-recruiter.jpg", label: "Get found · recruiter", alt: "College recruiter in the stands with a tablet" },
  "06": { file: "/img/06-track.jpg", label: "Track", alt: "Sprinter in the blocks" },
  "07": { file: "/img/07-basketball.jpg", label: "Basketball", alt: "Basketball player elevating for a shot" },
  "08": { file: "/img/08-soccer.jpg", label: "Soccer", alt: "Goalkeeper mid-dive" },
  "09": { file: "/img/09-tunnel.jpg", label: "Tunnel", alt: "Stadium tunnel opening onto the field" },
  "10": { file: "/img/10-stands.jpg", label: "Stands · night", alt: "Empty stadium at night from the press box" },
} as const;

export type ImageId = keyof typeof IMAGES;

type Props = {
  id: ImageId;
  /** Sizing/aspect classes for the frame, e.g. `aspect-[4/5]`, or `absolute inset-0`. */
  className?: string;
  imgClassName?: string;
  /** next/image `sizes`; defaults to full width. */
  sizes?: string;
  priority?: boolean;
  /** Placeholder art only — no id caption. For when the caller overlays its own label. */
  quiet?: boolean;
};

export function Img({
  id,
  className = "",
  imgClassName = "",
  sizes = "100vw",
  priority = false,
  quiet = false,
}: Props) {
  const [isMissing, setIsMissing] = useState(false);
  const meta = IMAGES[id];
  // Callers that position the frame themselves must not get `relative`
  // layered on top, or the box collapses to zero height.
  const position = /\b(absolute|fixed)\b/.test(className) ? "" : "relative";

  return (
    <div className={`${position} overflow-hidden bg-paper-raised ${className}`}>
      {isMissing ? (
        <Placeholder id={id} quiet={quiet} />
      ) : (
        <Image
          src={meta.file}
          alt={meta.alt}
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setIsMissing(true)}
          className={`object-cover ${imgClassName}`}
        />
      )}
    </div>
  );
}

function Placeholder({ id, quiet }: { id: ImageId; quiet: boolean }) {
  const meta = IMAGES[id];
  return (
    <div
      className="placeholder absolute inset-0 text-ink-muted"
      role="img"
      aria-label={`Placeholder for ${meta.alt || meta.label}`}
    >
      <div className="bg-grid absolute inset-0 opacity-50" />
      <div className="placeholder-sheen absolute inset-0" />
      {quiet ? (
        <p className="label absolute top-4 right-4 text-ink-subtle">IMG {id}</p>
      ) : (
        <>
          <Corner d={CORNER.tl} className="absolute top-3 left-3" />
          <Corner d={CORNER.tr} className="absolute top-3 right-3" />
          <Corner d={CORNER.bl} className="absolute bottom-3 left-3" />
          <Corner d={CORNER.br} className="absolute bottom-3 right-3" />
          <p className="label absolute bottom-6 left-6">
            <span className="font-bold text-ink">IMG {id}</span> · {meta.label}
          </p>
        </>
      )}
    </div>
  );
}
