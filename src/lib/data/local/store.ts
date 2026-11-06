import "server-only";

import fs from "node:fs";
import path from "node:path";

import type {
  Achievement,
  CoachContact,
  FilmClip,
  Membership,
  Organization,
  Profile,
  ProfileView,
} from "@/lib/database.types";

import type { VerificationRequest } from "../types";
import { dataDir } from "./paths";
import { buildSeed } from "./seed";

/**
 * The local database: one JSON file, read whole, written whole.
 *
 * This is deliberately not clever. A resume site in development holds a few
 * hundred rows; parsing them on every request costs less than a database
 * round trip would, and a single file is something a developer can open,
 * read, and delete. Writes go to a temp file and rename into place so a
 * crash mid-write never leaves a half-written database.
 *
 * Reads are never cached — see `readDb` for why.
 */

export type LocalUser = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
};

/** `achievements` plus the two columns the `record_entries` view joins in. */
export type AchievementRow = Achievement & {
  org_name: string | null;
  event_name: string | null;
};

export type EvidenceRow = {
  id: string;
  achievement_id: string;
  kind: string;
  url: string;
  caption: string | null;
  submitted_by: string | null;
  created_at: string;
};

export type VerificationRow = {
  id: string;
  achievement_id: string;
  verifier_id: string | null;
  verifier_kind: "coach" | "staff" | "self";
  outcome: "verified" | "disputed" | "rejected";
  method: string | null;
  note: string | null;
  verifier_name: string | null;
  created_at: string;
};

export type RecruiterListRow = {
  id: string;
  owner_id: string;
  name: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type RecruiterListMemberRow = {
  list_id: string;
  profile_id: string;
  note: string | null;
  added_at: string;
};

export type Db = {
  version: 1;
  users: LocalUser[];
  profiles: Profile[];
  organizations: Organization[];
  memberships: Membership[];
  achievements: AchievementRow[];
  evidence: EvidenceRow[];
  verifications: VerificationRow[];
  verification_requests: VerificationRequest[];
  film_clips: FilmClip[];
  coach_contacts: CoachContact[];
  profile_views: ProfileView[];
  recruiter_lists: RecruiterListRow[];
  recruiter_list_members: RecruiterListMemberRow[];
};

export function emptyDb(): Db {
  return {
    version: 1,
    users: [],
    profiles: [],
    organizations: [],
    memberships: [],
    achievements: [],
    evidence: [],
    verifications: [],
    verification_requests: [],
    film_clips: [],
    coach_contacts: [],
    profile_views: [],
    recruiter_lists: [],
    recruiter_list_members: [],
  };
}

function dbFile(): string {
  return path.join(dataDir(), "roster.json");
}

function ensureExists(): void {
  const file = dbFile();
  if (fs.existsSync(file)) return;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeDb(buildSeed());
}

/**
 * The current database, parsed fresh on every call. Treat the result as
 * read-only — use `mutate` to change it.
 *
 * There is deliberately no in-memory cache. Next's dev server keeps several
 * module instances alive (pages, actions, the proxy), each with its own
 * module state, so any cache here would need cross-instance invalidation to
 * be trustworthy. Parsing a few hundred kilobytes of JSON costs about a
 * millisecond; that is cheaper than being clever.
 */
export function readDb(): Db {
  ensureExists();
  return JSON.parse(fs.readFileSync(dbFile(), "utf8")) as Db;
}

export function writeDb(db: Db): void {
  const file = dbFile();
  const tmp = `${file}.${process.pid}.tmp`;

  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * Applies a change to a fresh copy of the database and persists it. The
 * callback receives its own clone, so a thrown error leaves the file as it
 * was and no caller ever sees a half-applied change.
 */
export function mutate<T>(change: (db: Db) => T): T {
  const db = structuredClone(readDb());
  const result = change(db);
  writeDb(db);
  return result;
}

/** Drops the file so the next read reseeds. Tests and `npm run seed`. */
export function resetDb(): void {
  const file = dbFile();
  if (fs.existsSync(file)) fs.rmSync(file);
}
