import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import { supabaseCredentials } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * Must be created per request — never hoisted to a module-level singleton.
 * A shared instance would leak one user's session into another user's request
 * under concurrent rendering.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseCredentials();

  return createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. This is expected and safe:
            // src/proxy.ts refreshes the session on every request, so the
            // rotated token is already persisted before rendering begins.
          }
        },
      },
    },
  );
}
