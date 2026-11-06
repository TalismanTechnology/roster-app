import type { Metadata, Viewport } from "next";

import { siteUrl } from "@/lib/site";

import "./globals.css";

/**
 * No webfonts. The design language runs on Chirp's documented fallback stack
 * (declared in globals.css) — zero bytes and zero layout shift. Hierarchy
 * comes from weight (400 / 700 / 800) and tightness, not a second family.
 *
 * Dark only: the product is athletes photographed on black, and the interface
 * is the same black so the photographs carry it. `color-scheme: dark` is set
 * in CSS so native controls (selects, scrollbars) match.
 */

export const metadata: Metadata = {
  // Resolves every relative URL in metadata — canonical, og:url, and the
  // generated share-card images — against the public origin, not the host
  // the request happened to arrive on.
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Roster — The Athlete's Resume",
    template: "%s · Roster",
  },
  description:
    "A digital resume for athletes: every PR, result, award, and clip of film, verified by your coaches, at one link a recruiter can open without an account.",
  openGraph: {
    siteName: "Roster",
    type: "website",
  },
  // The site is public and meant to be found. Routes that shouldn't be
  // indexed — auth, the editor, unlisted and private resumes — each say so in
  // their own metadata, which is the safer direction for a mistake to fail:
  // a forgotten override leaves a page findable, not an athlete invisible.
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
