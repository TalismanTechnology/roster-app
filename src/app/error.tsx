"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Corner, CORNER } from "@/components/ui/marks";
import { reportClientError } from "@/lib/report-client-error";

/**
 * The route-level error boundary. Says what happened in plain words,
 * offers a retry, and never shows the stack — the details are in the
 * server log where they belong. The digest is shown so a report can be
 * matched to that log line; the message only in development, because in
 * production a Server Component's message is redacted anyway and a Client
 * Component's could carry anything. The error is also reported to
 * /api/errors (#117) so it reaches the logs and any configured sink.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, "route");
  }, [error]);

  return (
    <main className="flex min-h-[70svh] flex-col justify-center" style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}>
      <p className="label flex items-center gap-2 text-ink-muted">
        <Corner d={CORNER.tl} /> Something broke
      </p>
      <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">This page couldn&rsquo;t load.</h1>
      <p className="mt-4 max-w-md text-ink-muted">It&rsquo;s on our side, not yours. Try again; if it keeps happening, the home page still works.</p>
      <ErrorDetails error={error} />
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={retry} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-ghost">
          Home
        </Link>
      </div>
    </main>
  );
}

/** Reference line under the copy: hairline-ruled, monospace, quiet. */
function ErrorDetails({ error }: { error: Error & { digest?: string } }) {
  const showMessage = process.env.NODE_ENV === "development" && error.message;
  if (!error.digest && !showMessage) return null;

  return (
    <dl className="label mt-6 max-w-2xl divide-y divide-rule border-y border-rule font-mono text-ink-subtle">
      {error.digest && (
        <div className="flex gap-4 py-2">
          <dt>Ref</dt>
          <dd className="break-all text-ink-muted" data-numeric>
            {error.digest}
          </dd>
        </div>
      )}
      {showMessage && (
        <div className="flex gap-4 py-2">
          <dt>Dev</dt>
          <dd className="break-words text-ink-muted">{error.message}</dd>
        </div>
      )}
    </dl>
  );
}
