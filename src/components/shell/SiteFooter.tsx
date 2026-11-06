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
      className="print-hidden border-t border-rule"
      style={{ paddingInline: "var(--pad-x)", paddingBlock: "clamp(1.5rem, 4vh, 3rem)" }}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <p className="font-display tracking-tight" style={{ fontSize: "clamp(1.35rem, 1.2vw + 0.9rem, 2.1rem)" }}>
          Roster
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
          {LINKS.map(([label, href]) => (
            <Link key={href} href={href} className="transition-colors hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
        <p className="label text-ink-subtle">© 2026 Roster — The athlete&rsquo;s resume</p>
      </div>
    </footer>
  );
}
