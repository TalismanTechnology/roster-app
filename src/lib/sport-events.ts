import type { MeasureDirection } from "@/lib/database.types";

/**
 * The events an athlete in each sport most often puts on a resume, with the
 * unit a coach expects to read them in. The achievement editor offers these
 * as a picker that fills the title and unit; the athlete still types the
 * mark the way their sport writes it ("4:12.50", "6-08.25"), and
 * `parseMark` turns that into `value_numeric` in the event's canonical unit
 * so marks compare and sort.
 *
 * Templates, not the `sport_events` table: that table is staff-curated and
 * keyed by uuid; this list ships with the app and changes with a deploy.
 */

/** Canonical units. Times are seconds, distances and heights inches or meters. */
export const MARK_UNITS = ["sec", "in", "ft", "m", "cm", "lbs", "mph", "reps", "pts", "%"] as const;
export type MarkUnit = (typeof MARK_UNITS)[number];

export type EventTemplate = {
  slug: string;
  name: string;
  unit: MarkUnit;
  direction: MeasureDirection;
};

const t = (slug: string, name: string, unit: MarkUnit, direction: MeasureDirection = "higher_is_better"): EventTemplate => ({
  slug,
  name,
  unit,
  direction,
});
const timed = (slug: string, name: string) => t(slug, name, "sec", "lower_is_better");

/** Combine and testing events shared by most field and court sports. */
const COMBINE = [
  timed("40yd", "40-yard dash"),
  timed("shuttle_5_10_5", "5-10-5 shuttle"),
  t("vertical", "Vertical jump", "in"),
  t("broad", "Broad jump", "in"),
];

export const SPORT_EVENTS: Record<string, EventTemplate[]> = {
  football: [
    ...COMBINE,
    timed("3cone", "3-cone drill"),
    t("bench_reps", "Bench press reps (185)", "reps"),
    t("bench_max", "Bench press max", "lbs"),
    t("squat_max", "Squat max", "lbs"),
  ],
  track_field: [
    timed("100m", "100m"),
    timed("200m", "200m"),
    timed("400m", "400m"),
    timed("800m", "800m"),
    timed("1600m", "1600m"),
    timed("3200m", "3200m"),
    timed("110mh", "110m hurdles"),
    timed("100mh", "100m hurdles"),
    timed("300mh", "300m hurdles"),
    t("high_jump", "High jump", "in"),
    t("long_jump", "Long jump", "in"),
    t("triple_jump", "Triple jump", "in"),
    t("pole_vault", "Pole vault", "in"),
    t("shot_put", "Shot put", "in"),
    t("discus", "Discus", "in"),
    t("javelin", "Javelin", "in"),
  ],
  cross_country: [timed("5k", "5K"), timed("3mi", "3 mile"), timed("2mi", "2 mile")],
  swimming: [
    timed("50_free", "50 free"),
    timed("100_free", "100 free"),
    timed("200_free", "200 free"),
    timed("500_free", "500 free"),
    timed("100_back", "100 back"),
    timed("100_breast", "100 breast"),
    timed("100_fly", "100 fly"),
    timed("200_im", "200 IM"),
    t("diving_1m", "1m diving (11 dives)", "pts"),
  ],
  basketball: [
    t("vertical", "Vertical jump", "in"),
    t("standing_reach", "Standing reach", "in"),
    t("wingspan", "Wingspan", "in"),
    timed("lane_agility", "Lane agility"),
    timed("three_quarter_sprint", "3/4 court sprint"),
    t("ppg", "Points per game", "pts"),
    t("fg_pct", "Field goal %", "%"),
  ],
  soccer: [
    timed("40yd", "40-yard dash"),
    timed("beep_test", "Yo-Yo IR1 (time)"),
    timed("2mi", "2 mile"),
    t("goals", "Goals (season)", "pts"),
    t("assists", "Assists (season)", "pts"),
  ],
  baseball: [
    timed("60yd", "60-yard dash"),
    t("fb_velo", "Fastball velocity", "mph"),
    t("exit_velo", "Exit velocity", "mph"),
    t("if_velo", "Infield velocity", "mph"),
    t("of_velo", "Outfield velocity", "mph"),
    timed("pop_time", "Pop time"),
    t("avg", "Batting average", "%"),
  ],
  softball: [
    timed("home_to_first", "Home to first"),
    t("pitch_velo", "Pitch velocity", "mph"),
    t("exit_velo", "Exit velocity", "mph"),
    timed("pop_time", "Pop time"),
    t("avg", "Batting average", "%"),
  ],
  volleyball: [
    t("approach_touch", "Approach touch", "in"),
    t("block_touch", "Block touch", "in"),
    t("standing_reach", "Standing reach", "in"),
    t("kills", "Kills (season)", "pts"),
  ],
  lacrosse: [timed("40yd", "40-yard dash"), t("shot_speed", "Shot speed", "mph"), t("goals", "Goals (season)", "pts")],
  hockey: [timed("skate_lap", "Timed lap"), t("shot_speed", "Shot speed", "mph")],
  wrestling: [t("wins", "Wins (season)", "pts"), t("weight_class", "Weight class", "lbs")],
  rowing: [timed("2k_erg", "2K erg"), timed("6k_erg", "6K erg")],
  golf: [t("scoring_avg", "Scoring average", "pts", "lower_is_better"), t("driving_distance", "Driving distance", "ft")],
  gymnastics: [t("all_around", "All-around", "pts"), t("vault", "Vault", "pts"), t("floor", "Floor", "pts")],
  tennis: [t("utr", "UTR rating", "pts"), t("serve_speed", "Serve speed", "mph")],
};

export function eventsFor(sport: string | null | undefined): EventTemplate[] {
  return (sport && SPORT_EVENTS[sport]) || [];
}

export function findEvent(sport: string | null | undefined, slug: string | null | undefined): EventTemplate | null {
  if (!slug) return null;
  return eventsFor(sport).find((e) => e.slug === slug) ?? null;
}

export function isMarkUnit(value: unknown): value is MarkUnit {
  return typeof value === "string" && (MARK_UNITS as readonly string[]).includes(value);
}

/**
 * A mark as the sport writes it, as a number in `unit`. Null when it isn't
 * a single measurement ("21 G · 6 A", "1st", "All-State").
 *
 *   sec:  "10.84", "4:12.50", "1:02:03.4"
 *   in:   "34.5", "6-08.25", "6'8.25\"", "22' 4\"" (feet-inches → inches)
 *   else: a plain number, commas and a trailing unit word tolerated ("315 lbs", "92 mph")
 */
export function parseMark(display: string | null | undefined, unit: string | null | undefined): number | null {
  if (!display || !unit) return null;
  const s = display.trim().toLowerCase();
  if (s === "") return null;

  if (unit === "sec" || unit === "s") {
    const m = s.match(/^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)\s*s?(?:ec)?$/);
    if (!m) return null;
    // One colon is m:ss, two are h:mm:ss.
    const [h, mi] = m[2] !== undefined ? [Number(m[1]), Number(m[2])] : [0, Number(m[1] ?? 0)];
    return round4(h * 3600 + mi * 60 + Number(m[3]));
  }

  if (unit === "in") {
    const fi = s.match(/^(\d+)\s*(?:-|'|ft)\s*(\d+(?:\.\d+)?)\s*(?:"|in)?$/);
    if (fi) return round4(Number(fi[1]) * 12 + Number(fi[2]));
  }

  const plain = s.replace(/,/g, "").match(/^(-?\d+(?:\.\d+)?)\s*[a-z%"']*$/);
  return plain ? round4(Number(plain[1])) : null;
}

/** `value_numeric` back into words for a chip: 252.5 sec → "4:12.50", 80.25 in → "6' 8.25\"". */
export function formatMeasurable(value: number, unit: string): string {
  if ((unit === "sec" || unit === "s") && value >= 60) {
    const minutes = Math.floor(value / 60);
    const seconds = value - minutes * 60;
    return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
  }
  // Four feet and up reads in feet (jumps, throws, reach); below, inches (vertical).
  if (unit === "in" && value >= 48) {
    const feet = Math.floor(value / 12);
    const inches = round4(value - feet * 12);
    return `${feet}' ${trim(inches)}"`;
  }
  return `${trim(value)} ${unit}`;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function trim(n: number): string {
  return String(Number(n.toFixed(2)));
}
