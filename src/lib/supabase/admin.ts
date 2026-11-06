import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { env, isProduction, supabaseCredentials } from "@/lib/env";

/**
 * The service-role client. It bypasses row-level security entirely, so it
 * exists for the few operations RLS cannot express — today, only deleting
 * an account (`auth.admin.deleteUser`; the cascade from 0002 removes
 * everything the account owns).
 *
 * `server-only` makes importing this from a Client Component a build error,
 * and nothing here reads cookies: it never acts as the signed-in user, so
 * every caller must establish who that is (with the user's own client)
 * before asking this one to act.
 *
 * Created per call, never cached at module scope, and with session
 * persistence off — there is no session, only the key.
 */
export function createAdminClient(): SupabaseClient<Database> | null {
  const key = env().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    if (isProduction()) {
      // Loud in the server log; the user sees a plain "unavailable" message.
      console.error("[supabase] SUPABASE_SERVICE_ROLE_KEY is not set: account deletion is unavailable.");
    }
    return null;
  }
  const { url } = supabaseCredentials();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
