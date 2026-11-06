import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CoachContact, Database, FilmClip, Profile, RecordEntry } from "@/lib/database.types";
import { HANDLE_PATTERN, isReservedHandle } from "@/lib/handles";

import type { Repository } from "../repository";
import {
  DAILY_REQUEST_CAP,
  isSubstantiveEntryChange,
  MAX_PINNED,
  REQUEST_TTL_DAYS,
  SUBSTANTIVE_ENTRY_FIELDS,
} from "../rules";
import { generateToken, hashToken } from "../tokens";
import { clampPage, clampPageSize, escapeLike, normalizeSearchQuery } from "../search-query";
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

type Client = SupabaseClient<Database>;

/**
 * The most rows `search_athletes` is asked for when counting. The function
 * applies its own LIMIT, so the total is exact up to this and saturates
 * beyond it — fine for a pager, and it bounds the work an anonymous URL
 * can ask Postgres to do.
 */
const SEARCH_COUNT_WINDOW = 1000;

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
 * runs on the 0017 functions; supabase/tests covers them against Postgres.
 */
export class SupabaseRepository implements Repository {
  constructor(private readonly client: Client) {}

  // --- accounts (session is Supabase's; see data/auth.ts) -----------------

  async signUp(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error || !data.user) throw new DataError("conflict", error?.message ?? "Could not create the account.");
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

  async updateEmail(_userId: string, email: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ email });
    if (error) throw new DataError("invalid", error.message);
  }

  async updatePassword(_userId: string, _current: string, next: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password: next });
    if (error) throw new DataError("invalid", error.message);
    // Revoke every other device's refresh token; this one stays signed in.
    await this.client.auth.signOut({ scope: "others" });
  }

  async deleteAccount(): Promise<void> {
    throw new DataError("unavailable", "Account deletion needs the service role; not wired yet.");
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
    const { data, error } = await this.client
      .from("achievements")
      .insert({ profile_id: profileId, ...input })
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
      SUBSTANTIVE_ENTRY_FIELDS.filter((f) => patch[f] !== undefined).map((f) => [f, patch[f]]),
    ) as Partial<NewEntry>;
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
    const { data, error } = await this.client
      .from("film_clips")
      .insert({ profile_id: profileId, ...input })
      .select("*")
      .single<FilmClip>();
    if (error) throw new DataError("invalid", "Could not add the clip.");
    return data;
  }

  async deleteFilm(profileId: string, clipId: string): Promise<void> {
    requireAffected(
      await this.client.from("film_clips").delete({ count: "exact" }).eq("id", clipId).eq("profile_id", profileId),
      "clip",
    );
  }

  async featureFilm(profileId: string, clipId: string): Promise<void> {
    // Unset-then-set. The partial unique index in 0004 guarantees at most one
    // featured clip survives even if two of these race.
    await this.client.from("film_clips").update({ is_featured: false }).eq("profile_id", profileId).eq("is_featured", true);
    await this.client.from("film_clips").update({ is_featured: true }).eq("id", clipId).eq("profile_id", profileId);
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

  // --- discovery ----------------------------------------------------------

  async searchAthletes(params: SearchParams): Promise<SearchResult> {
    const pageSize = clampPageSize(params.pageSize);
    const q = normalizeSearchQuery(params.q);
    const args = {
      // The function interpolates q into ILIKE '%' || q || '%', so % and _
      // in a name typed by a stranger must match literally.
      q: q ? escapeLike(q) : null,
      sport: params.sport ?? null,
      levels: params.level ? [params.level] : null,
      grad_years: params.gradYear ? [params.gradYear] : null,
      regions: params.region ? [params.region.toUpperCase()] : null,
      athlete_positions: null,
      verified_only: params.verifiedOnly ?? false,
    };
    const fetchPage = (page: number) =>
      this.client.rpc("search_athletes", { ...args, page_size: pageSize, page_offset: (page - 1) * pageSize });

    const requested = Math.max(Math.trunc(params.page ?? 1) || 1, 1);
    // The count and the requested page in parallel; a page past the end is
    // refetched clamped, which only costs a second trip on a stale link.
    const [counted, first] = await Promise.all([
      this.client.rpc("search_athletes", { ...args, page_size: SEARCH_COUNT_WINDOW, page_offset: 0 }, { count: "exact", head: true }),
      fetchPage(requested),
    ]);
    if (counted.error) throw new DataError("unavailable", "Search is unavailable right now.");

    const total = counted.count ?? 0;
    const page = clampPage(requested, total, pageSize);
    const { data, error } = page === requested ? first : await fetchPage(page);
    if (error) throw new DataError("unavailable", "Search is unavailable right now.");
    return { athletes: data ?? [], total, page, pageSize };
  }

  // --- recruiter lists ----------------------------------------------------
  // The tables exist (0005) but are not in database.types.ts yet; wire once
  // `npm run db:types` can run against the linked project.

  async listLists(): Promise<RecruiterList[]> {
    return [];
  }

  async getList(): Promise<RecruiterListDetail | null> {
    return null;
  }

  async createList(): Promise<RecruiterList> {
    throw new DataError("unavailable", "Lists are not wired to Supabase yet.");
  }

  async deleteList(): Promise<void> {
    throw new DataError("unavailable", "Lists are not wired to Supabase yet.");
  }

  async addToList(): Promise<void> {
    throw new DataError("unavailable", "Lists are not wired to Supabase yet.");
  }

  async removeFromList(): Promise<void> {
    throw new DataError("unavailable", "Lists are not wired to Supabase yet.");
  }

  async listsContaining(): Promise<string[]> {
    return [];
  }

  async listsContainingMany(_ownerId: string, profileIds: string[]): Promise<Record<string, string[]>> {
    return Object.fromEntries(profileIds.map((id) => [id, []]));
  }
}
