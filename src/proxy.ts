import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/data/local/session";
import { dataMode, sessionSecret, supabaseCredentials } from "@/lib/env";

/**
 * Runs before every matched request. Named `proxy` rather than `middleware`:
 * Next.js 16 renamed the convention, and it runs in the Node.js runtime.
 *
 * Two jobs:
 *   1. Refresh the session so Server Components never render against an
 *      expired token (Supabase mode) — or verify the signed cookie with no
 *      I/O at all (local mode).
 *   2. Gate the handful of routes that belong to the signed-in user.
 *
 * The default is open: a recruiter with no account is the primary audience.
 * Only the athlete's own surfaces — the editor, settings, onboarding, lists —
 * redirect to sign-in.
 */

/** Routes that require a session. Everything else is public. */
const PROTECTED_PATHS = ["/resume", "/settings", "/onboarding", "/lists"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (dataMode() === "local") {
    // Throws in production without a real secret, on every request rather
    // than only at the first sign-in, so a misconfigured deploy is obvious.
    sessionSecret();
    // Signature and age only; a cookie retired by a password change passes
    // here and is refused by getCurrentUser, which the gated pages call.
    const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session && isProtected(pathname)) return toSignIn(request, pathname);
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const { url, anonKey } = supabaseCredentials();

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not insert logic between client creation and getUser(). Anything that
  // throws in between leaves the session unrefreshed, which surfaces later as
  // random sign-outs that are very hard to trace back to here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected(pathname)) return toSignIn(request, pathname);

  return response;
}

function toSignIn(request: NextRequest, pathname: string) {
  const signIn = request.nextUrl.clone();
  signIn.pathname = "/sign-in";
  // Preserve where they were headed so sign-in can return them there.
  signIn.searchParams.set("next", pathname);
  return NextResponse.redirect(signIn);
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image files. Excluding these matters
     * for cost as much as speed: in Supabase mode the proxy calls the auth
     * server, and running it for every icon would multiply auth traffic.
     */
    "/((?!_next/static|_next/image|favicon.ico|img/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|woff2?)$).*)",
  ],
};
