import Link from "next/link";
import type { ReactNode } from "react";

import { HomeIcon, PlusIcon, ResumeIcon, SearchIcon } from "./icons";

/**
 * The three-column X shell, adopted whole.
 *
 * Left: a nav rail — icons alone until `xl`, icon + label after, with the one
 * pill action at the bottom of the list. Center: the 600px column where the
 * actual content lives, hairline-bordered on both sides. Right: a 350px
 * sidebar of modules, gone below `lg`. On phones the rail collapses into
 * X's bottom tab bar.
 *
 * The center column is the only thing that scrolls. That is what makes the
 * sticky blurred headers inside it work, and it is also why the shell — not
 * each page — owns the `h-dvh` and the scroll container.
 */

type NavKey = "home" | "search" | "resume";

export function AppShell({
  active,
  right,
  children,
}: {
  active?: NavKey;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[1290px] justify-center">
      <NavRail active={active} />

      <main className="flex h-full min-h-0 w-full min-w-0 max-w-[600px] flex-col sm:border-x sm:border-rule">
        <div className="min-h-0 flex-1 overflow-y-auto pb-16 sm:pb-0">{children}</div>
      </main>

      <Sidebar>{right}</Sidebar>
    </div>
  );
}

const NAV_ITEMS: { key: NavKey; label: string; href: string; icon: typeof HomeIcon }[] = [
  { key: "home", label: "Home", href: "/", icon: HomeIcon },
  { key: "search", label: "Explore", href: "/search", icon: SearchIcon },
  { key: "resume", label: "Your resume", href: "/resume", icon: ResumeIcon },
];

function NavRail({ active }: { active?: NavKey }) {
  return (
    <>
      {/* Desktop rail */}
      <header className="hidden shrink-0 flex-col items-center px-2 py-2 sm:flex xl:w-[240px] xl:items-stretch">
        <Link
          href="/"
          className="wash-hover flex size-12 items-center justify-center self-start rounded-full text-2xl font-black tracking-tight xl:ml-1"
          aria-label="Roster home"
        >
          R
        </Link>

        <nav aria-label="Primary" className="mt-1 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            const Icon = item.icon;

            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className="wash-hover flex items-center gap-4 self-start rounded-full p-3 xl:pr-6"
              >
                <Icon className={isActive ? "size-6.5" : "size-6.5 [&_path]:stroke-[1.75] [&_circle]:stroke-[1.75]"} />
                <span
                  className={`hidden text-xl xl:block ${isActive ? "font-bold" : ""}`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/sign-up"
          className="btn-primary mt-4 size-12 self-start !px-0 xl:h-[52px] xl:w-full xl:!px-8"
        >
          <PlusIcon className="size-6 xl:hidden" />
          <span className="hidden text-lg xl:block">Create resume</span>
        </Link>
      </header>

      {/* Phone bottom bar */}
      <nav
        aria-label="Primary"
        className="bar-blur border-rule fixed inset-x-0 bottom-0 z-30 flex border-t sm:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === active ? "page" : undefined}
              className="flex flex-1 items-center justify-center py-3"
            >
              <Icon className={item.key === active ? "size-6.5" : "size-6.5 text-ink-muted"} />
              <span className="sr-only-text">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function Sidebar({ children }: { children?: ReactNode }) {
  return (
    <aside className="hidden w-[350px] shrink-0 flex-col gap-4 overflow-y-auto px-6 py-3 lg:flex">
      <form action="/search" method="GET" role="search">
        <label className="bg-paper-sunken focus-within:bg-paper focus-within:outline-accent flex h-11 cursor-text items-center gap-3 rounded-full px-4 focus-within:outline-2">
          <SearchIcon className="text-ink-muted size-5" />
          <input
            type="search"
            name="q"
            placeholder="Search athletes"
            className="placeholder:text-ink-muted w-full bg-transparent text-base outline-none"
          />
          <span className="sr-only-text">Search athletes</span>
        </label>
      </form>

      {children}

      <p className="label text-ink-muted px-4">
        Roster — the athlete&apos;s resume. Free for athletes.
      </p>
    </aside>
  );
}

/** A right-column module: X's grey rounded card with a bold 20px title. */
export function SideCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="raised flex flex-col gap-3 px-4 py-3">
      <h2 className="text-display-sm font-display">{title}</h2>
      {children}
    </section>
  );
}
