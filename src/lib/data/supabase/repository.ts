import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CoachContact, Database, FilmClip, Profile, RecordEntry } from "@/lib/database.types";
import { HANDLE_PATTERN, isReservedHandle } from "@/lib/handles";

import type { Repository } from "../repository";
import { isSubstantiveEntryChange, MAX_PINNED, SUBSTANTIVE_ENTRY_FIELDS } from "../rules";
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

/**
 * The Supabase adapter. Authorization is RLS: every query runs as the
 * signed-in user, so this class passes the viewer's context implicitly and
 * only adds the `.eq("profile_id", …)` filters that make a stale form fail
 * loudly rather than silently write nothing.
 *
 * Status: compiles against the hand-written types; NOT exercised against a
 * live project during the local-mode build. The by-link verification flow
 * has no table in the schema yet, so those methods report `unavailable`.
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
    // There is no verification_requests table here yet, so there is no
    // pending link to expire — the reset is the whole of it.
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

  // --- verification (needs a verification_requests table; see types.ts) ---

  async requestVerification(): Promise<VerificationRequest> {
    throw new DataError("unavailable", "Verification by link is not wired to Supabase yet.");
  }

  async getVerificationRequest(): Promise<VerificationRequestDetail | null> {
    return null;
  }

  async respondToVerification(): Promise<VerificationResponse> {
    throw new DataError("unavailable", "Verification by link is not wired to Supabase yet.");
  }

  async listVerificationRequests(): Promise<VerificationRequest[]> {
    return [];
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
