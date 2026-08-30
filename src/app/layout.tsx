import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";

import "./globals.css";

/**
 * Two families, no more.
 *
 * Instrument Serif carries the editorial voice — it has the high-contrast
 * authority of a masthead without the fashion-magazine affect of a Didone,
 * which would sit oddly on a record of athletic results.
 *
 * Inter does everything else, chosen substantially for its tabular figures:
 * this product is a column of times and distances, and proportional numerals
 * would leave that column ragged.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
