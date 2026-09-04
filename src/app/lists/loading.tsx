import { Corner, CORNER } from "@/components/ui/marks";

/**
 * Shown while a route's server work runs. Deliberately quiet — a bracket
 * and a line, no spinner — because on the local adapter nothing takes long
 * enough to deserve one, and a resume shouldn't open with a loading
 * animation a recruiter has to wait out.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60svh] flex-col justify-center" style={{ paddingInline: "var(--pad-x)" }} aria-busy="true" aria-live="polite">
      <p className="label flex items-center gap-2 text-ink-muted">
        <Corner d={CORNER.tl} /> Loading
      </p>
      <div className="mt-6 h-px w-40 overflow-hidden bg-rule">
        <div className="loading-bar h-full w-1/3 bg-ink" />
      </div>
    </div>
  );
}
