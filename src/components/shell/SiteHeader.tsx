"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { signOut } from "@/lib/actions/auth";
import { ArrowUpRight } from "@/components/ui/marks";

/** Where the one filled button goes: an athlete to their resume, a
 *  recruiter to their lists, anyone unfinished to onboarding. */
function primaryHref(user: NonNullable<HeaderUser>): string {
  if (!user.handle) return "/onboarding";
  return user.accountKind === "recruiter" ? "/lists" : "/resume";
}

function primaryLabel(user: NonNullable<HeaderUser>): string {
  if (!user.handle) return "Finish setup";
  return user.accountKind === "recruiter" ? "Your lists" : "Your resume";
}

export type HeaderUser = {
  email: string;
  handle: string | null;
  displayName: string | null;
  accountKind: "athlete" | "coach" | "recruiter" | "brand" | "staff" | null;
} | null;

type Props = {
  user: HeaderUser;
  /** `landing` floats transparent over the hero; `app` is a glass bar with a hairline. */
  variant?: "landing" | "app";
};

/**
 * The site header. Fixed and transparent on the landing so the hero runs
 * underneath; a sticky glass bar everywhere else. Signed out it sells the
 * product; signed in it is the way back to your own resume.
 */
export function SiteHeader({ user, variant = "app" }: Props) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isLanding = variant === "landing";
  const glass = isScrolled ? "bg-paper/70 border-white/10" : "bg-paper/40 border-white/5";
  const shell = isLanding
    ? "fixed inset-x-0 top-0 z-40 pointer-events-none"
    : `sticky top-0 z-40 border-b transition-colors duration-300 ${isScrolled ? "bar-blur border-rule" : "border-transparent"}`;

  return (
    <header className={`print-hidden ${shell}`} style={{ paddingInline: "var(--pad-x)" }}>
      <div className="relative flex items-center justify-between" style={{ height: "var(--header-h)" }}>
        <Link
          href="/"
          className="pointer-events-auto font-display tracking-tight transition-opacity hover:opacity-80"
          style={{ fontSize: "clamp(1.35rem, 1.2vw + 0.9rem, 2.1rem)" }}
        >
          Roster
        </Link>

        <nav aria-label="Main navigation" className="pointer-events-auto flex items-center gap-1">
          <Link href="/search" className="rounded-full px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink">
            Find athletes
          </Link>

          {user ? (
            <>
              {user.handle && (
                <Link href="/lists" className="hidden rounded-full px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink sm:inline">
                  Lists
                </Link>
              )}
              <Link href="/settings" className="hidden rounded-full px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink sm:inline">
                Settings
              </Link>
              <form action={signOut} className="hidden sm:block">
                <button type="submit" className="cursor-pointer rounded-full px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink">
                  Sign out
                </button>
              </form>
              <Link
                href={primaryHref(user)}
                className={`group inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-bold text-ink backdrop-blur-md transition-colors hover:border-ink hover:bg-ink hover:text-paper ${glass}`}
              >
                {primaryLabel(user)}
                <ArrowUpRight className="!size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="hidden rounded-full px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink sm:inline">
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className={`group inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-bold text-ink backdrop-blur-md transition-colors hover:border-ink hover:bg-ink hover:text-paper ${glass}`}
              >
                Create your resume
                <ArrowUpRight className="!size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
