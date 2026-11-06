import type { AccountKind } from "@/lib/database.types";

/**
 * Where an account's workspace is. Only athletes have a resume to edit;
 * every other kind (recruiter, coach, brand, staff) works from lists.
 * Shared by the header, the post-sign-in redirect, and the editor's guard.
 */
export function homePathFor(kind: AccountKind | null | undefined): string {
  return kind && kind !== "athlete" ? "/lists" : "/resume";
}

/**
 * Where a just-onboarded account goes first (#52). An athlete has a resume
 * to fill in; a recruiter or coach has nothing saved yet, so they start
 * where the work starts — search. Later sign-ins use `homePathFor`.
 */
export function onboardingDestination(kind: AccountKind): string {
  return kind === "athlete" ? "/resume" : "/search";
}
