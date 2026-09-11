/** Private DOB eligibility without persistence, browser clock assumptions, or URL state. */
export function eligibleAge(dateOfBirth: unknown, today = new Date()): boolean {
  if (typeof dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== dateOfBirth) return false;
  const age = today.getUTCFullYear() - birth.getUTCFullYear() - Number(
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate()),
  );
  return age >= 13 && age <= 120;
}
