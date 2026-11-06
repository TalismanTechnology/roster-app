import type { AccountKind } from "@/lib/database.types";

/**
 * Where an account's workspace is. Only athletes have a resume to edit;
 * every other kind (recruiter, coach, brand, staff) works from lists.
 * Shared by the header, the post-sign-in redirect, and the editor's guard.
 */
export function homePathFor(kind: AccountKind | null | undefined): string {
  return kind && kind !== "athlete" ? "/lists" : "/resume";
}
