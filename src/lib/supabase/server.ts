import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * Must be created per request — never hoisted to a module-level singleton.
 * A shared instance would leak one user's session into another user's request
 * under concurrent rendering.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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

/**
 * Returns the signed-in user, or null.
 *
 * Always reads through `getUser()` rather than `getSession()`. `getSession()`
 * returns whatever the cookie claims without verifying it against the auth
 * server, so it must never gate access to anything that matters.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in your Supabase project values.`,
    );
  }

  return value;
}
