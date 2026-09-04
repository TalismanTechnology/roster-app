import type { SupabaseClient } from "@supabase/supabase-js";

import type { CoachContact, Database, FilmClip, Profile, RecordEntry } from "@/lib/database.types";

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
  type VerificationRequest,
  type VerificationRequestDetail,
} from "../types";

type Client = SupabaseClient<Database>;

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
    const { data } = await this.client.from("profiles").select("id").eq("handle", handle).maybeSingle();
    return !data;
  }

  async createProfile(input: NewProfile): Promise<Profile> {
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
    await this.client.from("achievements").update(patch).eq("id", entryId).eq("profile_id", profileId);
    const { data } = await this.client.from("record_entries").select("*").eq("id", entryId).single<RecordEntry>();
    if (!data) throw new DataError("not_found", "That entry was not found.");
    return data;
  }

  async deleteEntry(profileId: string, entryId: string): Promise<void> {
    await this.client.from("achievements").delete().eq("id", entryId).eq("profile_id", profileId);
  }

  async setPinned(profileId: string, entryId: string, isPinned: boolean): Promise<void> {
    await this.client.from("achievements").update({ is_pinned: isPinned }).eq("id", entryId).eq("profile_id", profileId);
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
    await this.client.from("film_clips").delete().eq("id", clipId).eq("profile_id", profileId);
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
    await this.client.from("coach_contacts").delete().eq("id", coachId).eq("profile_id", profileId);
  }

  // --- verification (needs a verification_requests table; see types.ts) ---

  async requestVerification(): Promise<VerificationRequest> {
    throw new DataError("unavailable", "Verification by link is not wired to Supabase yet.");
  }

  async getVerificationRequest(): Promise<VerificationRequestDetail | null> {
    return null;
  }

  async respondToVerification(): Promise<void> {
    throw new DataError("unavailable", "Verification by link is not wired to Supabase yet.");
  }

  async listVerificationRequests(): Promise<VerificationRequest[]> {
    return [];
  }

  // --- signals ------------------------------------------------------------

  async recordView(profileId: string): Promise<void> {
    // Fire-and-forget: the counter must never delay or fail a render.
    void this.client.rpc("record_profile_view", { target: profileId });
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

  async searchAthletes(params: SearchParams): Promise<Profile[]> {
    const pageSize = params.pageSize ?? 24;
    const { data } = await this.client.rpc("search_athletes", {
      q: params.q ?? null,
      sport: params.sport ?? null,
      levels: params.level ? [params.level] : null,
      grad_years: params.gradYear ? [params.gradYear] : null,
      regions: params.region ? [params.region.toUpperCase()] : null,
      athlete_positions: null,
      verified_only: params.verifiedOnly ?? false,
      page_size: pageSize,
      page_offset: ((params.page ?? 1) - 1) * pageSize,
    });
    return data ?? [];
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
}
