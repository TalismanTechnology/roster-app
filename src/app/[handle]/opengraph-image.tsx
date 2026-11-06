import { renderProfileCard } from "@/lib/og-card";

/**
 * The opengraph share card for a resume. Drawn by lib/og-card.tsx, shared
 * with ./twitter-image.tsx; the config exports are literals because Next
 * reads them statically. Rendered per request (it reads the record), so a
 * new mark or photo is on the very next link preview.
 */

export const alt = "An athlete's resume on Roster: name, sport, and verified marks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return renderProfileCard(handle);
}
