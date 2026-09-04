import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Corner, CORNER } from "@/components/ui/marks";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";

/**
 * Shared by unknown routes and by resumes the viewer may not see. The copy
 * is deliberately the same for both: a private resume must be
 * indistinguishable from a handle that was never claimed.
 *
 * Rendered without reading the session on purpose: a not-found page that
 * touches cookies becomes dynamic, and Next then streams it with a 200
 * instead of the 404 a crawler (and the privacy model) depends on.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader user={null} />
      <main
        className="flex min-h-[70svh] flex-col justify-center"
        style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}
      >
        <p className="label flex items-center gap-2 text-ink-muted">
          <Corner d={CORNER.tl} /> 404
        </p>
        <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">
          Nothing here.
        </h1>
        <p className="mt-4 max-w-md text-ink-muted">
          That page doesn&rsquo;t exist, or it isn&rsquo;t public. If someone sent you this link, ask them to check it.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/search" variant="outline" arrow>
            Find athletes
          </Button>
          <Link href="/" className="btn-ghost">
            Home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
