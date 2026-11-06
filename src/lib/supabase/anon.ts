import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { supabaseCredentials } from "@/lib/env";

/**
 * A Supabase client that is nobody: the anon key, no cookies, no session.
 * For reads that must answer the same for every visitor — the sitemap, the
 * share card, the proxy's visibility check — so they can be cached without
 * one person's session deciding what everyone else sees. RLS treats it as
 * `anon`, which is exactly the recruiter-with-no-account view.
 */
export function createAnonClient(): SupabaseClient<Database> {
  const { url, anonKey } = supabaseCredentials();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
