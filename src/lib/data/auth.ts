import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

import { getRepository, isLocalMode } from "./index";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, sessionCookieOptions, signSession, verifySession } from "./local/session";
import { DataError, type AuthUser } from "./types";

/**
 * Sessions, in whichever mode is running.
 *
 * Local: a signed cookie this module issues and verifies. Supabase: the
 * cookies @supabase/ssr manages, refreshed by the proxy. Callers never see
 * the difference — `getCurrentUser()` is the only question they ask.
 *
 * Server-side only. Nothing here may be imported from a Client Component.
 */

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isLocalMode()) {
    const store = await cookies();
    const userId = verifySession(store.get(SESSION_COOKIE)?.value);
    if (!userId) return null;
    return (await getRepository()).getUser(userId);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? "" } : null;
}

export type SignInResult = { error: string | null };
export type SignUpResult = { error: string | null; confirmEmail?: boolean };

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const repo = await getRepository();
  const user = await repo.signIn(email, password);

  // The generic message is deliberate: "no such account" versus "wrong
  // password" tells an attacker which emails have accounts.
  if (!user) return { error: "That email and password combination did not work." };

  if (isLocalMode()) await issueSession(user.id);
  return { error: null };
}

export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const repo = await getRepository();

  try {
    const user = await repo.signUp(email, password);
    if (isLocalMode()) {
      await issueSession(user.id);
      return { error: null };
    }
    // Supabase with email confirmation on returns a user but no session; the
    // session arrives via /auth/callback when they click the link.
    const supabase = await createClient();
    const { data } = await supabase.auth.getSession();
    return data.session ? { error: null } : { error: null, confirmEmail: true };
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    return { error: "Could not create your account. Try again." };
  }
}

export async function signOutEverywhere(): Promise<void> {
  if (isLocalMode()) {
    const store = await cookies();
    store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return;
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
}

async function issueSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(userId), { ...sessionCookieOptions(), maxAge: SESSION_MAX_AGE_S });
}
