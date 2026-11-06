import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AVATAR_EXTENSION, type AvatarType } from "@/lib/avatars";
import type { CoachContact, Database, FilmClip, Profile, RecordEntry } from "@/lib/database.types";
import { HANDLE_PATTERN, isReservedHandle } from "@/lib/handles";
import { absoluteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Repository } from "../repository";
import {
  CURRENT_PASSWORD_MISMATCH,
  DAILY_REPORT_CAP,
  DAILY_REQUEST_CAP,
  emailChangeError,
  ENTRY_WRITE_FIELDS,
  isRecentRecovery,
  isSubstantiveEntryChange,
  MAX_PINNED,
  newPasswordError,
  pickTopMark,
  REQUEST_TTL_DAYS,
  signUpError,
  SUBSTANTIVE_ENTRY_FIELDS,
  swapNeighbour,
} from "../rules";
import { generateToken, hashToken } from "../tokens";
import { clampPage, clampPageSize, normalizeSearchQuery } from "../search-query";
import {
  DataError,
  type AuthUser,
  type EmailChangeResult,
  type IndexablePage,
  type IssuedPasswordReset,
  type CoachPatch,
  type ListedAthlete,
  type MoveDirection,
  type NewCoach,
  type NewEntry,
  type NewFilm,
  type NewProfile,
  type NewProfileReport,
  type ProfileReport,
  type RecruiterList,
  type RecruiterListDetail,
  type SavedSearch,
  type SearchParams,
  type SearchResult,
  type CreatedVerificationRequest,
  type VerificationAnswerOptions,
  type VerificationRequest,
  type VerificationRequestDetail,
  type VerificationResponse,
  type TopMark,
  type ViewerSummary,
} from "../types";

type Client = SupabaseClient<Database>;


/**
 * A write's outcome, made loud. PostgREST reports an RLS refusal or a stale
 * id as zero rows affected with no error, so "nothing happened" has to be
 * checked explicitly or a failed delete looks exactly like a successful one.
 */
function requireAffected(
  result: { error: { message: string } | null; count: number | null },
  noun: string,
): void {
  if (result.error) throw new DataError("unavailable", `Could not save the ${noun}. Try again.`);
  if (result.count === 0) throw new DataError("not_found", `That ${noun} was not found.`);
}

/** A recruiter_lists row with its member count embedded (PostgREST aggregate). */
type ListRow = Omit<RecruiterList, "member_count"> & { recruiter_list_members: { count: number }[] };

const LIST_COLUMNS = "id,owner_id,name,note,created_at,updated_at,recruiter_list_members(count)";

function toList(row: ListRow): RecruiterList {
  const { recruiter_list_members: members, ...list } = row;
  return { ...list, member_count: members[0]?.count ?? 0 };
}

/** Supabase Storage bucket for avatars (0019). Objects live under `<profile id>/`. */
const AVATAR_BUCKET = "avatars";

/** PostgREST's default `max-rows`: a longer range comes back silently short. */
const POSTGREST_MAX_ROWS = 1000;

const LIST_CONFLICT = "You already have a list with that name.";

const SAVED_SEARCH_COLUMNS = "id,owner_id,name,query,digest,created_at,updated_at";

/** Every readable column of verification_requests — `select *` is refused (0017). */
const REQUEST_COLUMNS =
  "id,achievement_id,profile_id,coach_contact_id,status,note,verifier_name,verifier_role,flagged_unknown_athlete,created_at,responded_at,expires_at";

/**
 * A refusal from the 0017 functions, mapped to the copy the local adapter
 * uses for the same case. The SQLSTATEs are documented in the migration.
 */
function requestError(error: { code?: string; message: string }, fallback: string): DataError {
  switch (error.code) {
    case "RS403":
      return /verify itself/.test(error.message)
        ? new DataError("forbidden", "You can't verify your own record.")
        : new DataError("forbidden", "Sign in to do that.");
    case "RS404":
      return new DataError("not_found", "That verification link is not valid.");
    case "RS409":
      return new DataError("forbidden", "This link has already been used.");
    case "RS410":
      return new DataError("forbidden", "This link has expired. Ask the athlete to send a new one.");
    case "RS429":
      return new DataError(
        "rate_limited",
        `You can send ${DAILY_REQUEST_CAP} verification requests a day. Try again tomorrow.`,
      );
    case "22023":
      return new DataError("invalid", "Check your name, role, and note.");
    default:
      return new DataError("unavailable", fallback);
  }
}

/**
 * The Supabase adapter. Authorization is RLS: every query runs as the
 * signed-in user, so this class passes the viewer's context implicitly and
 * only adds the `.eq("profile_id", …)` filters that make a stale form fail
 * loudly rather than silently write nothing.
 *
 * Status: compiles against the hand-written types; NOT exercised against a
 * live project during the local-mode build. The by-link verification flow
 * runs on the 0017 functions, featured film and search on 0018;
 * supabase/tests covers them against Postgres. Account deletion needs
 * SUPABASE_SERVICE_ROLE_KEY (see supabase/admin.ts).
 */
export class SupabaseRepository implements Repository {
  constructor(private readonly client: Client) {}

  // --- accounts (session is Supabase's; see data/auth.ts) -----------------

  async signUp(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    // Mapped, never passed through: the raw text says which emails exist.
    if (error) throw signUpError(error);
    if (!data.user) throw new DataError("unavailable", "Could not create your account. Try again.");
    // With confirmation on, a taken email comes back as a user with no
    // identities and no session — Supabase's own non-enumerating answer.
    // It reads as "check your email" here too, which is the point.
    return { id: data.user.id, email: data.user.email ?? email };
  }

  async signIn(email: string, password: string): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? email };
  }

  async getUser(): Promise<AuthUser | null> {
    const { data } = await this.client.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
  }

  async updateEmail(_userId: string, email: string): Promise<EmailChangeResult> {
    // The confirmation link lands back in Settings through the callback.
    const { data, error } = await this.client.auth.updateUser(
      { email },
      { emailRedirectTo: absoluteUrl("/auth/callback?next=/settings") },
    );
    if (error) throw emailChangeError(error);
    // Until the new address clicks its link, `email` is still the old one
    // and `new_email` holds the request. A project with confirmation off
    // swaps immediately.
    return data.user?.email?.toLowerCase() === email.trim().toLowerCase() ? "updated" : "pending";
  }

  async updatePassword(_userId: string, current: string, next: string): Promise<void> {
    // #28: a session alone is not enough to change the password — a borrowed
    // laptop would be. Re-authenticate with the current one first. A success
    // replaces this device's session with a fresh one for the same user.
    const { data: me } = await this.client.auth.getUser();
    if (!me.user?.email) throw new DataError("forbidden", "Sign in to do that.");
    const check = await this.client.auth.signInWithPassword({ email: me.user.email, password: current });
    if (check.error || check.data.user?.id !== me.user.id) {
      if (check.error?.status === 429) throw newPasswordError(check.error);
      throw new DataError("forbidden", CURRENT_PASSWORD_MISMATCH);
    }

    const { error } = await this.client.auth.updateUser({ password: next });
    if (error) throw newPasswordError(error);
    // Revoke every other device's refresh token; this one stays signed in.
    await this.client.auth.signOut({ scope: "others" });
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<IssuedPasswordReset | null> {
    // Supabase mails the link itself. Its answer is the same for known and
    // unknown addresses; a rate limit is the one refusal worth surfacing.
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    if (error && error.status === 429) {
      throw new DataError("rate_limited", "Too many reset requests. Wait a few minutes and try again.");
    }
    if (error) console.error(`[auth] resetPasswordForEmail failed (${error.status ?? "?"}): ${error.code ?? ""}`);
    return null;
  }

  async canResetPassword(): Promise<boolean> {
    // The link's code was exchanged in /auth/callback; what remains is a
    // session whose verified claims say it came from recovery.
    const { data, error } = await this.client.auth.getClaims();
    if (error || !data) return false;
    return isRecentRecovery(data.claims.amr);
  }

  async resetPassword(_token: string | null, next: string): Promise<AuthUser> {
    if (!(await this.canResetPassword())) {
      throw new DataError("forbidden", "This reset link has expired or was already used. Request a new one.");
    }
    const { data, error } = await this.client.auth.updateUser({ password: next });
    if (error || !data.user) throw newPasswordError(error ?? {});
    const user = { id: data.user.id, email: data.user.email ?? "" };

    // Every other session goes. This one is swapped for a password session,
    // so the recovery session cannot be used for a second reset.
    await this.client.auth.signOut({ scope: "others" });
    if (user.email) await this.client.auth.signInWithPassword({ email: user.email, password: next });
    return user;
  }

  async deleteAccount(userId: string): Promise<void> {
    // The admin client acts for nobody, so confirm with the user's own
    // session that the account being deleted is the one signed in.
    const { data } = await this.client.auth.getUser();
    if (!data.user || data.user.id !== userId) throw new DataError("forbidden", "Sign in to do that.");

    const admin = createAdminClient();
    if (!admin) {
      throw new DataError(
        "unavailable",
        "Account deletion isn't available on this server right now. Email support and we'll remove it for you.",
      );
    }
    // Storage is not part of the cascade: clear the avatar prefix first, as
    // the user, while their session still satisfies the owner policy.
    await this.removeAvatarObjects(userId).catch(() => undefined);
    // auth.users → profiles cascades (0002), and from profiles to everything
    // the account owns: entries, film, references, requests, lists.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`[auth] deleteUser failed (${error.status ?? "?"}): ${error.code ?? error.message}`);
      throw new DataError("unavailable", "Could not delete the account. Try again.");
    }
  }

  // --- profiles -----------------------------------------------------------

  async getProfileById(id: string): Promise<Profile | null> {
    const { data } = await this.client.from("profiles").select("*").eq("id", id).maybeSingle<Profile>();
    return data ?? null;
  }

  async getProfileByHandle(handle: string): Promise<Profile | null> {
    const { data } = await this.client.from("profiles").select("*").eq("handle", handle).maybeSingle<Profile>();
    return data ?? null;
  }

  async isHandleAvailable(handle: string): Promise<boolean> {
    // The app-side list is newer than the migration's (see handles.ts), so
    // check it here rather than trusting the insert trigger alone.
    const h = handle.toLowerCase();
    if (!HANDLE_PATTERN.test(h) || isReservedHandle(h)) return false;
    const { data } = await this.client.from("profiles").select("id").eq("handle", h).maybeSingle();
    return !data;
  }

  async createProfile(input: NewProfile): Promise<Profile> {
    if (isReservedHandle(input.handle)) throw new DataError("invalid", "That handle is reserved.");
    const { data, error } = await this.client.from("profiles").insert(input).select("*").single<Profile>();
    if (error) {
      if (error.code === "23505") throw new DataError("conflict", "That handle is taken.");
      if (error.code === "23514") throw new DataError("invalid", "That handle is reserved.");
      throw new DataError("invalid", "Could not create your resume.");
    }
    return data;
  }

  async updateProfile(id: string, patch: Partial<Profile>): Promise<Profile> {
    const { data, error } = await this.client.from("profiles").update(patch).eq("id", id).select("*").single<Profile>();
    if (error) throw new DataError("invalid", "Could not save.");
    return data;
  }

  async setAvatar(profileId: string, bytes: Uint8Array, type: AvatarType): Promise<Profile> {
    const storage = this.client.storage.from(AVATAR_BUCKET);
    // A new name per upload: the public URL is cached hard (and by the image
    // optimizer), so replacing an object in place would show the old face.
    const objectPath = `${profileId}/avatar-${Date.now().toString(36)}.${AVATAR_EXTENSION[type]}`;
    const { error } = await storage.upload(objectPath, bytes, {
      contentType: type,
      cacheControl: "31536000",
      upsert: false,
    });
    // The owner-prefix policy (0019) refuses any path outside the caller's own folder.
    if (error) throw new DataError("unavailable", "Could not upload the photo. Try again.");

    const { data } = storage.getPublicUrl(objectPath);
    const profile = await this.updateProfile(profileId, { avatar_url: data.publicUrl });
    await this.removeAvatarObjects(profileId, objectPath).catch(() => undefined);
    return profile;
  }

  async removeAvatar(profileId: string): Promise<Profile> {
    const profile = await this.updateProfile(profileId, { avatar_url: null });
    await this.removeAvatarObjects(profileId).catch(() => undefined);
    return profile;
  }

  /** Deletes the profile's stored avatars, except `keep`. Best effort: an orphaned file is harmless. */
  private async removeAvatarObjects(profileId: string, keep: string | null = null): Promise<void> {
    const storage = this.client.storage.from(AVATAR_BUCKET);
    const { data } = await storage.list(profileId, { limit: 100 });
    const stale = (data ?? []).map((f) => `${profileId}/${f.name}`).filter((p) => p !== keep);
    if (stale.length > 0) await storage.remove(stale);
  }

  // --- the record ---------------------------------------------------------

  async listEntries(profileId: string): Promise<RecordEntry[]> {
    const { data } = await this.client
      .from("record_entries")
      .select("*")
      .eq("profile_id", profileId)
      .order("is_pinned", { ascending: false })
      .order("achieved_on", { ascending: false })
      .returns<RecordEntry[]>();
    return data ?? [];
  }

  async addEntry(profileId: string, input: NewEntry): Promise<RecordEntry> {
    // Same default as the local adapter: an entry with no sport of its own
    // belongs to the athlete's primary sport, not to none.
    let sport = input.sport ?? null;
    if (!sport) {
      const { data: profile } = await this.client
        .from("profiles")
        .select("primary_sport")
        .eq("id", profileId)
        .maybeSingle<Pick<Profile, "primary_sport">>();
      sport = profile?.primary_sport ?? null;
    }
    // measured_has_unit (0003): a number without a unit is no measurement.
    const measured = input.unit ? { value_numeric: input.value_numeric ?? null, unit: input.unit } : { value_numeric: null, unit: null };
    const { data, error } = await this.client
      .from("achievements")
      .insert({ profile_id: profileId, ...input, ...measured, sport })
      .select("id")
      .single();
    if (error || !data) {
      if (error?.code === "23514") throw new DataError("invalid", "Check the date and placement — one of them is out of range.");
      throw new DataError("invalid", "Could not add the entry.");
    }
    const { data: entry } = await this.client.from("record_entries").select("*").eq("id", data.id).single<RecordEntry>();
    return entry!;
  }

  async updateEntry(profileId: string, entryId: string, patch: Partial<NewEntry>): Promise<RecordEntry> {
    const { data: current, error: readError } = await this.client
      .from("achievements")
      .select(SUBSTANTIVE_ENTRY_FIELDS.join(","))
      .eq("id", entryId)
      .eq("profile_id", profileId)
      .maybeSingle<Partial<Record<(typeof SUBSTANTIVE_ENTRY_FIELDS)[number], unknown>>>();
    if (readError) throw new DataError("unavailable", "Could not save the entry. Try again.");
    if (!current) throw new DataError("not_found", "That entry was not found.");

    const fields = Object.fromEntries(
      ENTRY_WRITE_FIELDS.filter((f) => patch[f] !== undefined).map((f) => [f, patch[f]]),
    ) as Partial<NewEntry>;
    if (patch.unit !== undefined && !patch.unit) fields.value_numeric = null;
    // Same rule as the local adapter: a coach vouched for the old values.
    // Any link still out is expired by achievements_expire_requests (0017)
    // when the reset lands.
    const reset = isSubstantiveEntryChange(current, patch) ? { verification: "unverified" as const, verified_at: null } : {};

    const result = await this.client
      .from("achievements")
      .update({ ...fields, ...reset }, { count: "exact" })
      .eq("id", entryId)
      .eq("profile_id", profileId);
    if (result.error?.code === "23514") {
      throw new DataError("invalid", "Check the date and placement — one of them is out of range.");
    }
    requireAffected(result, "entry");

    const { data } = await this.client.from("record_entries").select("*").eq("id", entryId).single<RecordEntry>();
    if (!data) throw new DataError("not_found", "That entry was not found.");
    return data;
  }

  async deleteEntry(profileId: string, entryId: string): Promise<void> {
    requireAffected(
      await this.client.from("achievements").delete({ count: "exact" }).eq("id", entryId).eq("profile_id", profileId),
      "entry",
    );
  }

  async setPinned(profileId: string, entryId: string, isPinned: boolean): Promise<void> {
    if (isPinned) {
      const { count, error } = await this.client
        .from("achievements")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("is_pinned", true)
        .neq("id", entryId);
      if (error) throw new DataError("unavailable", "Could not save the entry. Try again.");
      if ((count ?? 0) >= MAX_PINNED) {
        throw new DataError("invalid", `You can pin up to ${MAX_PINNED} entries. Unpin one first.`);
      }
    }
    requireAffected(
      await this.client
        .from("achievements")
        .update({ is_pinned: isPinned }, { count: "exact" })
        .eq("id", entryId)
        .eq("profile_id", profileId),
      "entry",
    );
  }

  // --- film ---------------------------------------------------------------

  async listFilm(profileId: string): Promise<FilmClip[]> {
    const { data } = await this.client
      .from("film_clips")
      .select("*")
      .eq("profile_id", profileId)
      .order("is_featured", { ascending: false })
      .order("position")
      .order("created_at")
      .returns<FilmClip[]>();
    return data ?? [];
  }

  async addFilm(profileId: string, input: NewFilm): Promise<FilmClip> {
    // provider, external_id, and thumbnail_url are derived by the
    // parse_film_url trigger (0018), as the local adapter derives them.
    const { data, error } = await this.client
      .from("film_clips")
      .insert({ profile_id: profileId, ...input })
      .select("*")
      .single<FilmClip>();
    if (error) throw new DataError("invalid", "Could not add the clip.");
    return data;
  }

  async updateFilm(profileId: string, clipId: string, input: NewFilm): Promise<FilmClip> {
    // A changed url re-runs parse_film_url (`update of url`, 0007).
    const { data, error } = await this.client
      .from("film_clips")
      .update({ title: input.title, url: input.url, season: input.season })
      .eq("id", clipId)
      .eq("profile_id", profileId)
      .select("*")
      .maybeSingle<FilmClip>();
    if (error) throw new DataError("invalid", "Could not save the clip.");
    if (!data) throw new DataError("not_found", "That clip was not found.");
    return data;
  }

  async moveFilm(profileId: string, clipId: string, direction: MoveDirection): Promise<void> {
    // No unique index on position (0004), so a renumber is a few plain
    // UPDATEs; only rows whose position changes are written. RLS keeps
    // every write to the owner's rows.
    const { data, error } = await this.client
      .from("film_clips")
      .select("id,position")
      .eq("profile_id", profileId)
      .order("position")
      .order("created_at")
      .returns<Pick<FilmClip, "id" | "position">[]>();
    if (error) throw new DataError("unavailable", "Could not reorder the clips. Try again.");
    const rows = data ?? [];
    if (!rows.some((r) => r.id === clipId)) throw new DataError("not_found", "That clip was not found.");
    const order = swapNeighbour(rows.map((r) => r.id), clipId, direction);
    for (const row of rows) {
      const position = order.indexOf(row.id);
      if (row.position === position) continue;
      const result = await this.client
        .from("film_clips")
        .update({ position }, { count: "exact" })
        .eq("id", row.id)
        .eq("profile_id", profileId);
      requireAffected(result, "clip");
    }
  }

  async deleteFilm(profileId: string, clipId: string): Promise<void> {
    requireAffected(
      await this.client.from("film_clips").delete({ count: "exact" }).eq("id", clipId).eq("profile_id", profileId),
      "clip",
    );
  }

  async featureFilm(_profileId: string, clipId: string): Promise<void> {
    // One transaction (0018): the old two-UPDATE version could leave the
    // athlete with nothing featured if the second write failed. The function
    // checks ownership against the JWT, not the id passed in.
    const { error } = await this.client.rpc("feature_film", { clip: clipId });
    if (!error) return;
    if (error.code === "RS404") throw new DataError("not_found", "That clip was not found.");
    if (error.code === "RS403") throw new DataError("forbidden", "Sign in to do that.");
    throw new DataError("unavailable", "Could not feature the clip. Try again.");
  }

  // --- references (RLS strips rows the viewer may not see) ----------------

  async listCoaches(profileId: string): Promise<CoachContact[]> {
    const { data } = await this.client
      .from("coach_contacts")
      .select("*")
      .eq("profile_id", profileId)
      .order("position")
      .order("created_at")
      .returns<CoachContact[]>();
    return data ?? [];
  }

  async addCoach(profileId: string, input: NewCoach): Promise<CoachContact> {
    const { data, error } = await this.client
      .from("coach_contacts")
      .insert({ profile_id: profileId, ...input })
      .select("*")
      .single<CoachContact>();
    if (error) throw new DataError("invalid", "Could not add the reference.");
    return data;
  }

  async updateCoach(profileId: string, coachId: string, patch: CoachPatch): Promise<CoachContact> {
    const fields = Object.fromEntries(
      (["name", "role", "org_name", "email", "phone", "is_visible"] as const)
        .filter((f) => patch[f] !== undefined)
        .map((f) => [f, patch[f]]),
    ) as CoachPatch;
    const { data, error } = await this.client
      .from("coach_contacts")
      .update(fields)
      .eq("id", coachId)
      .eq("profile_id", profileId)
      .select("*")
      .maybeSingle<CoachContact>();
    if (error) throw new DataError("invalid", "Could not save the reference.");
    if (!data) throw new DataError("not_found", "That reference was not found.");
    return data;
  }

  async deleteCoach(profileId: string, coachId: string): Promise<void> {
    requireAffected(
      await this.client.from("coach_contacts").delete({ count: "exact" }).eq("id", coachId).eq("profile_id", profileId),
      "reference",
    );
  }

  // --- verification (0017; the raw token never reaches a table) ----------

  async requestVerification(
    _profileId: string,
    achievementId: string,
    coachContactId: string,
  ): Promise<CreatedVerificationRequest> {
    // Minted here, hashed before it leaves the process. The function owns
    // ownership, the cap, superseding, and marking the entry submitted.
    const token = generateToken();
    const { data, error } = await this.client.rpc("create_verification_request", {
      p_achievement: achievementId,
      p_coach_contact: coachContactId,
      p_token_hash: hashToken(token),
      p_expires_at: new Date(Date.now() + REQUEST_TTL_DAYS * 86_400_000).toISOString(),
    });
    if (error || !data) {
      if (error?.code === "RS404") throw new DataError("not_found", "That entry or reference was not found.");
      throw requestError(error ?? { message: "" }, "Could not create the request. Try again.");
    }
    return { ...(data as unknown as VerificationRequest), token };
  }

  async getVerificationRequest(token: string): Promise<VerificationRequestDetail | null> {
    const { data, error } = await this.client.rpc("get_verification_request", { p_token: token });
    if (error) throw requestError(error, "Could not open this link. Try again.");
    return (data as unknown as VerificationRequestDetail | null) ?? null;
  }

  async getCoachBatchRequests(token: string): Promise<VerificationRequestDetail[]> {
    const { data, error } = await this.client.rpc("get_coach_batch_requests", { p_token: token });
    // The batch is a convenience on a page that already rendered; a failure
    // hides it rather than taking the page down.
    if (error) return [];
    return (data as unknown as VerificationRequestDetail[] | null) ?? [];
  }

  async respondToVerification(
    token: string,
    outcome: "verified" | "disputed",
    note: string | null,
    verifier: { name: string; role: string | null },
    _responderUserId: string | null,
    options: VerificationAnswerOptions = {},
  ): Promise<VerificationResponse> {
    // The responder is whoever the client's JWT says; the function refuses
    // the athlete's own session itself, so the id passed in is not trusted.
    const { data, error } = await this.client.rpc("respond_verification", {
      p_token: token,
      p_outcome: outcome,
      p_note: note,
      p_verifier_name: verifier.name,
      p_verifier_role: verifier.role,
      p_flag_unknown: options.flagUnknownAthlete === true,
      p_request_id: options.requestId ?? null,
    });
    if (error || !data) throw requestError(error ?? { message: "" }, "Could not record your answer. Try again.");
    const row = data as {
      request_id: string;
      handle: string;
      display_name: string;
      contact_email: string | null;
      entry_title: string;
      outcome: "verified" | "disputed";
      flagged_unknown_athlete: boolean;
    };
    return {
      requestId: row.request_id,
      handle: row.handle,
      outcome: row.outcome,
      flaggedUnknownAthlete: row.flagged_unknown_athlete,
      athleteName: row.display_name,
      athleteEmail: row.contact_email,
      entryTitle: row.entry_title,
    };
  }

  async listVerificationRequests(profileId: string): Promise<VerificationRequest[]> {
    const { data } = await this.client
      .from("verification_requests")
      .select(REQUEST_COLUMNS)
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .returns<VerificationRequest[]>();
    return data ?? [];
  }

  async revokeVerificationRequest(_profileId: string, requestId: string): Promise<void> {
    const { error } = await this.client.rpc("revoke_verification_request", { p_request_id: requestId });
    if (!error) return;
    if (error.code === "RS409") throw new DataError("conflict", "That request has already been answered or closed.");
    if (error.code === "RS404") throw new DataError("not_found", "That request was not found.");
    throw requestError(error, "Could not revoke the request. Try again.");
  }

  // --- signals ------------------------------------------------------------

  async recordView(profileId: string): Promise<void> {
    // Awaited: a PostgREST builder is lazy and sends nothing until it is
    // awaited, so the old `void rpc(…)` never reached the database. The page
    // schedules this with `after()`, which keeps it off the render path.
    const { error } = await this.client.rpc("record_profile_view", { target: profileId });
    if (error) throw new DataError("unavailable", `Could not record the view: ${error.message}`);
  }

  async weeklyViews(profileId: string): Promise<number> {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const { data } = await this.client
      .from("profile_views")
      .select("view_count")
      .eq("profile_id", profileId)
      .gte("viewed_on", since);
    return (data ?? []).reduce((sum, row) => sum + row.view_count, 0);
  }

  async viewerSummary(): Promise<ViewerSummary> {
    // Definer function (0020): a viewer's account kind is behind their own
    // profile's visibility, so the join cannot run as the athlete. It reads
    // auth.uid() and returns counts only.
    const { data, error } = await this.client.rpc("weekly_viewer_summary");
    if (error || !data) return { recruiters: 0, coaches: 0 };
    const row = data as Partial<ViewerSummary>;
    return { recruiters: Number(row.recruiters ?? 0), coaches: Number(row.coaches ?? 0) };
  }

  // --- discovery ----------------------------------------------------------

  async searchAthletes(params: SearchParams): Promise<SearchResult> {
    const pageSize = clampPageSize(params.pageSize);
    const q = normalizeSearchQuery(params.q);
    const position = params.position?.trim();
    const args = {
      // Raw: search_athletes escapes % and _ itself (0018) and needs the
      // unescaped text for its similarity ranking.
      q,
      sport: params.sport ?? null,
      levels: params.level ? [params.level] : null,
      grad_years: params.gradYear ? [params.gradYear] : null,
      regions: params.region ? [params.region.toUpperCase()] : null,
      athlete_positions: position ? [position] : null,
      verified_only: params.verifiedOnly ?? false,
      min_gpa: params.minGpa ?? null,
      sort_by: params.sort ?? "verified_count",
    };
    // Prefer: count=exact on the page request itself. `head: true` is a 400
    // on PostgREST RPCs (empty body + HEAD), which made / and /search 500.
    const fetchPage = (page: number) =>
      this.client.rpc(
        "search_athletes",
        { ...args, page_size: pageSize, page_offset: (page - 1) * pageSize },
        { count: "exact" },
      );

    const requested = Math.max(Math.trunc(params.page ?? 1) || 1, 1);
    // A page past the end is refetched clamped, which only costs a second
    // trip on a stale link.
    const first = await fetchPage(requested);
    if (first.error) throw new DataError("unavailable", "Search is unavailable right now.");

    const total = first.count ?? 0;
    const page = clampPage(requested, total, pageSize);
    const { data, error } = page === requested ? first : await fetchPage(page);
    if (error) throw new DataError("unavailable", "Search is unavailable right now.");
    return { athletes: data ?? [], total, page, pageSize };
  }

  async listIndexableProfiles(offset: number, limit: number): Promise<IndexablePage> {
    // The same rule as search_athletes' listing (and isListed()), as plain
    // filters: profiles_select already hides everything but public and
    // unlisted rows from anon, so this only narrows further.
    const page = (from: number, to: number, count: boolean) =>
      this.client
        .from("profiles")
        .select("handle,updated_at", count ? { count: "exact" } : undefined)
        .eq("account_kind", "athlete")
        .eq("visibility", "public")
        .is("suspended_at", null)
        .gt("entry_count", 0)
        .order("handle", { ascending: true })
        .range(from, to)
        .returns<IndexablePage["profiles"]>();

    const profiles: IndexablePage["profiles"] = [];
    let total = 0;
    // In chunks of PostgREST's row cap, so a sitemap shard larger than it
    // still comes back whole.
    for (let from = offset; from < offset + limit; from += POSTGREST_MAX_ROWS) {
      const to = Math.min(from + POSTGREST_MAX_ROWS, offset + limit) - 1;
      const { data, error, count } = await page(from, to, from === offset);
      if (error) throw new DataError("unavailable", "Could not list profiles.");
      if (from === offset) total = count ?? 0;
      profiles.push(...(data ?? []));
      if ((data?.length ?? 0) < to - from + 1) break;
    }
    return { profiles, total };
  }

  async topVerifiedMarks(profileIds: string[]): Promise<Record<string, TopMark>> {
    const out: Record<string, TopMark> = {};
    if (profileIds.length === 0) return out;
    const { data, error } = await this.client
      .from("record_entries")
      .select("profile_id,title,value_display,unit,verification,is_pinned,verified_at")
      .in("profile_id", profileIds)
      .eq("verification", "verified")
      .returns<(Pick<RecordEntry, "profile_id" | "title" | "value_display" | "unit" | "verification" | "is_pinned" | "verified_at">)[]>();
    // A decoration on search rows: a failed read shows rows without a mark.
    if (error) return out;
    const byProfile = new Map<string, NonNullable<typeof data>>();
    for (const e of data ?? []) byProfile.set(e.profile_id, [...(byProfile.get(e.profile_id) ?? []), e]);
    for (const [id, rows] of byProfile) {
      const top = pickTopMark(rows);
      if (top) out[id] = top;
    }
    return out;
  }

  // --- recruiter lists ----------------------------------------------------
  // RLS (0006) is the authorization: every row is the owner's or invisible,
  // and a member insert re-checks can_view_profile(). The owner filters here
  // make a stale id fail as not-found instead of silently matching nothing.

  async listLists(ownerId: string): Promise<RecruiterList[]> {
    const { data, error } = await this.client
      .from("recruiter_lists")
      .select(LIST_COLUMNS)
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false })
      .returns<ListRow[]>();
    if (error) throw new DataError("unavailable", "Could not load your lists. Try again.");
    return (data ?? []).map(toList);
  }

  async getList(ownerId: string, listId: string): Promise<RecruiterListDetail | null> {
    const { data: row, error } = await this.client
      .from("recruiter_lists")
      .select(LIST_COLUMNS)
      .eq("id", listId)
      .eq("owner_id", ownerId)
      .maybeSingle<ListRow>();
    if (error) throw new DataError("unavailable", "Could not load the list. Try again.");
    if (!row) return null;

    const { data: rows, error: membersError } = await this.client
      .from("recruiter_list_members")
      .select("note,added_at,profile:profiles(*)")
      .eq("list_id", listId)
      .order("added_at", { ascending: false })
      .returns<{ note: string | null; added_at: string; profile: Profile | null }[]>();
    if (membersError) throw new DataError("unavailable", "Could not load the list. Try again.");

    // A resume that went private since it was saved embeds as null under
    // RLS and drops out, exactly as the local adapter filters it.
    const members: ListedAthlete[] = (rows ?? []).flatMap((m) =>
      m.profile ? [{ ...m.profile, list_note: m.note, added_at: m.added_at }] : [],
    );
    return { list: toList(row), members };
  }

  async createList(ownerId: string, name: string, note: string | null): Promise<RecruiterList> {
    const { data, error } = await this.client
      .from("recruiter_lists")
      .insert({ owner_id: ownerId, name, note })
      .select("id,owner_id,name,note,created_at,updated_at")
      .single<Omit<RecruiterList, "member_count">>();
    if (error) {
      if (error.code === "23505") throw new DataError("conflict", LIST_CONFLICT);
      throw new DataError("unavailable", "Could not create the list. Try again.");
    }
    return { ...data, member_count: 0 };
  }

  async renameList(ownerId: string, listId: string, name: string): Promise<RecruiterList> {
    const { data, error } = await this.client
      .from("recruiter_lists")
      .update({ name })
      .eq("id", listId)
      .eq("owner_id", ownerId)
      .select(LIST_COLUMNS)
      .maybeSingle<ListRow>();
    if (error) {
      if (error.code === "23505") throw new DataError("conflict", LIST_CONFLICT);
      throw new DataError("unavailable", "Could not rename the list. Try again.");
    }
    if (!data) throw new DataError("not_found", "List not found.");
    return toList(data);
  }

  async deleteList(ownerId: string, listId: string): Promise<void> {
    // Members go with it: list_id cascades (0005).
    const result = await this.client
      .from("recruiter_lists")
      .delete({ count: "exact" })
      .eq("id", listId)
      .eq("owner_id", ownerId);
    if (result.error) throw new DataError("unavailable", "Could not delete the list. Try again.");
    if (result.count === 0) throw new DataError("not_found", "List not found.");
  }

  async addToList(ownerId: string, listId: string, profileId: string, note: string | null): Promise<void> {
    await this.requireList(ownerId, listId);
    // ON CONFLICT DO NOTHING: saving someone twice is a no-op, as locally.
    const { error } = await this.client
      .from("recruiter_list_members")
      .upsert({ list_id: listId, profile_id: profileId, note }, { onConflict: "list_id,profile_id", ignoreDuplicates: true });
    if (error) {
      // 42501: the with-check's can_view_profile() refused; 23503: no such profile.
      if (error.code === "42501" || error.code === "23503") {
        throw new DataError("not_found", "That athlete's resume is not available.");
      }
      throw new DataError("unavailable", "Could not save to the list. Try again.");
    }
    await this.touchList(listId);
  }

  async removeFromList(ownerId: string, listId: string, profileId: string): Promise<void> {
    await this.requireList(ownerId, listId);
    const { error } = await this.client
      .from("recruiter_list_members")
      .delete()
      .eq("list_id", listId)
      .eq("profile_id", profileId);
    if (error) throw new DataError("unavailable", "Could not update the list. Try again.");
    await this.touchList(listId);
  }

  async setListNote(ownerId: string, listId: string, profileId: string, note: string | null): Promise<void> {
    await this.requireList(ownerId, listId);
    const result = await this.client
      .from("recruiter_list_members")
      .update({ note }, { count: "exact" })
      .eq("list_id", listId)
      .eq("profile_id", profileId);
    if (result.error) throw new DataError("unavailable", "Could not save the note. Try again.");
    if (result.count === 0) throw new DataError("not_found", "That athlete is not on this list.");
    await this.touchList(listId);
  }

  async moveListMember(ownerId: string, fromListId: string, toListId: string, profileId: string): Promise<void> {
    if (fromListId === toListId) return;
    await Promise.all([this.requireList(ownerId, fromListId), this.requireList(ownerId, toListId)]);
    const { data: member, error } = await this.client
      .from("recruiter_list_members")
      .select("note")
      .eq("list_id", fromListId)
      .eq("profile_id", profileId)
      .maybeSingle<{ note: string | null }>();
    if (error) throw new DataError("unavailable", "Could not move the athlete. Try again.");
    if (!member) throw new DataError("not_found", "That athlete is not on this list.");
    // Insert before delete: a failure in between leaves the athlete on both
    // lists, never on neither. Already on the target is a no-op insert.
    await this.addToList(ownerId, toListId, profileId, member.note);
    await this.removeFromList(ownerId, fromListId, profileId);
  }

  async listsContaining(ownerId: string, profileId: string): Promise<string[]> {
    return (await this.listsContainingMany(ownerId, [profileId]))[profileId] ?? [];
  }

  async listsContainingMany(ownerId: string, profileIds: string[]): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = Object.fromEntries(profileIds.map((id) => [id, []]));
    if (profileIds.length === 0) return out;
    // The inner join pins the owner explicitly; RLS would hide other
    // owners' rows anyway.
    const { data, error } = await this.client
      .from("recruiter_list_members")
      .select("list_id,profile_id,recruiter_lists!inner(owner_id)")
      .eq("recruiter_lists.owner_id", ownerId)
      .in("profile_id", profileIds)
      .returns<{ list_id: string; profile_id: string }[]>();
    // A decoration on search rows; a failed read shows "not saved" rather
    // than taking the page down.
    if (error) return out;
    for (const m of data ?? []) out[m.profile_id]?.push(m.list_id);
    return out;
  }

  // --- moderation (0021; definer functions, staff-only reads) ---------------

  async reportProfile(profileId: string, _reporterId: string | null, report: NewProfileReport): Promise<void> {
    // The function takes the reporter from auth.uid(), never from the caller.
    const { error } = await this.client.rpc("report_profile", {
      p_profile: profileId,
      p_reason: report.reason,
      p_detail: report.detail,
    });
    if (!error) return;
    if (error.code === "RS404") throw new DataError("not_found", "That resume was not found.");
    if (error.code === "RS429") {
      throw new DataError("rate_limited", `You can send ${DAILY_REPORT_CAP} reports a day. Try again tomorrow.`);
    }
    throw new DataError("unavailable", "Could not send the report. Try again.");
  }

  async listProfileReports(): Promise<ProfileReport[]> {
    // RLS: profile_reports_select_staff. A non-staff caller reads zero rows,
    // which would look like "no reports" — so ask first, and say so.
    const { data: staff } = await this.client.rpc("is_staff");
    if (!staff) throw new DataError("forbidden", "Staff only.");
    const { data, error } = await this.client
      .from("profile_reports")
      .select("id, profile_id, reporter_id, reason, detail, status, created_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new DataError("unavailable", "Could not load reports.");
    return (data ?? []) as ProfileReport[];
  }

  async setProfileSuspended(_actorId: string, profileId: string, suspended: boolean): Promise<Profile> {
    const { data, error } = await this.client.rpc("set_profile_suspension", { p_profile: profileId, p_suspend: suspended });
    if (error || !data) {
      if (error?.code === "RS403") throw new DataError("forbidden", "Staff only.");
      if (error?.code === "RS404") throw new DataError("not_found", "That profile was not found.");
      throw new DataError("unavailable", "Could not change the suspension. Try again.");
    }
    return data as unknown as Profile;
  }

  // --- saved searches (0020; owner-only under RLS) -------------------------

  async listSavedSearches(ownerId: string): Promise<SavedSearch[]> {
    const { data, error } = await this.client
      .from("saved_searches")
      .select(SAVED_SEARCH_COLUMNS)
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false })
      .returns<SavedSearch[]>();
    if (error) return [];
    return data ?? [];
  }

  async saveSearch(ownerId: string, name: string, query: string, digest: boolean): Promise<SavedSearch> {
    // Same name replaces, as locally: (owner_id, name) is unique.
    const { data, error } = await this.client
      .from("saved_searches")
      .upsert({ owner_id: ownerId, name, query, digest }, { onConflict: "owner_id,name" })
      .select(SAVED_SEARCH_COLUMNS)
      .single<SavedSearch>();
    if (error || !data) throw new DataError("unavailable", "Could not save the search. Try again.");
    return data;
  }

  async setSavedSearchDigest(ownerId: string, searchId: string, digest: boolean): Promise<void> {
    const result = await this.client
      .from("saved_searches")
      .update({ digest }, { count: "exact" })
      .eq("id", searchId)
      .eq("owner_id", ownerId);
    requireAffected(result, "saved search");
  }

  async deleteSavedSearch(ownerId: string, searchId: string): Promise<void> {
    const result = await this.client
      .from("saved_searches")
      .delete({ count: "exact" })
      .eq("id", searchId)
      .eq("owner_id", ownerId);
    requireAffected(result, "saved search");
  }

  /** The owner's list, or not-found — for writes that touch only member rows. */
  private async requireList(ownerId: string, listId: string): Promise<void> {
    const { data, error } = await this.client
      .from("recruiter_lists")
      .select("id")
      .eq("id", listId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw new DataError("unavailable", "Could not update the list. Try again.");
    if (!data) throw new DataError("not_found", "List not found.");
  }

  /** Bumps updated_at (the 0005 trigger sets it) so the list sorts as recently used. */
  private async touchList(listId: string): Promise<void> {
    await this.client.from("recruiter_lists").update({ updated_at: new Date().toISOString() }).eq("id", listId);
  }
}
