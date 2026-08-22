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

/** "2h", "3d", "Mar 14" — feed timestamps, terse near, absolute far. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
