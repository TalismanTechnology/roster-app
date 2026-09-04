"use client";

import Link from "next/link";

import { Corner, CORNER } from "@/components/ui/marks";

/**
 * The route-level error boundary. Says what happened in plain words,
 * offers a retry, and never shows the stack — the details are in the
 * server log where they belong.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[70svh] flex-col justify-center" style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}>
      <p className="label flex items-center gap-2 text-ink-muted">
        <Corner d={CORNER.tl} /> Something broke
      </p>
      <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">This page couldn&rsquo;t load.</h1>
      <p className="mt-4 max-w-md text-ink-muted">It&rsquo;s on our side, not yours. Try again; if it keeps happening, the home page still works.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-ghost">
          Home
        </Link>
      </div>
    </main>
  );
}
