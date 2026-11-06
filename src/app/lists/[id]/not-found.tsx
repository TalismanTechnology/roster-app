import Link from "next/link";

import { Site } from "@/components/shell/Site";
import { Button } from "@/components/ui/Button";
import { Corner, CORNER } from "@/components/ui/marks";

/**
 * A list id that doesn't exist, or belongs to someone else — the same page
 * for both, so an id can't be probed for whether it's real. Unlike the root
 * 404 this reads the session: the route is signed-in only and already
 * dynamic, and the header should still be the viewer's own.
 */
export default function ListNotFound() {
  return (
    <Site>
      <main
        className="mx-auto flex min-h-[60svh] w-full max-w-4xl flex-col justify-center"
        style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}
      >
        <p className="label flex items-center gap-2 text-ink-muted">
          <Corner d={CORNER.tl} />
          <Link href="/lists" className="hover:text-ink">
            Lists
          </Link>{" "}
          / Not found
        </p>
        <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">No such list.</h1>
        <p className="mt-4 max-w-md text-ink-muted">
          It may have been deleted, or the link is wrong. Your other lists are where you left them.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/lists" variant="outline" arrow>
            Your lists
          </Button>
          <Link href="/search" className="btn-ghost">
            Find athletes
          </Link>
        </div>
      </main>
    </Site>
  );
}
