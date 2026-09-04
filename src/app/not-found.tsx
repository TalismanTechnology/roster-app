import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Corner, CORNER } from "@/components/ui/marks";
import { Site } from "@/components/shell/Site";

/**
 * Shared by unknown routes and by resumes the viewer may not see. The copy
 * is deliberately the same for both: a private resume must be
 * indistinguishable from a handle that was never claimed.
 */
export default function NotFound() {
  return (
    <Site>
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
    </Site>
  );
}
