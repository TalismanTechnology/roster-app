"use client";

import "./globals.css";

import { useEffect } from "react";

import { reportClientError } from "@/lib/report-client-error";

/**
 * The last boundary: only reached when the root layout itself fails, and it
 * replaces that layout, so it brings its own document. The stylesheet is
 * imported for the tokens, but every rule that matters is also inline —
 * if the failure took the CSS with it, this still reads as Roster: black
 * paper, ink type, a hairline, a bracket.
 *
 * A plain <a> rather than next/link: a full document load, because the
 * router may be the thing that broke.
 */
const INK = "#eceeef";
const MUTED = "#9aa0a6";
const SUBTLE = "#82878d";
const RULE = "#2a2e33";
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const showMessage = process.env.NODE_ENV === "development" && error.message;

  // #117: the root layout failed; tell the logs, not just the console.
  useEffect(() => {
    reportClientError(error, "global");
  }, [error]);

  return (
    <html lang="en" style={{ colorScheme: "dark", background: "#000" }}>
      <body style={{ margin: 0, minHeight: "100svh", background: "#000", color: INK, fontFamily: SANS, WebkitFontSmoothing: "antialiased" }}>
        <title>Something broke · Roster</title>
        <main
          style={{
            display: "flex",
            minHeight: "100svh",
            flexDirection: "column",
            justifyContent: "center",
            paddingInline: "clamp(1.25rem, 4.5vw, 5rem)",
            boxSizing: "border-box",
          }}
        >
          <p style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0, color: MUTED, fontSize: "0.8125rem" }}>
            <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M0 11.5V0.5H11.5" />
            </svg>
            Roster
          </p>
          <h1 style={{ margin: "1rem 0 0", fontSize: "clamp(2.5rem, 1.5rem + 4.5vw, 4rem)", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.01em" }}>
            Something broke.
          </h1>
          <p style={{ margin: "1rem 0 0", maxWidth: "28rem", color: MUTED, lineHeight: 1.4 }}>
            The whole page failed to load. It&rsquo;s on our side, not yours &mdash; try again in a moment.
          </p>

          {(error.digest || showMessage) && (
            <dl style={{ margin: "1.5rem 0 0", maxWidth: "42rem", borderBlock: `1px solid ${RULE}`, fontFamily: MONO, fontSize: "0.8125rem", color: SUBTLE }}>
              {error.digest && (
                <div style={{ display: "flex", gap: "1rem", padding: "0.5rem 0" }}>
                  <dt>Ref</dt>
                  <dd style={{ margin: 0, color: MUTED, wordBreak: "break-all" }}>{error.digest}</dd>
                </div>
              )}
              {showMessage && (
                <div style={{ display: "flex", gap: "1rem", padding: "0.5rem 0", borderTop: error.digest ? `1px solid ${RULE}` : undefined }}>
                  <dt>Dev</dt>
                  <dd style={{ margin: 0, color: MUTED, overflowWrap: "anywhere" }}>{error.message}</dd>
                </div>
              )}
            </dl>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "2rem" }}>
            <button
              type="button"
              onClick={retry}
              style={{
                minHeight: "2.75rem",
                padding: "0.6rem 1.25rem",
                cursor: "pointer",
                borderRadius: "0.375rem",
                border: `1px solid ${INK}`,
                background: INK,
                color: "#000",
                font: `700 1rem ${SANS}`,
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload is the point; see above */}
            <a
              href="/"
              style={{ display: "inline-flex", alignItems: "center", minHeight: "2.75rem", padding: "0 1.25rem", color: MUTED, fontWeight: 700, textDecoration: "none" }}
            >
              Home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
