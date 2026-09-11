import { authCallbackUrl } from "@/lib/auth-return";
import { createHash, randomBytes } from "node:crypto";
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

function checked<T>(result: {data: T; error: {code?: string; message: string} | null}): NonNullable<T> {
  if (result.error) { const {code, message} = result.error; throw new DataError(code === "23505" ? "conflict" : code === "42501" ? "forbidden" : (code === "PGRST116" || code === "P0002") ? "not_found" : code?.startsWith("22") || code === "23514" ? "invalid" : "unavailable", message); }
  return result.data as NonNullable<T>;
}
const digest = (token: string) => /^[0-9a-f-]{36}$/.test(token) ? token : createHash("sha256").update(token).digest("hex");
type Client = SupabaseClient<Database>;

/**
 * The Supabase adapter. Authorization is RLS: every query runs as the
 * signed-in user, so this class passes the viewer's context implicitly and
 * only adds the `.eq("profile_id", …)` filters that make a stale form fail
 * loudly rather than silently write nothing.
 *
 * Verification decisions run through identity-bound atomic database functions.
 */
export class SupabaseRepository implements Repository {
  constructor(private readonly client: Client) {}

  // --- accounts (session is Supabase's; see data/auth.ts) -----------------

  async signUp(email: string, password: string, next?: string): Promise<AuthUser> {
    const { data, error } = await this.client.auth.signUp({ email, password, options: {emailRedirectTo: authCallbackUrl(next ?? "/onboarding")} });
    if (error) throw new DataError(error.code === "user_already_exists" ? "conflict" : error.status && error.status >= 500 ? "unavailable" : "invalid", error.message);
    if (!data.user) throw new DataError("unavailable","Could not create the account.");
    return { id: data.user.id, email: data.user.email ?? email, emailConfirmed: Boolean(data.user.email_confirmed_at) };
  }

  async signIn(email: string, password: string): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error && !["invalid_credentials", "email_not_confirmed"].includes(error.code ?? "")) throw new DataError("unavailable", error.message);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? email, emailConfirmed: Boolean(data.user.email_confirmed_at) };
  }

  async getUser(): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") throw new DataError("unavailable",error.message);
    return data.user ? { id: data.user.id, email: data.user.email ?? "", emailConfirmed: Boolean(data.user.email_confirmed_at) } : null;
  }

  async updateEmail(_userId: string, email: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ email });
    if (error) throw new DataError("invalid", error.message);
  }

  async updatePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await this.getUser();
    if (!user || user.id !== userId || !(await this.signIn(user.email, current))) throw new DataError("forbidden", "Your current password did not match.");
    const { error } = await this.client.auth.updateUser({ password: next });
    if (error) throw new DataError("invalid", error.message);
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await this.getUser();
    if (!user || user.id !== userId) throw new DataError("forbidden", "Sign in to delete your account.");
    const { deleteAuthAccount } = await import("@/lib/supabase/admin");
    await deleteAuthAccount(userId);
  }

  // --- profiles -----------------------------------------------------------

  async getProfileById(id: string): Promise<Profile | null> {
    const { data, error } = await this.client.rpc("get_profile", {target_id: id}).maybeSingle<Profile>();
    checked({data, error});
    return data ?? null;
  }

  async getProfileByHandle(handle: string): Promise<Profile | null> {
    const { data, error } = await this.client.rpc("get_profile", {target_handle: handle}).maybeSingle<Profile>();
    checked({data, error});
    return data ?? null;
  }

  async isHandleAvailable(handle: string): Promise<boolean> {
    return checked(await this.client.rpc("handle_available", {candidate: handle}));
  }

  async createProfile(input: NewProfile): Promise<Profile> {
    const { data, error } = await this.client.from("profiles").insert(input).select("id").single();
    if (error) {
      if (error.code === "23505") throw new DataError("conflict", "That handle is taken.");
      if (error.code === "23514") throw new DataError("invalid", "That handle is reserved.");
      checked({data,error});
    }
    const profile = data ? await this.getProfileById(data.id) : null;
    if (!profile) throw new DataError("not_found", "Profile not found.");
    return profile;
  }

  async updateProfile(id: string, patch: Partial<Profile>): Promise<Profile> {
    const { data, error } = await this.client.from("profiles").update(patch).eq("id", id).select("id").single();
    checked({data,error});
    const profile = data ? await this.getProfileById(data.id) : null;
    if (!profile) throw new DataError("not_found", "Profile not found.");
    return profile;
  }

  // --- the record ---------------------------------------------------------

  async listEntries(profileId: string): Promise<RecordEntry[]> {
    const { data, error } = await this.client
      .from("record_entries")
      .select("*")
      .eq("profile_id", profileId)
      .order("is_pinned", { ascending: false })
      .order("achieved_on", { ascending: false })
      .returns<RecordEntry[]>();
    checked({data, error});
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
      checked({data,error});
      throw new DataError("not_found", "Entry not found.");
    }
    const { data: entry, error: entryError } = await this.client.from("record_entries").select("*").eq("id", data.id).single<RecordEntry>();
    checked({data:entry,error:entryError});
    if (!entry) throw new DataError("not_found","Entry not found.");
    return entry;
  }

  async updateEntry(profileId: string, entryId: string, patch: Partial<NewEntry>): Promise<RecordEntry> {
    checked(await this.client.from("achievements").update(patch).eq("id", entryId).eq("profile_id", profileId).select("id").single());
    const { data, error } = await this.client.from("record_entries").select("*").eq("id", entryId).single<RecordEntry>();
    checked({data,error});
    if (!data) throw new DataError("not_found", "That entry was not found.");
    return data!;
  }

  async deleteEntry(profileId: string, entryId: string): Promise<void> {
    checked(await this.client.from("achievements").delete().eq("id", entryId).eq("profile_id", profileId));
  }

  async setPinned(profileId: string, entryId: string, isPinned: boolean): Promise<void> {
    checked(await this.client.from("achievements").update({ is_pinned: isPinned }).eq("id", entryId).eq("profile_id", profileId).select("id").single());
  }

  // --- film ---------------------------------------------------------------

  async listFilm(profileId: string): Promise<FilmClip[]> {
    const { data, error } = await this.client
      .from("film_clips")
      .select("*")
      .eq("profile_id", profileId)
      .order("is_featured", { ascending: false })
      .order("position")
      .order("created_at")
      .returns<FilmClip[]>();
    checked({data, error});
    return data ?? [];
  }

  async addFilm(profileId: string, input: NewFilm): Promise<FilmClip> {
    const { data, error } = await this.client
      .from("film_clips")
      .insert({ profile_id: profileId, ...input })
      .select("*")
      .single<FilmClip>();
    checked({data,error});
    return data!;
  }

  async deleteFilm(profileId: string, clipId: string): Promise<void> {
    checked(await this.client.from("film_clips").delete().eq("id", clipId).eq("profile_id", profileId));
  }

  async featureFilm(_profileId: string, clipId: string): Promise<void> { checked(await this.client.rpc("feature_film", {clip: clipId})); }
  async updateFilm(profileId: string, clipId: string, patch: Partial<NewFilm>): Promise<FilmClip> {
    return checked(await this.client.from("film_clips").update(patch).eq("id", clipId).eq("profile_id", profileId).select("*").single());
  }
  async updateCoach(profileId: string, coachId: string, patch: Partial<NewCoach>): Promise<CoachContact> {
    return checked(await this.client.from("coach_contacts").update(patch).eq("id", coachId).eq("profile_id", profileId).select("*").single());
  }

  // --- references (RLS strips rows the viewer may not see) ----------------

  async listCoaches(profileId: string): Promise<CoachContact[]> {
    const { data, error } = await this.client
      .from("coach_contacts")
      .select("*")
      .eq("profile_id", profileId)
      .order("position")
      .order("created_at")
      .returns<CoachContact[]>();
    checked({data, error});
    return data ?? [];
  }

  async addCoach(profileId: string, input: NewCoach): Promise<CoachContact> {
    const { data, error } = await this.client
      .from("coach_contacts")
      .insert({ profile_id: profileId, ...input })
      .select("*")
      .single<CoachContact>();
    checked({data,error});
    return data!;
  }

  async deleteCoach(profileId: string, coachId: string): Promise<void> {
    checked(await this.client.from("coach_contacts").delete().eq("id", coachId).eq("profile_id", profileId));
  }

  // --- verification (needs a verification_requests table; see types.ts) ---

  async requestVerification(_profileId: string, achievementId: string, coachContactId: string): Promise<VerificationRequest> {
    const token = randomBytes(32).toString("base64url");
    const request = checked(await this.client.rpc("create_verification_request", {achievement: achievementId, coach: coachContactId, token_digest: digest(token)}));
    return {...request, token};
  }
  async getVerificationRequest(token: string): Promise<VerificationRequestDetail | null> {
    const request = checked(await this.client.rpc("verification_request_detail", {token_digest: digest(token)}));
    return request ? {...request, token} : null;
  }
  async respondToVerification(token: string, outcome: "verified" | "disputed", note: string | null): Promise<void> {
    checked(await this.client.rpc("respond_verification_request", {token_digest: digest(token), decision: outcome, response_note: note}));
  }
  async listVerificationRequests(profileId: string): Promise<VerificationRequest[]> {
    const rows = checked(await this.client.from("verification_requests").select("*").eq("profile_id", profileId).order("created_at", {ascending: false}));
    return rows.map(row => ({...row, token: ""}));
  }
  async listCoachVerificationRequests(): Promise<VerificationRequest[]> { return checked(await this.client.rpc("coach_verification_requests", {})); }

  // --- signals ------------------------------------------------------------

  async recordView(profileId: string): Promise<void> {
    // Await errors so traffic failures remain observable.
    checked(await this.client.rpc("record_profile_view", { target: profileId }));
  }

  async weeklyViews(profileId: string): Promise<number> {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await this.client
      .from("profile_views")
      .select("view_count")
      .eq("profile_id", profileId)
      .gte("viewed_on", since);
    checked({data, error});
    return (data ?? []).reduce((sum, row) => sum + row.view_count, 0);
  }

  // --- discovery ----------------------------------------------------------

  async searchAthletes(params: SearchParams): Promise<Profile[]> {
    const pageSize = params.pageSize ?? 24;
    const { data, error } = await this.client.rpc("search_athletes", {
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
    checked({data, error});
    return data ?? [];
  }

  // --- recruiter lists ----------------------------------------------------


  async listLists(ownerId: string): Promise<RecruiterList[]> {
    const rows = checked(await this.client.from("recruiter_lists").select("*").eq("owner_id", ownerId).order("updated_at", {ascending: false}));
    return Promise.all(rows.map(async row => ({...row, member_count: (checked(await this.client.from("recruiter_list_members").select("profile_id").eq("list_id",row.id))).length})));
  }
  async getList(ownerId: string, listId: string): Promise<RecruiterListDetail | null> {
    const list = (await this.listLists(ownerId)).find(l => l.id === listId);
    if (!list) return null;
    const rows = checked(await this.client.from("recruiter_list_members").select("*").eq("list_id",listId).order("added_at", {ascending:false}));
    const members = (await Promise.all(rows.map(async row => { const profile = await this.getProfileById(row.profile_id); return profile ? {...profile, list_note:row.note, added_at:row.added_at} : null; }))).filter((p): p is NonNullable<typeof p> => p !== null);
    return {list, members};
  }
  async createList(ownerId: string, name: string, note: string | null): Promise<RecruiterList> {
    return {...checked(await this.client.from("recruiter_lists").insert({owner_id:ownerId,name,note}).select("*").single()),member_count:0};
  }
  async updateList(ownerId: string, listId: string, name: string, note: string | null): Promise<RecruiterList> {
    const row = checked(await this.client.from("recruiter_lists").update({name,note}).eq("id",listId).eq("owner_id",ownerId).select("*").single());
    return {...row,member_count:(await this.getList(ownerId,listId))?.list.member_count ?? 0};
  }
  async deleteList(ownerId: string,listId: string): Promise<void> { checked(await this.client.from("recruiter_lists").delete().eq("id",listId).eq("owner_id",ownerId)); }
  private async requireList(ownerId: string,listId: string): Promise<void> {
    const row = checked(await this.client.from("recruiter_lists").select("id").eq("id",listId).eq("owner_id",ownerId).maybeSingle());
    if (!row) throw new DataError("not_found","That list was not found.");
  }
  async addToList(ownerId: string,listId: string,profileId: string,note: string | null): Promise<void> {
    await this.requireList(ownerId,listId); checked(await this.client.from("recruiter_list_members").upsert({list_id:listId,profile_id:profileId,note},{onConflict:"list_id,profile_id",ignoreDuplicates:true}));
  }
  async updateListMemberNote(ownerId: string,listId: string,profileId: string,note: string | null): Promise<void> {
    await this.requireList(ownerId,listId); checked(await this.client.from("recruiter_list_members").update({note}).eq("list_id",listId).eq("profile_id",profileId).select("profile_id").single());
  }
  async removeFromList(ownerId: string,listId: string,profileId: string): Promise<void> {
    await this.requireList(ownerId,listId); checked(await this.client.from("recruiter_list_members").delete().eq("list_id",listId).eq("profile_id",profileId));
  }
  async listsContaining(ownerId: string,profileId: string): Promise<string[]> {
    const ids = (await this.listLists(ownerId)).map(l=>l.id); if (!ids.length) return [];
    return checked(await this.client.from("recruiter_list_members").select("list_id").eq("profile_id",profileId).in("list_id",ids)).map(m=>m.list_id);
  }
}
