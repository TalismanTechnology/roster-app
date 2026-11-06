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

const MENU_ROW =
  "flex min-h-14 items-center gap-4 py-3 text-lg text-ink-muted transition-colors hover:text-ink active:text-ink aria-[current=page]:text-ink";

/** The current route, or a page inside it (/lists/abc under Lists). */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

  // While the sheet is open: the page under it doesn't scroll, Escape
  // closes it and hands focus back to the toggle, and widening past sm
  // (rotation, a resized window) closes it — the sheet is display:none
  // there, and its scroll lock must not outlive it.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpenedAt(null);
      menuButtonRef.current?.focus();
    };
    const wide = window.matchMedia("(min-width: 640px)");
    const onWide = () => wide.matches && setMenuOpenedAt(null);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [isMenuOpen]);

  const closeMenu = () => setMenuOpenedAt(null);
  const links = menuLinks(user);
  const isLanding = variant === "landing";
  const glass = isScrolled ? "bg-paper/70 border-white/10" : "bg-paper/40 border-white/5";
  const shell = isLanding
    ? "fixed inset-x-0 top-0 z-40 pointer-events-none"
    : `sticky top-0 z-40 border-b transition-colors duration-300 ${isScrolled ? "bar-blur border-rule" : "border-transparent"}`;
  // Open, the bar turns solid so it and the sheet read as one surface.
  const opened = isMenuOpen ? "max-sm:bg-paper" : "";
  // Below sm the pill is a full thumb target; from sm it is the desktop size.
  const pill = `group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-bold text-ink backdrop-blur-md transition-colors hover:border-ink hover:bg-ink hover:text-paper max-sm:min-h-11 sm:px-4 ${glass}`;

  return (
    // pt-safe: installed to the home screen, the bar starts under the status bar.
    <header className={`print-hidden pt-safe ${shell} ${opened}`} style={{ paddingInline: "var(--pad-x)" }}>
      <div className="relative flex items-center justify-between" style={{ height: "var(--header-h)" }}>
        {/* Padded out to a 44px target; the negative margin keeps the wordmark on the gutter. */}
        <Link
          href="/"
          className="pointer-events-auto -mx-2 inline-flex min-h-11 items-center px-2 font-display tracking-tight transition-opacity hover:opacity-80"
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
            <span aria-hidden className={`invisible inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-bold max-sm:min-h-11 sm:px-4 ${glass}`}>
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
                className={pill}
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
                className={pill}
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
            className={`label -mr-1.5 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center whitespace-nowrap px-1.5 font-mono transition-colors hover:text-ink sm:hidden ${isMenuOpen ? "text-ink" : "text-ink-muted"}`}
          >
            {/* One inline box, so flex layout doesn't trim the spaces inside the brackets. */}
            <span className="whitespace-pre">
              <span aria-hidden>[</span> Menu <span aria-hidden>]</span>
            </span>
          </button>
        </nav>
      </div>

      {/* Phone menu: a full-height sheet of paper under the bar, the links
          the bar drops below sm as a hairline-ruled list. `hidden` while
          closed and display:none from sm up, so the desktop bar never has a
          second "Sign out" in the tree. Tapping the empty paper below the
          list closes it, like a backdrop. */}
      <nav
        id="site-menu"
        aria-label="Menu"
        hidden={!isMenuOpen}
        onClick={(e) => e.target === e.currentTarget && closeMenu()}
        className="pointer-events-auto absolute inset-x-0 top-full flex h-[calc(100dvh-var(--header-h)-var(--safe-top))] flex-col overflow-y-auto overscroll-contain border-t border-rule bg-paper pb-safe-min sm:hidden"
        style={{ paddingInline: "var(--pad-x)" }}
      >
        <ul className="divide-y divide-rule border-b border-rule">
          {links.map(([label, href], i) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link href={href} onClick={closeMenu} aria-current={active ? "page" : undefined} className={MENU_ROW}>
                  <MenuIndex n={i + 1} />
                  <span className="flex-1">{label}</span>
                  {active && (
                    <span className="label font-mono text-ink-subtle" aria-hidden>
                      [ Here ]
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
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

        {/* The bar's one filled action, again where the thumb rests. */}
        {!pending && (
          <div className="mt-auto pt-8">
            <Link href={user ? primaryHref(user) : "/sign-up"} onClick={closeMenu} className="btn-primary w-full">
              {user ? primaryLabel(user) : "Create your resume"}
              <ArrowUpRight className="!size-3.5" />
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
