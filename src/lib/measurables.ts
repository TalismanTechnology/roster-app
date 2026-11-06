/**
 * Imperial at the edge, metric in the column.
 *
 * `profiles.height_cm` (smallint) and `weight_kg` (numeric(5,2)) stay metric
 * so they sort and compare cleanly; US recruiting reads feet, inches, and
 * pounds, so the editor takes those and these convert on the way in and out.
 * Rounding is chosen so a value survives a save → reload unchanged: 6'2"
 * stores as 188 cm and reads back as 6'2", 185 lbs as 83.91 kg → 185 lbs.
 */

export const CM_PER_INCH = 2.54;
export const KG_PER_LB = 0.45359237;

/** The column's bounds (0002 has no check; these match the editor's old metric inputs). */
export const HEIGHT_CM_RANGE = [90, 260] as const;
export const WEIGHT_KG_RANGE = [25, 300] as const;

export type FeetInches = { feet: number; inches: number };

/** 188 → { feet: 6, inches: 2 }. Null stays null. */
export function cmToFeetInches(cm: number | null | undefined): FeetInches | null {
  if (cm === null || cm === undefined || !Number.isFinite(cm)) return null;
  const total = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

/**
 * 6, 2 → 188. Either part may be missing (5 ft even, or "74 in" typed into
 * inches alone); both missing is null — the athlete cleared the field.
 */
export function feetInchesToCm(feet: number | null | undefined, inches: number | null | undefined): number | null {
  const f = feet ?? null;
  const i = inches ?? null;
  if (f === null && i === null) return null;
  return Math.round(((f ?? 0) * 12 + (i ?? 0)) * CM_PER_INCH);
}

/** 83.91 → 185. */
export function kgToLbs(kg: number | null | undefined): number | null {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return null;
  return Math.round(kg / KG_PER_LB);
}

/** 185 → 83.91 — two decimals, the column's scale. */
export function lbsToKg(lbs: number | null | undefined): number | null {
  if (lbs === null || lbs === undefined || !Number.isFinite(lbs)) return null;
  return Math.round(lbs * KG_PER_LB * 100) / 100;
}

/** 188 → 6'2". */
export function heightLabel(heightCm: number | null): string | null {
  const fi = cmToFeetInches(heightCm);
  return fi ? `${fi.feet}'${fi.inches}"` : null;
}

/** 83.91 → "185 lbs". */
export function weightLabel(weightKg: number | null): string | null {
  const lbs = kgToLbs(weightKg);
  return lbs === null ? null : `${lbs} lbs`;
}
