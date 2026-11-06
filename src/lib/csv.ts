/**
 * CSV for spreadsheet export (list download). RFC 4180 quoting, CRLF rows,
 * and one defense spreadsheets need: a cell that starts with `=`, `+`, `-`,
 * `@`, tab, or CR is a formula to Excel and Sheets, so it is prefixed with
 * an apostrophe. Athlete names and notes are user-typed; a list export must
 * never run something when a recruiter opens it.
 */

export type CsvCell = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Numbers are data; only text can smuggle a formula ("-3" stays a number).
  if (typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly CsvCell[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** A filename-safe slug for Content-Disposition: "Spring visits!" → "spring-visits". */
export function csvFilename(name: string, fallback = "list"): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || fallback}.csv`;
}
