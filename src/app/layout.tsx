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
    default: "Roster — Where Athletes Build Their Name",
    template: "%s · Roster",
  },
  description:
    "The private network for serious athletes. Build one credible record of what you have earned, and become discoverable for what comes next.",
  openGraph: {
    siteName: "Roster",
    type: "website",
  },
  robots: {
    // The network is private. Individual profiles set to public visibility
    // opt themselves back in via their own route metadata.
    index: false,
    follow: false,
  },
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
