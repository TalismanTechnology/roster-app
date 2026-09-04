import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell, SideCard } from "@/components/shell/AppShell";
import type { Profile } from "@/lib/database.types";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * The app entry point.
 *
 * Signed out, the X join screen translated: the mark filling half the
 * viewport, the two-beat headline, and a stack of pills that put creating an
 * account one press away. Signed in, the athlete's home inside the shell —
 * is the resume working? — with the week's views and the doors to the editor
 * and the public page.
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
    { label: "views this week", value: weekViews },
    { label: "entries", value: profile.entry_count },
    { label: "verified", value: profile.verified_count },
  ];

  return (
    <AppShell
      active="home"
      right={
        <SideCard title="Get found">
          <p className="text-ink-muted text-sm leading-normal">
            Recruiters filter by sport, class year, and state. The more of your
            record is verified, the higher you rank.
          </p>
          <Link href="/search" className="btn-outline mt-1 self-start px-5 text-sm">
            See the search they use
          </Link>
        </SideCard>
      }
    >
      <div className="bar-blur border-rule sticky top-0 z-20 flex h-[53px] items-center border-b px-4">
        <h1 className="text-display-sm font-display">Home</h1>
      </div>

      <div className="px-4 py-4">
        <p className="text-xl font-display">{profile.display_name}</p>
        <p className="text-ink-muted mt-0.5">
          Your resume lives at{" "}
          <Link href={`/${profile.handle}`} className="text-accent hover:underline">
            roster.us/{profile.handle}
          </Link>
        </p>

        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
          {stats.map((stat) => (
            <span key={stat.label} className="text-ink-muted">
              <span className="text-ink font-bold" data-numeric>
                {stat.value}
              </span>{" "}
              {stat.label}
            </span>
          ))}
        </p>

        <nav className="mt-6 flex flex-wrap gap-3" aria-label="Your resume">
          <Link href="/resume" className="btn-primary">
            Edit your resume
          </Link>
          <Link href={`/${profile.handle}`} className="btn-outline">
            View it as a recruiter
          </Link>
        </nav>
      </div>
    </AppShell>
  );
}

function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center gap-10 px-8 py-10 lg:flex-row lg:items-center lg:gap-0">
      {/* The mark, at billboard size. */}
      <div className="flex flex-1 items-center lg:justify-center" aria-hidden>
        <span className="font-display text-[clamp(5rem,20vw,17rem)] leading-none tracking-tighter">
          R
        </span>
      </div>

      <section className="flex w-full max-w-md flex-col lg:pl-8">
        <h1 className="text-display-lg font-display leading-none tracking-tight">
          Get found.
        </h1>

        <h2 className="text-display font-display mt-10 leading-tight">
          Join Roster today.
        </h2>

        <div className="mt-6 flex max-w-xs flex-col gap-3">
          <Link href="/sign-up" className="btn-primary">
            Create your resume
          </Link>

          <div className="flex items-center gap-2" aria-hidden>
            <span className="bg-rule h-px flex-1" />
            <span className="text-ink-muted text-sm">or</span>
            <span className="bg-rule h-px flex-1" />
          </div>

          <Link href="/search" className="btn-outline">
            Find athletes
          </Link>

          <p className="label text-ink-muted">
            Every PR, result, award, and clip of film — verified by your
            coaches, at one link a recruiter can open without an account. Free
            for athletes.
          </p>
        </div>

        <div className="mt-12 flex max-w-xs flex-col gap-3">
          <p className="text-lg font-bold">Already have a resume?</p>
          <Link href="/sign-in" className="btn-outline text-accent">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
