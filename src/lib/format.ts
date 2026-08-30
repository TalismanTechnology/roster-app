import type { AchievementKind, AthleteLevel, RecordEntry } from "@/lib/database.types";

const LEVEL_LABELS: Record<AthleteLevel, string> = {
  high_school: "High School",
  club: "Club",
  juco: "JUCO",
  ncaa_d3: "NCAA D3",
  ncaa_d2: "NCAA D2",
  ncaa_d1: "NCAA D1",
  naia: "NAIA",
  semi_pro: "Semi-Pro",
  professional: "Professional",
  national_team: "National Team",
  olympic: "Olympic",
};

const KIND_LABELS: Record<AchievementKind, string> = {
  personal_record: "Personal Record",
  result: "Result",
  award: "Award",
  record: "Record",
  captaincy: "Captaincy",
  commitment: "Commitment",
  selection: "Selection",
  milestone: "Milestone",
};

export function levelLabel(level: AthleteLevel | null): string | null {
  return level ? LEVEL_LABELS[level] : null;
}

export function kindLabel(kind: AchievementKind): string {
  return KIND_LABELS[kind];
}

/**
 * "track_field" → "Track Field", "cross country" → "Cross Country".
 *
 * Title-cases here rather than with a CSS `capitalize` class, because that
 * class capitalizes *every* word in the element — which turned an adjacent
 * "Class of 2027" into "Class Of 2027".
 */
export function sportLabel(sport: string | null): string | null {
  if (!sport) return null;

  return sport
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * Formats a date as the record displays it: 05.04.24, matching the preview
 * site. Parsed as UTC because `achieved_on` is a bare date — letting the
 * browser apply a local timezone would shift results across day boundaries
 * for anyone west of UTC.
 */
export function recordDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${month}.${day}.${year.slice(2)}`;
}

export function fullDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "1st of 42", "3rd" — the shorthand every results sheet already uses. */
export function placementLabel(entry: Pick<RecordEntry, "placement" | "field_size">): string | null {
  if (entry.placement === null) return null;

  const ordinal = toOrdinal(entry.placement);
  return entry.field_size ? `${ordinal} of ${entry.field_size}` : ordinal;
}

function toOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;

  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * The single line of context under an entry's title: where it happened and
 * against whom. Empty segments drop out rather than leaving stray separators.
 */
export function entryContext(entry: RecordEntry): string {
  return [entry.competition, entry.org_name, entry.location]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/**
 * 170cm → 5'7". Recruiters in US sports read height in feet and inches;
 * storing metric keeps the column sortable and this converts at the edge.
 */
export function heightLabel(heightCm: number | null): string | null {
  if (heightCm === null) return null;

  const totalInches = Math.round(heightCm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;

  return `${feet}'${inches}"`;
}

/** 59kg → 130 lbs, same reasoning as height. */
export function weightLabel(weightKg: number | null): string | null {
  if (weightKg === null) return null;

  return `${Math.round(weightKg * 2.20462)} lbs`;
}

/** Select options for forms, in the order an athlete climbs them. */
export const LEVEL_OPTIONS = Object.entries(LEVEL_LABELS) as [AthleteLevel, string][];
export const KIND_OPTIONS = Object.entries(KIND_LABELS) as [AchievementKind, string][];
