import type { ListedAthlete } from "@/lib/data/types";
import { levelLabel } from "@/lib/format";
import { heightLabel, weightLabel } from "@/lib/measurables";
import { absoluteUrl } from "@/lib/site";
import { sportName } from "@/lib/sports";

import { toCsv } from "./csv";

/** The list download's columns, in the order a recruiter scans them. */
export const LIST_CSV_HEADER = [
  "Name",
  "Resume",
  "Sport",
  "Positions",
  "Level",
  "Class of",
  "School",
  "State",
  "Height",
  "Weight",
  "GPA",
  "Verified entries",
  "Entries",
  "Contact email",
  "Note",
  "Added",
] as const;

/**
 * One row per athlete on the list. Contact email only when the athlete is
 * open to recruiting — the same rule the resume page applies — so the
 * export never carries more than the recruiter could already read.
 */
export function listMembersToCsv(members: readonly ListedAthlete[]): string {
  return toCsv(
    LIST_CSV_HEADER,
    members.map((a) => [
      a.display_name,
      absoluteUrl(`/${a.handle}`),
      sportName(a.primary_sport),
      a.positions.join(" / "),
      levelLabel(a.level),
      a.grad_year,
      a.school,
      a.region,
      heightLabel(a.height_cm),
      weightLabel(a.weight_kg),
      a.gpa,
      a.verified_count,
      a.entry_count,
      a.is_recruitable && a.visibility === "public" ? a.contact_email : null,
      a.list_note,
      a.added_at.slice(0, 10),
    ]),
  );
}
