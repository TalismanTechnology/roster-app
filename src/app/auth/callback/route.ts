import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Lands the email-confirmation (and any future OAuth) redirect. Supabase puts
 * a one-time code in the query string; exchanging it here sets the session
 * cookies, and the user continues to onboarding.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Relative continue-path only — same reasoning as the sign-in action: this
  // URL arrives from an email and must not become an open redirect.
  const rawNext = searchParams.get("next") ?? "/app";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !/[\\\r\n]/.test(rawNext) ? rawNext : "/app";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=confirmation`);
}
