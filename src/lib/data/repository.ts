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
  SearchResult,
  CreatedVerificationRequest,
  VerificationAnswerOptions,
  VerificationRequest,
  VerificationRequestDetail,
  VerificationResponse,
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
  /**
   * Changing what the entry claims (see `SUBSTANTIVE_ENTRY_FIELDS`) drops it
   * back to unverified and expires any pending request: a coach vouched for
   * the old values, not the new ones.
   */
  updateEntry(profileId: string, entryId: string, patch: Partial<NewEntry>): Promise<RecordEntry>;
  deleteEntry(profileId: string, entryId: string): Promise<void>;
  /** Throws `invalid` when pinning would exceed `MAX_PINNED`. */
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
  /**
   * Opens a link for one entry and one of the athlete's references, and
   * supersedes any link still out for that entry. The raw token comes back
   * here and nowhere else — only its hash is stored. Throws `rate_limited`
   * past `DAILY_REQUEST_CAP` requests in a UTC day.
   */
  requestVerification(
    profileId: string,
    achievementId: string,
    coachContactId: string,
  ): Promise<CreatedVerificationRequest>;
  /** By raw token, whatever its status — the page explains used and expired. Null when unknown. */
  getVerificationRequest(token: string): Promise<VerificationRequestDetail | null>;
  /**
   * The athlete's other live requests to the same coach, for answering in
   * one sitting. Empty when the link itself is revoked, superseded, or past
   * its date.
   */
  getCoachBatchRequests(token: string): Promise<VerificationRequestDetail[]>;
  /** `responderUserId` is the signed-in user, if any; the athlete may not respond. */
  respondToVerification(
    token: string,
    outcome: "verified" | "disputed",
    note: string | null,
    verifier: { name: string; role: string | null },
    responderUserId: string | null,
    options?: VerificationAnswerOptions,
  ): Promise<VerificationResponse>;
  listVerificationRequests(profileId: string): Promise<VerificationRequest[]>;
  /** Closes a pending link (#41). `conflict` once it has been answered or closed. */
  revokeVerificationRequest(profileId: string, requestId: string): Promise<void>;

  // --- signals ------------------------------------------------------------
  recordView(profileId: string, viewerId: string | null): Promise<void>;
  weeklyViews(profileId: string): Promise<number>;

  // --- discovery ----------------------------------------------------------
  /** Listed athletes only. The query is normalized and the page clamped here. */
  searchAthletes(params: SearchParams): Promise<SearchResult>;

  // --- recruiter lists ----------------------------------------------------
  listLists(ownerId: string): Promise<RecruiterList[]>;
  getList(ownerId: string, listId: string): Promise<RecruiterListDetail | null>;
  createList(ownerId: string, name: string, note: string | null): Promise<RecruiterList>;
  deleteList(ownerId: string, listId: string): Promise<void>;
  addToList(ownerId: string, listId: string, profileId: string, note: string | null): Promise<void>;
  removeFromList(ownerId: string, listId: string, profileId: string): Promise<void>;
  /** Which of the owner's lists already hold this athlete. */
  listsContaining(ownerId: string, profileId: string): Promise<string[]>;
  /** `listsContaining` for a page of athletes in one read: profile id → list ids. */
  listsContainingMany(ownerId: string, profileIds: string[]): Promise<Record<string, string[]>>;
}
