import "server-only";

import { ImageResponse } from "next/og";

import { isSafeAvatarUrl, LOCAL_AVATAR_PREFIX } from "@/lib/avatars";
import { getPublicRepository } from "@/lib/data";
import { readAvatar } from "@/lib/data/local/avatars";
import type { Profile, RecordEntry } from "@/lib/database.types";
import { entryContext, kindLabel, placementLabel, recordDate } from "@/lib/format";
import { profileDescriptor } from "@/lib/seo";
import { siteHost } from "@/lib/site";

/**
 * The share card for `/[handle]` — what a link to a resume looks like in a
 * group chat, a DM to a coach, or a post. It is the resume's identity band
 * condensed: name at display size, the descriptor line, the verified count
 * in a bracketed frame, and the pinned marks along a hairline-ruled base.
 * Ink on black, corner brackets, letter-spaced labels; no gradients, no
 * logo lockup, nothing a generic card generator would add.
 *
 * Rendered as the anonymous visitor (`getPublicRepository`): a private
 * resume has no card, and nobody's session decides what a cached card shows.
 * Only Latin text and inline SVG are drawn, so the renderer never reaches
 * out to a font CDN for a missing glyph.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

const INK = "#ffffff";
const MUTED = "rgba(255,255,255,0.56)";
const SUBTLE = "rgba(255,255,255,0.36)";
const RULE = "rgba(255,255,255,0.16)";

export async function renderProfileCard(handle: string): Promise<Response> {
  const repo = getPublicRepository();
  const profile = await repo.getProfileByHandle(handle, null).catch(() => null);
  if (!profile) return new Response("Not found", { status: 404 });

  const [entries, avatar] = await Promise.all([
    repo.listEntries(profile.id).catch(() => [] as RecordEntry[]),
    avatarDataUrl(profile.avatar_url),
  ]);

  return new ImageResponse(<Card profile={profile} marks={topMarks(entries)} avatar={avatar} />, OG_SIZE);
}

/** Pinned first — the athlete's own choice of headline. Without pins, the newest verified, then the newest. */
export function topMarks(entries: RecordEntry[]): RecordEntry[] {
  const pinned = entries.filter((e) => e.is_pinned);
  if (pinned.length > 0) return pinned.slice(0, 3);
  const byDate = [...entries].sort((a, b) => b.achieved_on.localeCompare(a.achieved_on));
  const verified = byDate.filter((e) => e.verification === "verified");
  return [...verified, ...byDate.filter((e) => e.verification !== "verified")].slice(0, 3);
}

function Card({ profile, marks, avatar }: { profile: Profile; marks: RecordEntry[]; avatar: string | null }) {
  const descriptor = profileDescriptor(profile) || "Athlete";
  const name = profile.display_name;
  const nameSize = name.length <= 14 ? 104 : name.length <= 22 ? 80 : 60;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#000000",
        color: INK,
        padding: "48px 56px",
        position: "relative",
        fontFamily: "Geist, sans-serif",
      }}
    >
      <Bracket at="tl" />
      <Bracket at="tr" />
      <Bracket at="bl" />
      <Bracket at="br" />

      {/* Masthead */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, letterSpacing: 4 }}>
        <div style={{ display: "flex", color: INK }}>[ ROSTER ]</div>
        <div style={{ display: "flex", color: MUTED, letterSpacing: 1 }}>{`${siteHost()}/${profile.handle}`}</div>
      </div>

      {/* Identity */}
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 40, marginTop: 8 }}>
        {avatar && (
          // eslint-disable-next-line @next/next/no-img-element -- Satori renders <img>, not next/image.
          <img src={avatar} width={176} height={176} alt="" style={{ objectFit: "cover", border: `1px solid ${RULE}` }} />
        )}

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: MUTED, textTransform: "uppercase" }}>
            {descriptor}
          </div>
          <div style={{ display: "flex", fontSize: nameSize, lineHeight: 0.95, letterSpacing: -3, marginTop: 18 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 28, color: MUTED, marginTop: 16 }}>{`@${profile.handle}`}</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "20px 28px",
            borderLeft: `1px solid ${RULE}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", fontSize: 120, lineHeight: 1, letterSpacing: -4 }}>{String(profile.verified_count)}</div>
            <Disc size={34} />
          </div>
          <div style={{ display: "flex", fontSize: 18, letterSpacing: 4, color: MUTED, marginTop: 10 }}>
            {profile.verified_count === 1 ? "VERIFIED MARK" : "VERIFIED MARKS"}
          </div>
        </div>
      </div>

      {/* The pinned marks */}
      <div style={{ display: "flex", borderTop: `1px solid ${RULE}` }}>
        {marks.length === 0 ? (
          <div style={{ display: "flex", paddingTop: 22, fontSize: 22, letterSpacing: 3, color: SUBTLE }}>
            THE RECORD IS OPEN · VERIFIED BY COACHES
          </div>
        ) : (
          marks.map((e, i) => <Mark key={e.id} entry={e} first={i === 0} />)
        )}
      </div>
    </div>
  );
}

function Mark({ entry, first }: { entry: RecordEntry; first: boolean }) {
  const measure = entry.value_display ?? placementLabel(entry);
  // Same rule as the page's Highlights: a measurable leads with its number;
  // an award leads with its title, and its context sits underneath.
  const headline = clip(measure ?? entry.title, 26);
  const headlineSize = headline.length <= 10 ? 48 : headline.length <= 16 ? 38 : 30;
  const caption = clip(measure ? entry.title : entryContext(entry) || kindLabel(entry.kind), 30);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        padding: first ? "20px 24px 0 0" : "20px 24px 0 24px",
        borderLeft: first ? "none" : `1px solid ${RULE}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, letterSpacing: 3, color: SUBTLE }}>
        <div style={{ display: "flex" }}>{kindLabel(entry.kind).toUpperCase()}</div>
        <div style={{ display: "flex" }}>{recordDate(entry.achieved_on)}</div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10, height: 48 }}>
        <div style={{ display: "flex", fontSize: headlineSize, lineHeight: 1, letterSpacing: -1.5 }}>{headline}</div>
        {measure && entry.value_display && entry.unit && (
          <div style={{ display: "flex", fontSize: 22, color: MUTED }}>{entry.unit}</div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 20, color: MUTED }}>
        {entry.verification === "verified" && <Disc size={18} />}
        <div style={{ display: "flex" }}>{caption}</div>
      </div>
    </div>
  );
}

/** The verified mark: an ink disc with the check knocked out, as on the page. */
function Disc({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="8" fill={INK} />
      <path d="M4.5 8.2l2.3 2.3 4.7-4.8" fill="none" stroke="#000000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A corner bracket, 28px, the hairline weight of the page's own `Corner`. */
function Bracket({ at }: { at: "tl" | "tr" | "bl" | "br" }) {
  const edge = `2px solid ${INK}`;
  const inset = 20;
  return (
    <div
      style={{
        position: "absolute",
        width: 28,
        height: 28,
        display: "flex",
        ...(at[0] === "t" ? { top: inset, borderTop: edge } : { bottom: inset, borderBottom: edge }),
        ...(at[1] === "l" ? { left: inset, borderLeft: edge } : { right: inset, borderRight: edge }),
      }}
    />
  );
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The avatar inlined as a data URL, or null. Inlining means the renderer
 * never fetches its own site (which may not be reachable at the configured
 * origin in dev), and a slow Storage response costs a card without a photo
 * rather than a failed card. JPEG and PNG only — what the renderer decodes.
 */
async function avatarDataUrl(url: string | null): Promise<string | null> {
  if (!isSafeAvatarUrl(url)) return null;

  if (url.startsWith(LOCAL_AVATAR_PREFIX)) {
    const avatar = readAvatar(url.slice(LOCAL_AVATAR_PREFIX.length));
    if (!avatar || avatar.type === "image/webp") return null;
    return `data:${avatar.type};base64,${avatar.bytes.toString("base64")}`;
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const type = response.headers.get("content-type")?.split(";")[0];
    if (!response.ok || (type !== "image/jpeg" && type !== "image/png")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
