import type { CoachContact, FilmClip, Profile, RecordEntry } from "@/lib/database.types";

import type {
  AuthUser,
  NewCoach,
  NewEntry,
  NewFilm,
  NewProfile,
  RecruiterList,
  RecruiterListDetail,
  SearchParams,
  VerificationRequest,
  VerificationRequestDetail,
} from "./types";

/**
 * Everything a page or Server Action may ask of the data layer.
 *
 * Two implementations: `LocalRepository` (a JSON file, for development and
 * for nights when Supabase is unreachable) and `SupabaseRepository` (the
 * real thing). Pages never import either directly — they call
 * `getRepository()` and get whichever the environment selects.
 *
 * Authorization lives here, not in the caller: every read that could leak
 * takes the viewer's id and applies the same visibility rules RLS enforces
 * in Postgres. Every write takes the actor's profile id and refuses rows
 * they do not own. Methods throw `DataError` rather than returning error
 * tuples, so a forgotten check fails loudly instead of rendering nothing.
 */
export interface Repository {
  // --- accounts -----------------------------------------------------------
  /** Creates the account. Throws `conflict` when the email is taken. */
  signUp(email: string, password: string): Promise<AuthUser>;
  /** Null on a bad email/password pair — never says which. */
  signIn(email: string, password: string): Promise<AuthUser | null>;
  getUser(userId: string): Promise<AuthUser | null>;
  updateEmail(userId: string, email: string): Promise<void>;
  updatePassword(userId: string, current: string, next: string): Promise<void>;
  /** Removes the account and everything it owns. */
  deleteAccount(userId: string): Promise<void>;

  // --- profiles -----------------------------------------------------------
  /** The owner's own row, ungated. */
  getProfileById(id: string): Promise<Profile | null>;
  /** Gated by visibility: private resumes are null to everyone but the owner. */
  getProfileByHandle(handle: string, viewerId: string | null): Promise<Profile | null>;
  isHandleAvailable(handle: string): Promise<boolean>;
  /** Throws `conflict` when the handle is taken, `invalid` when reserved. */
  createProfile(input: NewProfile): Promise<Profile>;
  updateProfile(id: string, patch: Partial<Profile>): Promise<Profile>;

  // --- the record ---------------------------------------------------------
  listEntries(profileId: string): Promise<RecordEntry[]>;
  addEntry(profileId: string, input: NewEntry): Promise<RecordEntry>;
  updateEntry(profileId: string, entryId: string, patch: Partial<NewEntry>): Promise<RecordEntry>;
  deleteEntry(profileId: string, entryId: string): Promise<void>;
  setPinned(profileId: string, entryId: string, isPinned: boolean): Promise<void>;

  // --- film ---------------------------------------------------------------
  listFilm(profileId: string): Promise<FilmClip[]>;
  addFilm(profileId: string, input: NewFilm): Promise<FilmClip>;
  deleteFilm(profileId: string, clipId: string): Promise<void>;
  featureFilm(profileId: string, clipId: string): Promise<void>;

  // --- references ---------------------------------------------------------
  /** Contact details are stripped unless the viewer may see them. */
  listCoaches(profileId: string, viewerId: string | null): Promise<CoachContact[]>;
  addCoach(profileId: string, input: NewCoach): Promise<CoachContact>;
  deleteCoach(profileId: string, coachId: string): Promise<void>;

  // --- verification -------------------------------------------------------
  requestVerification(
    profileId: string,
    achievementId: string,
    coachContactId: string,
  ): Promise<VerificationRequest>;
  getVerificationRequest(token: string): Promise<VerificationRequestDetail | null>;
  /** `responderUserId` is the signed-in user, if any; the athlete may not respond. */
  respondToVerification(
    token: string,
    outcome: "verified" | "disputed",
    note: string | null,
    verifier: { name: string; role: string | null },
    responderUserId: string | null,
  ): Promise<void>;
  listVerificationRequests(profileId: string): Promise<VerificationRequest[]>;

  // --- signals ------------------------------------------------------------
  recordView(profileId: string, viewerId: string | null): Promise<void>;
  weeklyViews(profileId: string): Promise<number>;

  // --- discovery ----------------------------------------------------------
  searchAthletes(params: SearchParams): Promise<Profile[]>;

  // --- recruiter lists ----------------------------------------------------
  listLists(ownerId: string): Promise<RecruiterList[]>;
  getList(ownerId: string, listId: string): Promise<RecruiterListDetail | null>;
  createList(ownerId: string, name: string, note: string | null): Promise<RecruiterList>;
  deleteList(ownerId: string, listId: string): Promise<void>;
  addToList(ownerId: string, listId: string, profileId: string, note: string | null): Promise<void>;
  removeFromList(ownerId: string, listId: string, profileId: string): Promise<void>;
  /** Which of the owner's lists already hold this athlete. */
  listsContaining(ownerId: string, profileId: string): Promise<string[]>;
}
