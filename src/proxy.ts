import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every matched request.
 *
 * Named `proxy` rather than `middleware`: Next.js 16 renamed the convention.
 * The old `middleware.ts` filename still works but is deprecated.
 *
 * Two jobs:
 *   1. Refresh the Supabase session so Server Components never render against
 *      an expired token.
 *   2. Gate the private network — Roster is invite-only, so unauthenticated
 *      traffic reaches only the public surface.
 */

/** Paths reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = ["/", "/sign-in", "/sign-up", "/request-access", "/auth"];

/**
 * Top-level app routes. Anything else with a single segment is a handle, and
 * `/[handle]` resolves an athlete's record.
 *
 * This list is what keeps `/settings` from being read as an athlete named
 * "settings", so a new top-level route must be added here as it is created —
 * otherwise it silently becomes a profile lookup. The corresponding guard on
 * the other side is a reserved-handle check at sign-up.
 */
const APP_ROUTES = [
  "feed",
  "search",
  "notifications",
  "settings",
  "record",
  "verify",
  "invite",
  "api",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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

  if (!user && !isPublic(pathname)) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    // Preserve where they were headed so sign-in can return them there.
    signIn.searchParams.set("next", pathname);

    return NextResponse.redirect(signIn);
  }

  return response;
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_PATHS.some((p) => p !== "/" && pathname.startsWith(`${p}/`))) return true;

  // A single-segment path that is not a reserved app route is an athlete's
  // record. Let it through unauthenticated: profiles set to `public` are meant
  // to be shareable to recruiters who have no account, and RLS — not this
  // proxy — decides whether any row actually comes back.
  const segments = pathname.split("/").filter(Boolean);

  return segments.length === 1 && !APP_ROUTES.includes(segments[0]);
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
