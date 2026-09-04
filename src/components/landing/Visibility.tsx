import SpotlightCard from "@/components/bits/SpotlightCard";

import { Section } from "./Section";

const MODES = [
  { name: "Public", body: "In search, open to anyone. The default.", isDefault: true, icon: GlobeIcon },
  { name: "Unlisted", body: "Off search. Anyone with the link can open it.", icon: LinkIcon },
  { name: "Private", body: "Only you, until you flip it.", icon: LockIcon },
];

export function Visibility() {
  return (
    <Section
      id="visibility"
      label="Visibility"
      title={
        <>
          Public by default. <span className="text-ink-muted">Yours to change.</span>
        </>
      }
      aside={<p className="max-w-xs text-ink-muted">Contact details show only when a resume is public and marked recruitable.</p>}
    >
      <ul className="grid gap-4 md:grid-cols-3 lg:gap-6">
        {MODES.map(({ icon: Icon, name, body, isDefault }) => (
          <li key={name}>
            <SpotlightCard className="h-full border border-rule transition-colors hover:border-ink-subtle">
              <div className="flex flex-col gap-8" style={{ padding: "var(--feature-pad)", paddingBlock: "clamp(1.5rem, 3vw, 2.5rem)" }}>
                <div className="flex items-center justify-between">
                  <Icon />
                  {isDefault && <span className="label text-ink-muted">Default</span>}
                </div>
                <div>
                  <h3 className="font-display text-2xl">{name}</h3>
                  <p className="mt-1 text-ink-muted">{body}</p>
                </div>
              </div>
            </SpotlightCard>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const icon = { className: "size-5", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...icon} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" {...icon} aria-hidden>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" {...icon} aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="1" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
