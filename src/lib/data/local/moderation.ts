import "server-only";

import type { Profile } from "@/lib/database.types";

import { DataError } from "../types";
import type { Db } from "./store";

/**
 * Suspension against the local file, shared by `LocalRepository` (staff,
 * through the app) and `scripts/moderate.ts` (an operator at the shell —
 * local mode's stand-in for the service role). Mirrors
 * `set_profile_suspension()` in 0021: the timestamp, and suspending resolves
 * the resume's open reports as actioned.
 */
export function applySuspension(db: Db, profileId: string, suspended: boolean, actorId: string | null, at = new Date().toISOString()): Profile {
  const profile = db.profiles.find((p) => p.id === profileId);
  if (!profile) throw new DataError("not_found", "That profile was not found.");
  profile.suspended_at = suspended ? (profile.suspended_at ?? at) : null;
  profile.updated_at = at;
  if (suspended) {
    for (const r of db.profile_reports) {
      if (r.profile_id === profileId && r.status === "open") {
        r.status = "actioned";
        r.resolved_at = at;
        r.resolved_by = actorId;
      }
    }
  }
  return profile;
}
