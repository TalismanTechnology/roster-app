"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { homePathFor } from "@/lib/accounts";
import { signOut } from "@/lib/actions/auth";
import { ArrowUpRight } from "@/components/ui/marks";

/** Where the one filled button goes: an athlete to their resume, every
 *  other account kind to their lists, anyone unfinished to onboarding. */
function primaryHref(user: NonNullable<HeaderUser>): string {
  if (!user.handle) return "/onboarding";
  return homePathFor(user.accountKind);
}

function primaryLabel(user: NonNullable<HeaderUser>): string {
  if (!user.handle) return "Finish setup";
  return homePathFor(user.accountKind) === "/lists" ? "Your lists" : "Your resume";
}

/** Lists are recruiter and coach territory (#86): shown once there is a
 *  profile, and only for a non-athlete one. */
function showsLists(user: NonNullable<HeaderUser>): boolean {
  return Boolean(user.handle) && homePathFor(user.accountKind) === "/lists";
}

/** The bar's below-sm links, in the same order and under the same rules as
 *  the desktop row. */
function menuLinks(user: HeaderUser): [string, string][] {
  if (!user) return [["Find athletes", "/search"], ["Sign in", "/sign-in"]];
  return [
    ["Find athletes", "/search"],
    ...(showsLists(user) ? ([["Lists", "/lists"]] as [string, string][]) : []),
    ["Settings", "/settings"],
  ];
}

const MENU_ROW = "flex min-h-12 items-center gap-4 py-3 text-ink-muted transition-colors hover:text-ink";

/** The editorial row number — 01, 02 — decoration only. */
function MenuIndex({ n }: { n: number }) {
  return (
    <span className="label font-mono text-ink-subtle" data-numeric aria-hidden>
      {String(n).padStart(2, "0")}
    </span>
  );
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
  /** Streaming fallback: the account state is not known yet, so its controls hold their space blank. */
  pending?: boolean;
};

/**
 * The site header. Fixed and transparent on the landing so the hero runs
 * underneath; a sticky glass bar everywhere else. Signed out it sells the
 * product; signed in it is the way back to your own resume. Below sm the
 * secondary links fold into a "[ Menu ]" disclosure under the bar.
 */
export function SiteHeader({ user, variant = "app", pending = false }: Props) {
  const [isScrolled, setIsScrolled] = useState(false);
  // The phone menu remembers the path it was opened on, so any navigation
  // closes it without an effect writing state on every route change.
  const pathname = usePathname();
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null);
  const isMenuOpen = menuOpenedAt !== null && menuOpenedAt === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes the menu and hands focus back to the toggle.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpenedAt(null);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMenuOpen]);

  const closeMenu = () => setMenuOpenedAt(null);
  const links = menuLinks(user);
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
          <Link href="/search" className="hidden whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink sm:inline">
            Find athletes
          </Link>

          {pending ? (
            // Roughly the signed-out pill's footprint, so nothing shifts when the real controls land.
            <span aria-hidden className={`invisible inline-flex whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-bold sm:px-4 ${glass}`}>
              Create<span className="max-sm:hidden"> your</span> resume
            </span>
          ) : user ? (
            <>
              {showsLists(user) && (
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
                className={`group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-bold text-ink backdrop-blur-md transition-colors hover:border-ink hover:bg-ink hover:text-paper sm:px-4 ${glass}`}
              >
                {primaryLabel(user)}
                <ArrowUpRight className="!size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 max-sm:hidden" />
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="hidden rounded-full px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink sm:inline">
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className={`group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-bold text-ink backdrop-blur-md transition-colors hover:border-ink hover:bg-ink hover:text-paper sm:px-4 ${glass}`}
              >
                {/* Below sm the pill shares the bar with the menu toggle; "your" goes so 320px fits. */}
                Create<span className="max-sm:hidden"> your</span> resume
                <ArrowUpRight className="!size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 max-sm:hidden" />
              </Link>
            </>
          )}

          <button
            ref={menuButtonRef}
            hidden={pending}
            type="button"
            aria-expanded={isMenuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuOpenedAt(isMenuOpen ? null : pathname)}
            className={`label min-h-10 cursor-pointer whitespace-nowrap px-1.5 font-mono transition-colors hover:text-ink sm:hidden ${isMenuOpen ? "text-ink" : "text-ink-muted"}`}
          >
            <span aria-hidden>[</span> Menu <span aria-hidden>]</span>
          </button>
        </nav>
      </div>

      {/* Phone menu: the links the bar drops below sm, as a hairline-ruled
          list. `hidden` while closed and display:none from sm up, so the
          desktop bar never has a second "Sign out" in the tree. */}
      <nav
        id="site-menu"
        aria-label="Menu"
        hidden={!isMenuOpen}
        className="pointer-events-auto absolute inset-x-0 top-full border-b border-rule bg-paper sm:hidden"
        style={{ paddingInline: "var(--pad-x)" }}
      >
        <ul className="divide-y divide-rule border-t border-rule">
          {links.map(([label, href], i) => (
            <li key={href}>
              <Link href={href} onClick={closeMenu} className={MENU_ROW}>
                <MenuIndex n={i + 1} />
                {label}
              </Link>
            </li>
          ))}
          {user && (
            <li>
              <form action={signOut}>
                <button type="submit" className={`${MENU_ROW} w-full cursor-pointer text-left`}>
                  <MenuIndex n={links.length + 1} />
                  Sign out
                </button>
              </form>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
