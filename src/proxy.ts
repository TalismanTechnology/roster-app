import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Runs before every matched request.
 *
 * Named `proxy` rather than `middleware`: Next.js 16 renamed the convention.
 *
 * Two jobs:
 *   1. Refresh the Supabase session so Server Components never render against
 *      an expired token.
 *   2. Gate the handful of routes that belong to the signed-in athlete.
 *
 * The gating inverted with the pivot. Roster was a private network where every
 * route needed a session; it is now a public resume site, where a recruiter
 * with no account is the primary audience. So the default is open, and only
 * the athlete's own surfaces — the editor, settings, onboarding — redirect to
 * sign-in.
 *
 * Single-segment paths that are not reserved routes resolve as handles:
 * `/avareyes` is a resume. `src/lib/handles.ts` holds the reserved list, and
 * the database refuses those handles at sign-up, so the two cannot collide.
 */

/** Routes that require a session. Everything else is public. */
const PROTECTED_PATHS = ["/resume", "/settings", "/onboarding"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Before Supabase is wired up, do not gate anything — the auth call would
  // stall on an unresolvable hostname and every route would appear to hang.
  if (!isSupabaseConfigured()) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { pathname } = request.nextUrl;

  if (!user && isProtected(pathname)) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    // Preserve where they were headed so sign-in can return them there.
    signIn.searchParams.set("next", pathname);

    return NextResponse.redirect(signIn);
  }

  return response;
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image files. Excluding these matters
     * for cost as much as speed: the proxy calls the auth server, and running
     * it for every icon would multiply auth traffic by an order of magnitude.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|woff2?)$).*)",
  ],
};
