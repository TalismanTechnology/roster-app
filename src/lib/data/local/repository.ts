import "server-only";

import { randomUUID } from "node:crypto";

import type { CoachContact, FilmClip, Profile, RecordEntry } from "@/lib/database.types";
import { HANDLE_PATTERN, isReservedHandle } from "@/lib/handles";

import type { Repository } from "../repository";
import {
  DataError,
  type AuthUser,
  type NewCoach,
  type NewEntry,
  type NewFilm,
  type NewProfile,
  type RecruiterList,
  type RecruiterListDetail,
  type SearchParams,
  type SearchResult,
  type CreatedVerificationRequest,
  type VerificationAnswerOptions,
  type VerificationRequest,
  type VerificationRequestDetail,
  type VerificationResponse,
} from "../types";
import {
  canActForSibling,
  canPinAnother,
  canRespondToRequest,
  DAILY_REQUEST_CAP,
  isLiveRequest,
  isOverDailyCap,
  REQUEST_TTL_DAYS,
  canSeeCoachContact,
  canViewProfile,
  isSubstantiveEntryChange,
  MAX_PINNED,
  SUBSTANTIVE_ENTRY_FIELDS,
} from "../rules";
import { parseFilmUrl } from "./film";
import { hashPassword, verifyPassword, verifyPasswordConstantTime } from "./password";
import { generateToken, hashToken } from "../tokens";
import { searchProfiles } from "./search";
import {
  mutate,
  readDb,
  type AchievementRow,
  type Db,
  type RecruiterListRow,
  type VerificationRequestRow,
} from "./store";

const REQUEST_TTL_MS = REQUEST_TTL_DAYS * 86_400_000;

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

/**
 * The file-backed adapter. Every method reads the current file, applies the
 * same rules Postgres would, and — for writes — persists atomically.
 *
 * The triggers from migration 0007 are reproduced as plain functions called
 * at the same moments: counters resync after any achievement change, a
 * verification decision writes through to the achievement, film URLs are
 * parsed on write.
 */
export class LocalRepository implements Repository {
  // --- accounts -----------------------------------------------------------

  async signUp(email: string, password: string): Promise<AuthUser> {
    const normalized = email.trim().toLowerCase();
    return mutate((db) => {
      if (db.users.some((u) => u.email === normalized)) {
        throw new DataError("conflict", "An account with that email already exists.");
      }
      const user = {
        id: randomUUID(),
        email: normalized,
        password_hash: hashPassword(password),
        created_at: now(),
      };
      db.users.push(user);
      return { id: user.id, email: user.email };
    });
  }

  async signIn(email: string, password: string): Promise<AuthUser | null> {
    const normalized = email.trim().toLowerCase();
    const user = readDb().users.find((u) => u.email === normalized);
    // One scrypt run whether or not the account exists — see dummyPasswordHash.
    if (!verifyPasswordConstantTime(password, user?.password_hash) || !user) return null;
    return { id: user.id, email: user.email };
  }

  async getUser(userId: string): Promise<AuthUser | null> {
    const user = readDb().users.find((u) => u.id === userId);
    return user ? { id: user.id, email: user.email } : null;
  }

  async updateEmail(userId: string, email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    await mutate((db) => {
      if (db.users.some((u) => u.email === normalized && u.id !== userId)) {
        throw new DataError("conflict", "That email is already in use.");
      }
      const user = requireUser(db, userId);
      user.email = normalized;
    });
  }

  async updatePassword(userId: string, current: string, next: string): Promise<void> {
    await mutate((db) => {
      const user = requireUser(db, userId);
      if (!verifyPassword(current, user.password_hash)) {
        throw new DataError("forbidden", "Your current password did not match.");
      }
      user.password_hash = hashPassword(next);
      // Every cookie issued before this moment stops working.
      user.session_version = (user.session_version ?? 0) + 1;
    });
  }

  /** Local-mode only: the version a session cookie must carry, or null for no such user. */
  async sessionVersion(userId: string): Promise<number | null> {
    const user = readDb().users.find((u) => u.id === userId);
    return user ? (user.session_version ?? 0) : null;
  }

  async deleteAccount(userId: string): Promise<void> {
    await mutate((db) => {
      const mine = new Set(db.achievements.filter((a) => a.profile_id === userId).map((a) => a.id));
      db.users = db.users.filter((u) => u.id !== userId);
      db.profiles = db.profiles.filter((p) => p.id !== userId);
      db.memberships = db.memberships.filter((m) => m.profile_id !== userId);
      db.achievements = db.achievements.filter((a) => a.profile_id !== userId);
      db.evidence = db.evidence.filter((e) => !mine.has(e.achievement_id));
      db.verifications = db.verifications.filter((v) => !mine.has(v.achievement_id));
      db.verification_requests = db.verification_requests.filter((r) => r.profile_id !== userId);
      db.film_clips = db.film_clips.filter((f) => f.profile_id !== userId);
      db.coach_contacts = db.coach_contacts.filter((c) => c.profile_id !== userId);
      db.profile_views = db.profile_views.filter((v) => v.profile_id !== userId && v.viewer_id !== userId);
      const lists = new Set(db.recruiter_lists.filter((l) => l.owner_id === userId).map((l) => l.id));
      db.recruiter_lists = db.recruiter_lists.filter((l) => l.owner_id !== userId);
      db.recruiter_list_members = db.recruiter_list_members.filter(
        (m) => !lists.has(m.list_id) && m.profile_id !== userId,
      );
    });
  }

  // --- profiles -----------------------------------------------------------

  async getProfileById(id: string): Promise<Profile | null> {
    return readDb().profiles.find((p) => p.id === id) ?? null;
  }

  async getProfileByHandle(handle: string, viewerId: string | null): Promise<Profile | null> {
    const db = readDb();
    const target = db.profiles.find((p) => p.handle === handle.toLowerCase());
    const viewer = viewerId ? db.profiles.find((p) => p.id === viewerId) : null;
    return canViewProfile(target, viewerId, viewer) ? (target ?? null) : null;
  }

  async isHandleAvailable(handle: string): Promise<boolean> {
    const h = handle.toLowerCase();
    if (!HANDLE_PATTERN.test(h) || isReservedHandle(h)) return false;
    return !readDb().profiles.some((p) => p.handle === h);
  }

  async createProfile(input: NewProfile): Promise<Profile> {
    const handle = input.handle.toLowerCase();
    if (!HANDLE_PATTERN.test(handle)) throw new DataError("invalid", "That handle is not valid.");
    if (isReservedHandle(handle)) throw new DataError("invalid", "That handle is reserved.");
    // Mirrors guard_profile_privileged_columns() (0015): staff is granted, not chosen.
    if (input.account_kind === "staff") throw new DataError("forbidden", "That account type is not available.");

    return mutate((db) => {
      if (db.profiles.some((p) => p.handle === handle)) {
        throw new DataError("conflict", "That handle is taken.");
      }
      if (db.profiles.some((p) => p.id === input.id)) {
        throw new DataError("conflict", "This account already has a resume.");
      }
      const profile = newProfile({ ...input, handle });
      db.profiles.push(profile);
      return profile;
    });
  }

  async updateProfile(id: string, patch: Partial<Profile>): Promise<Profile> {
    return mutate((db) => {
      const profile = requireProfile(db, id);
      // Handles and counters are not editable through this path, nor are the
      // columns guard_profile_privileged_columns() (0015) keeps from the
      // owner: account kind, moderation, and identity trust.
      const {
        id: _id, handle: _handle, entry_count: _e, verified_count: _v, created_at: _c,
        account_kind: _k, suspended_at: _s, identity_verified_at: _iv,
        ...safe
      } = patch;
      void _id; void _handle; void _e; void _v; void _c; void _k; void _s; void _iv;
      Object.assign(profile, safe, { updated_at: now() });
      return profile;
    });
  }

  // --- the record ---------------------------------------------------------

  async listEntries(profileId: string): Promise<RecordEntry[]> {
    const db = readDb();
    return db.achievements
      .filter((a) => a.profile_id === profileId)
      .map((a) => toEntry(db, a))
      .sort(byPinnedThenDate);
  }

  async addEntry(profileId: string, input: NewEntry): Promise<RecordEntry> {
    return mutate((db) => {
      const profile = requireProfile(db, profileId);
      const row: AchievementRow = {
        id: randomUUID(),
        profile_id: profileId,
        kind: input.kind,
        title: input.title,
        detail: input.detail,
        sport: input.sport ?? profile.primary_sport,
        event_id: null,
        value_numeric: null,
        value_display: input.value_display,
        unit: null,
        competition: input.competition,
        opponent: null,
        placement: input.placement,
        field_size: input.field_size,
        org_id: null,
        location: input.location,
        achieved_on: input.achieved_on,
        verification: "unverified",
        verified_at: null,
        is_pinned: false,
        created_at: now(),
        updated_at: now(),
        org_name: null,
        event_name: null,
      };
      db.achievements.push(row);
      syncCounts(db, profileId);
      return toEntry(db, row);
    });
  }

  async updateEntry(profileId: string, entryId: string, patch: Partial<NewEntry>): Promise<RecordEntry> {
    return mutate((db) => {
      const row = requireOwned(db.achievements, entryId, profileId, "entry");
      const isSubstantive = isSubstantiveEntryChange(row, patch);
      Object.assign(row, pickEntryFields(patch), { updated_at: now() });

      if (isSubstantive) {
        // The coach vouched for the old values. The badge, its date, and any
        // link still waiting on an answer all describe a claim that no
        // longer exists. `verified_by` is derived from `verification`, so it
        // clears with it.
        row.verification = "unverified";
        row.verified_at = null;
        expirePendingRequests(db, row.id);
        syncCounts(db, profileId);
      }
      return toEntry(db, row);
    });
  }

  async deleteEntry(profileId: string, entryId: string): Promise<void> {
    await mutate((db) => {
      requireOwned(db.achievements, entryId, profileId, "entry");
      db.achievements = db.achievements.filter((a) => a.id !== entryId);
      db.evidence = db.evidence.filter((e) => e.achievement_id !== entryId);
      db.verifications = db.verifications.filter((v) => v.achievement_id !== entryId);
      db.verification_requests = db.verification_requests.filter((r) => r.achievement_id !== entryId);
      syncCounts(db, profileId);
    });
  }

  async setPinned(profileId: string, entryId: string, isPinned: boolean): Promise<void> {
    await mutate((db) => {
      const row = requireOwned(db.achievements, entryId, profileId, "entry");
      if (isPinned && !row.is_pinned && !canPinAnother(db.achievements.filter((a) => a.profile_id === profileId))) {
        throw new DataError("invalid", `You can pin up to ${MAX_PINNED} entries. Unpin one first.`);
      }
      row.is_pinned = isPinned;
      row.updated_at = now();
    });
  }

  // --- film ---------------------------------------------------------------

  async listFilm(profileId: string): Promise<FilmClip[]> {
    return readDb()
      .film_clips.filter((f) => f.profile_id === profileId)
      .sort(
        (a, b) =>
          Number(b.is_featured) - Number(a.is_featured) ||
          a.position - b.position ||
          a.created_at.localeCompare(b.created_at),
      );
  }

  async addFilm(profileId: string, input: NewFilm): Promise<FilmClip> {
    return mutate((db) => {
      const profile = requireProfile(db, profileId);
      const parsed = parseFilmUrl(input.url);
      const position = db.film_clips.filter((f) => f.profile_id === profileId).length;
      const clip: FilmClip = {
        id: randomUUID(),
        profile_id: profileId,
        title: input.title,
        url: input.url,
        provider: parsed.provider,
        external_id: parsed.external_id,
        thumbnail_url:
          parsed.provider === "youtube" && parsed.external_id
            ? `https://i.ytimg.com/vi/${parsed.external_id}/hqdefault.jpg`
            : null,
        season: input.season,
        sport: profile.primary_sport,
        duration_s: null,
        is_featured: position === 0,
        position,
        created_at: now(),
        updated_at: now(),
      };
      db.film_clips.push(clip);
      return clip;
    });
  }

  async deleteFilm(profileId: string, clipId: string): Promise<void> {
    await mutate((db) => {
      requireOwned(db.film_clips, clipId, profileId, "clip");
      db.film_clips = db.film_clips.filter((f) => f.id !== clipId);
    });
  }

  async featureFilm(profileId: string, clipId: string): Promise<void> {
    await mutate((db) => {
      requireOwned(db.film_clips, clipId, profileId, "clip");
      for (const clip of db.film_clips) {
        if (clip.profile_id !== profileId) continue;
        clip.is_featured = clip.id === clipId;
      }
    });
  }

  // --- references ---------------------------------------------------------

  async listCoaches(profileId: string, viewerId: string | null): Promise<CoachContact[]> {
    const db = readDb();
    const athlete = db.profiles.find((p) => p.id === profileId);
    if (!athlete) return [];
    const viewer = viewerId ? db.profiles.find((p) => p.id === viewerId) : null;

    // coach_contacts_select: a row the viewer may not see is absent, not
    // redacted — the coach's name is as protected as their phone number.
    return db.coach_contacts
      .filter((c) => c.profile_id === profileId)
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
      .filter((c) => canSeeCoachContact(c, athlete, viewerId, viewer));
  }

  async addCoach(profileId: string, input: NewCoach): Promise<CoachContact> {
    return mutate((db) => {
      requireProfile(db, profileId);
      const contact: CoachContact = {
        id: randomUUID(),
        profile_id: profileId,
        name: input.name,
        role: input.role,
        org_id: null,
        org_name: input.org_name,
        email: input.email,
        phone: input.phone,
        is_visible: true,
        position: db.coach_contacts.filter((c) => c.profile_id === profileId).length,
        created_at: now(),
      };
      db.coach_contacts.push(contact);
      return contact;
    });
  }

  async deleteCoach(profileId: string, coachId: string): Promise<void> {
    await mutate((db) => {
      requireOwned(db.coach_contacts, coachId, profileId, "reference");
      db.coach_contacts = db.coach_contacts.filter((c) => c.id !== coachId);
    });
  }

  // --- verification -------------------------------------------------------

  async requestVerification(
    profileId: string,
    achievementId: string,
    coachContactId: string,
  ): Promise<CreatedVerificationRequest> {
    return mutate((db) => {
      const entry = requireOwned(db.achievements, achievementId, profileId, "entry");
      requireOwned(db.coach_contacts, coachContactId, profileId, "reference");

      // create_verification_request()'s daily cap. Checked under the store
      // lock, so two tabs cannot both slip under it.
      if (isOverDailyCap(db.verification_requests, profileId)) {
        throw new DataError(
          "rate_limited",
          `You can send ${DAILY_REQUEST_CAP} verification requests a day. Try again tomorrow.`,
        );
      }

      // One live request per entry; re-requesting supersedes the old link.
      expirePendingRequests(db, achievementId);

      const token = generateToken();
      const row: VerificationRequestRow = {
        id: randomUUID(),
        token_hash: hashToken(token),
        achievement_id: achievementId,
        profile_id: profileId,
        coach_contact_id: coachContactId,
        status: "pending",
        note: null,
        verifier_name: null,
        verifier_role: null,
        flagged_unknown_athlete: false,
        created_at: now(),
        responded_at: null,
        expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
      };
      db.verification_requests.push(row);
      entry.verification = "submitted";
      entry.verified_at = null;
      entry.updated_at = now();
      return { ...publicRequest(row), token };
    });
  }

  async getVerificationRequest(token: string): Promise<VerificationRequestDetail | null> {
    const db = readDb();
    const request = findByToken(db, token);
    return request ? toDetail(db, request) : null;
  }

  async getCoachBatchRequests(token: string): Promise<VerificationRequestDetail[]> {
    const db = readDb();
    const authority = findByToken(db, token);
    if (!authority) return [];
    return db.verification_requests
      .filter((r) => isLiveRequest(r) && isSibling(db, authority, r))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .flatMap((r) => toDetail(db, r) ?? []);
  }

  async respondToVerification(
    token: string,
    outcome: "verified" | "disputed",
    note: string | null,
    verifier: { name: string; role: string | null },
    responderUserId: string | null,
    options: VerificationAnswerOptions = {},
  ): Promise<VerificationResponse> {
    return mutate((db) => {
      const authority = findByToken(db, token);
      if (!authority) throw new DataError("not_found", "That verification link is not valid.");

      let request = authority;
      if (options.requestId && options.requestId !== authority.id) {
        const sibling = db.verification_requests.find((r) => r.id === options.requestId);
        if (!sibling || !isSibling(db, authority, sibling)) {
          // The link itself being dead reads as expired, like the RPC says.
          if (authority.status === "expired" || new Date(authority.expires_at) <= new Date()) {
            throw new DataError("forbidden", RESPONSE_COPY.expired);
          }
          throw new DataError("not_found", "That verification request was not found.");
        }
        request = sibling;
      }

      const allowed = canRespondToRequest(request, responderUserId);
      if (!allowed.ok) throw new DataError("forbidden", RESPONSE_COPY[allowed.reason]);

      const entry = db.achievements.find((a) => a.id === request.achievement_id);
      if (!entry) throw new DataError("not_found", "That entry no longer exists.");

      // A flag is a dispute, whatever button sent it — as in respond_verification().
      const flagged = options.flagUnknownAthlete === true;
      const decided = flagged ? "disputed" : outcome;
      const at = now();
      db.verifications.push({
        id: randomUUID(),
        achievement_id: entry.id,
        verifier_id: responderUserId,
        verifier_kind: "coach",
        outcome: decided,
        method: "coach_attestation",
        note,
        verifier_name: verifier.name,
        verifier_role: verifier.role,
        created_at: at,
      });

      // apply_verification()
      entry.verification = decided;
      entry.verified_at = decided === "verified" ? at : null;
      entry.updated_at = at;

      request.status = decided;
      request.note = note;
      request.verifier_name = verifier.name;
      request.verifier_role = verifier.role;
      request.flagged_unknown_athlete = flagged;
      request.responded_at = at;

      syncCounts(db, entry.profile_id);
      const athlete = requireProfile(db, entry.profile_id);
      // Local mode can reach the account email too; Supabase only has the
      // published contact_email (see respond_verification()).
      const accountEmail = db.users.find((u) => u.id === athlete.id)?.email ?? null;
      return {
        requestId: request.id,
        handle: athlete.handle,
        outcome: decided,
        flaggedUnknownAthlete: flagged,
        athleteName: athlete.display_name,
        athleteEmail: athlete.contact_email ?? accountEmail,
        entryTitle: entry.title,
      };
    });
  }

  async listVerificationRequests(profileId: string): Promise<VerificationRequest[]> {
    return readDb()
      .verification_requests.filter((r) => r.profile_id === profileId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(publicRequest);
  }

  async revokeVerificationRequest(profileId: string, requestId: string): Promise<void> {
    await mutate((db) => {
      const request = requireOwned(db.verification_requests, requestId, profileId, "request");
      if (request.status !== "pending") {
        throw new DataError("conflict", "That request has already been answered or closed.");
      }
      request.status = "expired";
      // sync_entry_on_request(): the last open link takes the entry back.
      const entry = db.achievements.find((a) => a.id === request.achievement_id);
      const stillOpen = db.verification_requests.some((r) => r.achievement_id === request.achievement_id && r.status === "pending");
      if (entry && entry.verification === "submitted" && !stillOpen) {
        entry.verification = "unverified";
        entry.verified_at = null;
        entry.updated_at = now();
      }
    });
  }

  // --- signals ------------------------------------------------------------

  async recordView(profileId: string, viewerId: string | null): Promise<void> {
    if (viewerId === profileId) return;

    // The visibility check and the increment share one locked snapshot, so
    // a resume going private mid-request is never counted against.
    await mutate((d) => {
      const target = d.profiles.find((p) => p.id === profileId);
      const viewer = viewerId ? d.profiles.find((p) => p.id === viewerId) : null;
      if (!canViewProfile(target, viewerId, viewer)) return;

      const day = today();
      const existing = d.profile_views.find(
        (v) => v.profile_id === profileId && v.viewer_id === viewerId && v.viewed_on === day,
      );
      if (existing) existing.view_count += 1;
      else d.profile_views.push({ profile_id: profileId, viewer_id: viewerId, viewed_on: day, view_count: 1 });
    });
  }

  async weeklyViews(profileId: string): Promise<number> {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    return readDb()
      .profile_views.filter((v) => v.profile_id === profileId && v.viewed_on >= since)
      .reduce((sum, v) => sum + v.view_count, 0);
  }

  // --- discovery ----------------------------------------------------------

  async searchAthletes(params: SearchParams): Promise<SearchResult> {
    return searchProfiles(readDb().profiles, params);
  }

  // --- recruiter lists ----------------------------------------------------

  async listLists(ownerId: string): Promise<RecruiterList[]> {
    const db = readDb();
    return db.recruiter_lists
      .filter((l) => l.owner_id === ownerId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((l) => withCount(db, l));
  }

  async getList(ownerId: string, listId: string): Promise<RecruiterListDetail | null> {
    const db = readDb();
    const list = db.recruiter_lists.find((l) => l.id === listId && l.owner_id === ownerId);
    if (!list) return null;
    const owner = db.profiles.find((p) => p.id === ownerId) ?? null;

    const members = db.recruiter_list_members
      .filter((m) => m.list_id === listId)
      .sort((a, b) => b.added_at.localeCompare(a.added_at))
      .flatMap((m) => {
        const profile = db.profiles.find((p) => p.id === m.profile_id);
        // A resume that went private since it was saved drops out of the list
        // view rather than leaking through it.
        if (!canViewProfile(profile, ownerId, owner)) return [];
        return [{ ...profile!, list_note: m.note, added_at: m.added_at }];
      });

    return { list: withCount(db, list), members };
  }

  async createList(ownerId: string, name: string, note: string | null): Promise<RecruiterList> {
    return mutate((db) => {
      if (db.recruiter_lists.some((l) => l.owner_id === ownerId && l.name === name)) {
        throw new DataError("conflict", "You already have a list with that name.");
      }
      const list: RecruiterListRow = {
        id: randomUUID(),
        owner_id: ownerId,
        name,
        note,
        created_at: now(),
        updated_at: now(),
      };
      db.recruiter_lists.push(list);
      return withCount(db, list);
    });
  }

  async deleteList(ownerId: string, listId: string): Promise<void> {
    await mutate((db) => {
      requireList(db, ownerId, listId);
      db.recruiter_lists = db.recruiter_lists.filter((l) => l.id !== listId);
      db.recruiter_list_members = db.recruiter_list_members.filter((m) => m.list_id !== listId);
    });
  }

  async addToList(ownerId: string, listId: string, profileId: string, note: string | null): Promise<void> {
    await mutate((db) => {
      const list = requireList(db, ownerId, listId);
      const target = db.profiles.find((p) => p.id === profileId);
      const owner = db.profiles.find((p) => p.id === ownerId) ?? null;
      if (!canViewProfile(target, ownerId, owner)) {
        throw new DataError("not_found", "That athlete's resume is not available.");
      }
      if (db.recruiter_list_members.some((m) => m.list_id === listId && m.profile_id === profileId)) return;
      db.recruiter_list_members.push({ list_id: listId, profile_id: profileId, note, added_at: now() });
      list.updated_at = now();
    });
  }

  async removeFromList(ownerId: string, listId: string, profileId: string): Promise<void> {
    await mutate((db) => {
      const list = requireList(db, ownerId, listId);
      db.recruiter_list_members = db.recruiter_list_members.filter(
        (m) => !(m.list_id === listId && m.profile_id === profileId),
      );
      list.updated_at = now();
    });
  }

  async listsContaining(ownerId: string, profileId: string): Promise<string[]> {
    const db = readDb();
    const mine = new Set(db.recruiter_lists.filter((l) => l.owner_id === ownerId).map((l) => l.id));
    return db.recruiter_list_members
      .filter((m) => m.profile_id === profileId && mine.has(m.list_id))
      .map((m) => m.list_id);
  }

  async listsContainingMany(ownerId: string, profileIds: string[]): Promise<Record<string, string[]>> {
    const db = readDb();
    const mine = new Set(db.recruiter_lists.filter((l) => l.owner_id === ownerId).map((l) => l.id));
    const out: Record<string, string[]> = Object.fromEntries(profileIds.map((id) => [id, []]));
    for (const m of db.recruiter_list_members) {
      if (mine.has(m.list_id) && m.profile_id in out) out[m.profile_id].push(m.list_id);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function newProfile(input: NewProfile): Profile {
  const at = now();
  return {
    id: input.id,
    handle: input.handle,
    account_kind: input.account_kind ?? "athlete",
    visibility: input.visibility ?? "public",
    display_name: input.display_name,
    title: null,
    avatar_url: null,
    cover_url: null,
    bio: null,
    location: null,
    hometown: null,
    level: input.level,
    primary_sport: input.primary_sport ?? null,
    grad_year: input.grad_year ?? null,
    height_cm: null,
    weight_kg: null,
    positions: [],
    jersey: null,
    region: null,
    school: null,
    gpa: null,
    sat_score: null,
    act_score: null,
    ncaa_id: null,
    contact_email: null,
    phone: null,
    is_recruitable: false,
    instagram: null,
    x_handle: null,
    hudl_url: null,
    results_url: null,
    entry_count: 0,
    verified_count: 0,
    identity_verified_at: null,
    suspended_at: null,
    created_at: at,
    updated_at: at,
  };
}

/** The `record_entries` view: an achievement joined to its evidence count. */
export function toEntry(db: Db, a: AchievementRow): RecordEntry {
  return {
    id: a.id,
    profile_id: a.profile_id,
    kind: a.kind,
    title: a.title,
    detail: a.detail,
    sport: a.sport,
    value_display: a.value_display,
    unit: a.unit,
    competition: a.competition,
    placement: a.placement,
    field_size: a.field_size,
    location: a.location,
    achieved_on: a.achieved_on,
    verification: a.verification,
    verified_at: a.verified_at,
    is_pinned: a.is_pinned,
    org_name: a.org_name,
    org_logo_url: null,
    event_name: a.event_name,
    evidence_count: db.evidence.filter((e) => e.achievement_id === a.id).length,
    verified_by: a.verification === "verified" ? verifiedBy(db, a.id) : null,
  };
}

/** record_entries.verified_by (0016): the newest verified decision's "Name, Role". */
function verifiedBy(db: Db, achievementId: string): string | null {
  const latest = db.verifications
    .filter((v) => v.achievement_id === achievementId && v.outcome === "verified")
    .sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
  if (!latest?.verifier_name) return null;
  return [latest.verifier_name, latest.verifier_role].filter(Boolean).join(", ");
}

function byPinnedThenDate(a: RecordEntry, b: RecordEntry): number {
  return Number(b.is_pinned) - Number(a.is_pinned) || b.achieved_on.localeCompare(a.achieved_on);
}

/** sync_record_counts(): recomputed by aggregate, never by delta. */
export function syncCounts(db: Db, profileId: string): void {
  const profile = db.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  const mine = db.achievements.filter((a) => a.profile_id === profileId);
  profile.entry_count = mine.length;
  profile.verified_count = mine.filter((a) => a.verification === "verified").length;
}

/** Only the `NewEntry` columns — a direct POST must not smuggle in `verification`. */
function pickEntryFields(patch: Partial<NewEntry>): Partial<NewEntry> {
  return Object.fromEntries(SUBSTANTIVE_ENTRY_FIELDS.filter((f) => patch[f] !== undefined).map((f) => [f, patch[f]]));
}

const RESPONSE_COPY = {
  used: "This link has already been used.",
  expired: "This link has expired. Ask the athlete to send a new one.",
  self: "You can't verify your own record.",
} as const;

function findByToken(db: Db, token: string): VerificationRequestRow | undefined {
  const hash = hashToken(token);
  return db.verification_requests.find((r) => r.token_hash === hash);
}

/** The row without its hash — what leaves the adapter. */
function publicRequest(row: VerificationRequestRow): VerificationRequest {
  const { token_hash: _hash, ...request } = row;
  void _hash;
  return request;
}

/** verification_request_payload(): the entry, and narrow slices of athlete and coach. */
function toDetail(db: Db, request: VerificationRequestRow): VerificationRequestDetail | null {
  const row = db.achievements.find((a) => a.id === request.achievement_id);
  const athlete = db.profiles.find((p) => p.id === request.profile_id);
  const coach = db.coach_contacts.find((c) => c.id === request.coach_contact_id);
  if (!row || !athlete || !coach) return null;
  return {
    ...publicRequest(request),
    entry: toEntry(db, row),
    athlete: {
      id: athlete.id,
      handle: athlete.handle,
      display_name: athlete.display_name,
      primary_sport: athlete.primary_sport,
      school: athlete.school,
      grad_year: athlete.grad_year,
    },
    coach: { id: coach.id, name: coach.name, role: coach.role, org_name: coach.org_name },
  };
}

function isSibling(db: Db, authority: VerificationRequestRow, other: VerificationRequestRow): boolean {
  const email = (id: string) => db.coach_contacts.find((c) => c.id === id)?.email ?? null;
  return canActForSibling(authority, other, {
    authority: email(authority.coach_contact_id),
    sibling: email(other.coach_contact_id),
  });
}

/** Supersedes every link still waiting on an answer for this entry. */
function expirePendingRequests(db: Db, achievementId: string): void {
  for (const r of db.verification_requests) {
    if (r.achievement_id === achievementId && r.status === "pending") r.status = "expired";
  }
}

function requireUser(db: Db, userId: string) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new DataError("not_found", "Account not found.");
  return user;
}

function requireProfile(db: Db, id: string): Profile {
  const profile = db.profiles.find((p) => p.id === id);
  if (!profile) throw new DataError("not_found", "Resume not found.");
  return profile;
}

function requireOwned<T extends { id: string; profile_id: string }>(
  rows: T[],
  id: string,
  profileId: string,
  noun: string,
): T {
  const row = rows.find((r) => r.id === id);
  // Not-found for both missing and not-mine: an owner check that answers
  // differently confirms the id exists.
  if (!row || row.profile_id !== profileId) throw new DataError("not_found", `That ${noun} was not found.`);
  return row;
}

function requireList(db: Db, ownerId: string, listId: string): RecruiterListRow {
  const list = db.recruiter_lists.find((l) => l.id === listId && l.owner_id === ownerId);
  if (!list) throw new DataError("not_found", "List not found.");
  return list;
}

function withCount(db: Db, list: RecruiterListRow): RecruiterList {
  return {
    ...list,
    member_count: db.recruiter_list_members.filter((m) => m.list_id === list.id).length,
  };
}
