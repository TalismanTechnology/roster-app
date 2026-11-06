import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * Lands the email-confirmation (and any future OAuth) redirect. Supabase puts
 * a one-time code in the query string; exchanging it here sets the session
 * cookies, and the user continues to onboarding.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Same-origin continue-path only — same reasoning as the sign-in action:
  // this URL arrives from an email and must not become an open redirect.
  const next = safeNext(searchParams.get("next"), "/onboarding", origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=confirmation`);
}
