import Link from "next/link";

const LINKS: [string, string][] = [
  ["Find athletes", "/search"],
  ["Sign in", "/sign-in"],
  ["Create your resume", "/sign-up"],
  ["Preview a resume", "/preview"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
];

export function SiteFooter() {
  return (
    <footer
      className="print-hidden border-t border-rule pb-safe-min [--pb-min:clamp(1.5rem,4vh,3rem)]"
      style={{ paddingInline: "var(--pad-x)", paddingTop: "clamp(1.5rem, 4vh, 3rem)" }}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <p className="font-display tracking-tight" style={{ fontSize: "clamp(1.35rem, 1.2vw + 0.9rem, 2.1rem)" }}>
          Roster
        </p>
        {/* Phones: a two-column grid of full 44px rows instead of a run of small inline links. */}
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-5 text-sm text-ink-muted sm:flex sm:flex-wrap sm:gap-y-2">
          {LINKS.map(([label, href]) => (
            <Link key={href} href={href} className="flex min-h-11 items-center transition-colors hover:text-ink sm:min-h-0">
              {label}
            </Link>
          ))}
        </nav>
        <p className="label text-ink-subtle">© 2026 Roster — The athlete&rsquo;s resume</p>
      </div>
    </footer>
  );
}
