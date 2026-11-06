import { Corner, CORNER } from "@/components/ui/marks";
import type { Profile } from "@/lib/database.types";
import { fullDate } from "@/lib/format";
import { absoluteUrl, siteHost } from "@/lib/site";

import { QrCode } from "./QrCode";

/**
 * The foot of a printed resume (#70): a QR code to the live record and the
 * date the paper was true as of. A printout is a snapshot; a coach can
 * confirm or dispute an entry tomorrow, so the page says when it was taken
 * and where the current version lives. Print only — on screen the page *is*
 * the live version.
 */
export function PrintColophon({ profile, asOf }: { profile: Pick<Profile, "handle" | "display_name" | "verified_count">; asOf: string }) {
  const url = absoluteUrl(`/${profile.handle}`);

  return (
    <aside aria-label="Printed record" className="print-colophon hidden break-inside-avoid border-t border-rule pt-6 print:flex print:items-end print:gap-8">
      <div className="relative shrink-0 p-2">
        <Corner d={CORNER.tl} className="absolute top-0 left-0" />
        <Corner d={CORNER.tr} className="absolute top-0 right-0" />
        <Corner d={CORNER.bl} className="absolute bottom-0 left-0" />
        <Corner d={CORNER.br} className="absolute bottom-0 right-0" />
        <QrCode value={url} label={`QR code linking to ${url}`} className="block size-[1.1in]" />
      </div>
      <div className="min-w-0">
        <p className="label text-ink-muted">[ Live record ]</p>
        <p className="mt-1 font-bold">
          {siteHost()}/{profile.handle}
        </p>
        <p className="label mt-3 text-ink">
          Verified as of <time dateTime={asOf}>{fullDate(asOf)}</time>
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {profile.verified_count} {profile.verified_count === 1 ? "entry" : "entries"} confirmed by the coach named beside{" "}
          {profile.verified_count === 1 ? "it" : "them"}. Scan for the current record — verification can change after printing.
        </p>
      </div>
    </aside>
  );
}
