/**
 * Common positions per sport, as the chips the editor offers and the
 * suggestions the search filter lists. Stored as plain text on
 * `profiles.positions` (0002 keeps it text on purpose), so anything typed
 * as a custom position is just as searchable; search matches
 * case-insensitively (`holdsPosition` / search_athletes).
 */

/** `positions_bounded` (0002). */
export const MAX_POSITIONS = 6;
/** Longer than any position anyone lists ("4x400 anchor"). */
export const MAX_POSITION_LENGTH = 30;

export const POSITIONS: Record<string, string[]> = {
  football: ["QB", "RB", "WR", "TE", "OL", "DL", "EDGE", "LB", "CB", "S", "K", "P", "LS", "ATH"],
  basketball: ["PG", "SG", "SF", "PF", "C"],
  soccer: ["GK", "CB", "FB", "CDM", "CM", "CAM", "W", "ST"],
  track_field: ["Sprints", "Hurdles", "Middle distance", "Distance", "Jumps", "Throws", "Multi"],
  cross_country: ["Distance"],
  baseball: ["RHP", "LHP", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "UTIL"],
  softball: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "UTIL"],
  volleyball: ["OH", "OPP", "MB", "S", "L", "DS"],
  lacrosse: ["A", "M", "D", "G", "LSM", "FOGO"],
  swimming: ["Free", "Back", "Breast", "Fly", "IM", "Diving"],
  wrestling: [],
  hockey: ["C", "LW", "RW", "D", "G"],
  tennis: ["Singles", "Doubles"],
  golf: [],
  rowing: ["Port", "Starboard", "Sculler", "Coxswain"],
  gymnastics: ["All-around", "Vault", "Bars", "Beam", "Floor"],
};

export function positionsFor(sport: string | null | undefined): string[] {
  return (sport && POSITIONS[sport]) || [];
}

/** Every listed position across sports, deduplicated — the search suggestions with no sport chosen. */
export function allPositions(): string[] {
  return [...new Set(Object.values(POSITIONS).flat())].sort((a, b) => a.localeCompare(b));
}

/**
 * "WR, db ,WR,,  Slot" → ["WR", "db", "Slot"]: trimmed, empty dropped,
 * deduplicated case-insensitively (first spelling wins), each capped, at
 * most `MAX_POSITIONS`.
 */
export function normalizePositions(raw: string | readonly string[]): string[] {
  const parts = typeof raw === "string" ? raw.split(",") : raw;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const p = part.replace(/\s+/g, " ").trim().slice(0, MAX_POSITION_LENGTH).trim();
    if (!p || seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase());
    out.push(p);
    if (out.length === MAX_POSITIONS) break;
  }
  return out;
}
