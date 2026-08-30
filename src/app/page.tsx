import Link from "next/link";
import { redirect } from "next/navigation";

import type { Profile } from "@/lib/database.types";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * The app entry point.
 *
 * Signed out, it sells the one thing the product does: a resume at a link.
 * Signed in, it is the athlete's home — is the resume working? — with the
 * week's view count and the doors to the editor and their public page.
 */
export default async function HomePage() {
  const user = isSupabaseConfigured() ? await getCurrentUser() : null;

  if (!user) {
    return <Landing />;
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (!profile) redirect("/onboarding");

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const { data: views } = await supabase
    .from("profile_views")
    .select("view_count")
    .eq("profile_id", profile.id)
    .gte("viewed_on", weekAgo);

  const weekViews = (views ?? []).reduce((sum, row) => sum + row.view_count, 0);

  return <Dashboard profile={profile} weekViews={weekViews} />;
}

function Dashboard({ profile, weekViews }: { profile: Profile; weekViews: number }) {
  const stats = [
    { label: "Views this week", value: weekViews },
    { label: "Entries", value: profile.entry_count },
    { label: "Verified", value: profile.verified_count },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl px-(--space-gutter) py-(--space-section)">
      <p className="label text-ink-subtle">Roster</p>

      <h1 className="font-display text-display mt-4 leading-[0.95] tracking-tight text-balance">
        {profile.display_name}
      </h1>

      <p className="text-ink-muted mt-3 text-sm">
        Your resume lives at{" "}
        <Link
          href={`/${profile.handle}`}
          className="text-ink decoration-rule-strong hover:decoration-ink cursor-pointer underline underline-offset-4"
        >
          roster.us/{profile.handle}
        </Link>
      </p>

      <dl className="border-rule mt-10 grid grid-cols-3 border-t pt-5">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <dd className="font-display text-display-sm leading-none" data-numeric>
              {stat.value}
            </dd>
            <dt className="label text-ink-subtle">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <nav className="mt-12 flex flex-col gap-3" aria-label="Your resume">
        <Link
          href="/resume"
          className="bg-ink text-paper hover:bg-ink-muted flex h-12 cursor-pointer items-center justify-center rounded-[2px] text-sm font-medium transition-colors duration-(--duration-fast)"
        >
          Edit your resume
        </Link>

        <Link
          href={`/${profile.handle}`}
          className="border-rule-strong text-ink hover:border-ink flex h-12 cursor-pointer items-center justify-center rounded-[2px] border text-sm font-medium transition-colors duration-(--duration-fast)"
        >
          View it as a recruiter
        </Link>

        <Link
          href="/search"
          className="label text-ink-muted hover:text-ink mt-2 cursor-pointer self-center underline decoration-transparent underline-offset-4 transition-colors duration-(--duration-fast) hover:decoration-ink"
        >
          Find other athletes →
        </Link>
      </nav>
    </main>
  );
}

function Landing() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-(--space-gutter) py-(--space-section)">
      <p className="label text-ink-subtle">Roster</p>

      <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight text-balance">
        Your whole career.
        <br />
        One link.
      </h1>

      <p className="text-ink-muted mt-6 max-w-prose leading-relaxed">
        A digital resume for athletes: every PR, result, award, and clip of
        film — verified by your coaches, in one page a recruiter can open
        without an account. Free for athletes.
      </p>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/sign-up"
          className="bg-ink text-paper hover:bg-ink-muted flex h-12 cursor-pointer items-center justify-center rounded-[2px] px-8 text-sm font-medium transition-colors duration-(--duration-fast)"
        >
          Build your resume
        </Link>

        <Link
          href="/search"
          className="border-rule-strong text-ink hover:border-ink flex h-12 cursor-pointer items-center justify-center rounded-[2px] border px-8 text-sm font-medium transition-colors duration-(--duration-fast)"
        >
          Find athletes
        </Link>
      </div>

      <p className="text-ink-subtle mt-10 text-sm">
        Already on Roster?{" "}
        <Link
          href="/sign-in"
          className="text-ink-muted hover:text-ink cursor-pointer underline decoration-rule underline-offset-4 transition-colors duration-(--duration-fast)"
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
