import Image from "next/image";

import { Corner, CORNER } from "@/components/ui/marks";
import { isSafeAvatarUrl } from "@/lib/avatars";

/**
 * The athlete's photo, square, inside corner brackets — the same frame the
 * rest of the record uses, so a photo reads as part of the document rather
 * than a social-profile bubble. Without a photo (or with a URL Roster didn't
 * put there) it is the initials on the raised surface.
 *
 * `unoptimized`: the editor already scaled it to 512px and re-encoded it,
 * and a versioned URL lets the browser cache it for good; a second pass
 * through the optimizer would only add a hop.
 */
export function Avatar({
  url,
  name,
  className = "size-24",
  sizes = "96px",
}: {
  url: string | null;
  name: string;
  className?: string;
  sizes?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className={`relative shrink-0 p-1.5 ${className}`}>
      <Corner d={CORNER.tl} className="absolute top-0 left-0" />
      <Corner d={CORNER.tr} className="absolute top-0 right-0" />
      <Corner d={CORNER.bl} className="absolute bottom-0 left-0" />
      <Corner d={CORNER.br} className="absolute bottom-0 right-0" />
      <div className="relative size-full overflow-hidden bg-paper-raised">
        {isSafeAvatarUrl(url) ? (
          <Image src={url} alt={`Photo of ${name}`} fill sizes={sizes} unoptimized className="object-cover" />
        ) : (
          <span className="font-display absolute inset-0 grid place-items-center text-2xl tracking-tight text-ink-muted" aria-hidden>
            {initials}
          </span>
        )}
      </div>
    </div>
  );
}
