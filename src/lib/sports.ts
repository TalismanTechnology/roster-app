/**
 * The sport list. Values are the stable keys stored on `profiles.primary_sport`
 * and matched by search; labels are what people read. Athletes in a sport
 * not listed pick "other" and describe it in their bio — a short list that
 * search can filter on beats a long one it can't.
 */
export const SPORTS: [string, string][] = [
  ["football", "Football"],
  ["basketball", "Basketball"],
  ["soccer", "Soccer"],
  ["track_field", "Track & Field"],
  ["cross_country", "Cross Country"],
  ["baseball", "Baseball"],
  ["softball", "Softball"],
  ["volleyball", "Volleyball"],
  ["lacrosse", "Lacrosse"],
  ["swimming", "Swimming & Diving"],
  ["wrestling", "Wrestling"],
  ["hockey", "Ice Hockey"],
  ["tennis", "Tennis"],
  ["golf", "Golf"],
  ["rowing", "Rowing"],
  ["gymnastics", "Gymnastics"],
  ["other", "Other"],
];

const LABELS = new Map(SPORTS);

/** "track_field" → "Track & Field"; unknown keys fall back to title case. */
export function sportName(key: string | null): string | null {
  if (!key) return null;
  return (
    LABELS.get(key) ??
    key
      .replace(/_/g, " ")
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ")
  );
}
