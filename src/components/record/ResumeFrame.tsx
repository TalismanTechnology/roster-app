"use client";

import { useRef, useState } from "react";

import type { CoachContact, FilmClip, Profile, RecordEntry } from "@/lib/database.types";

import { IdentityRail } from "./IdentityRail";
import { RecordTimeline } from "./RecordTimeline";
import { AcademicsPanel, FilmPanel, ReferencePanel } from "./ResumeSections";

/**
 * The whole resume in one frame.
 *
 * A recruiter opens a link, and everything that decides whether they keep
 * reading — who this is, what they have run, what it is verified against — is
 * on screen without a scroll. The previous stacked layout put film, record,
 * academics and references in a column four screens tall, which meant the
 * academics that qualify an athlete were three flicks below the fold.
 *
 * So: identity is permanent on the left, and the four sections share one panel
 * on the right behind tabs. Identity is the thing you need while reading every
 * other section, which is exactly the thing that should never be a tab.
 *
 * Below `lg` this degrades to a normal scrolling document — a phone cannot fit
 * a rail and a panel side by side, and pretending otherwise produces two
 * cramped columns instead of one readable one. The tabs still earn their keep
 * there by collapsing four sections into one.
 */

type TabId = "film" | "record" | "academics" | "references";

type Tab = {
  id: TabId;
  label: string;
  count: number | null;
};

export function ResumeFrame({
  profile,
  entries,
  film,
  coaches,
}: {
  profile: Profile;
  entries: RecordEntry[];
  film: FilmClip[];
  coaches: CoachContact[];
}) {
  const hasAcademics =
    profile.gpa !== null ||
    profile.sat_score !== null ||
    profile.act_score !== null ||
    Boolean(profile.ncaa_id);

  // Tabs for sections that have something in them. An empty "Film" tab on a
  // distance runner's resume advertises an absence rather than hiding one.
  const tabs: Tab[] = [
    { id: "record" as const, label: "Record", count: entries.length },
    { id: "film" as const, label: "Film", count: film.length },
    { id: "academics" as const, label: "Academics", count: null },
    { id: "references" as const, label: "References", count: coaches.length },
  ].filter((tab) => {
    if (tab.id === "academics") return hasAcademics;
    return (tab.count ?? 0) > 0;
  });

  return (
    // Height comes from the page, which owns the viewport and any bar above
    // this. Setting `h-dvh` here too would stack a full viewport under that
    // bar and push the foot of the rail off screen.
    <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
      <IdentityRail profile={profile} entryCount={entries.length} />

      {tabs.length > 0 ? (
        <SectionPanel tabs={tabs}>
          {(active) => (
            <>
              {active === "record" && <RecordTimeline entries={entries} />}
              {active === "film" && <FilmPanel clips={film} />}
              {active === "academics" && <AcademicsPanel profile={profile} />}
              {active === "references" && <ReferencePanel coaches={coaches} />}
            </>
          )}
        </SectionPanel>
      ) : (
        <EmptyResume />
      )}
    </div>
  );
}

/**
 * The tabbed right-hand panel.
 *
 * Implements the WAI-ARIA tabs pattern rather than a row of buttons: arrow
 * keys move between tabs, Home/End jump to the ends, and only the active tab
 * is in the tab order. A recruiter working through a list of athletes on the
 * keyboard should not have to Tab past four controls to reach the content.
 */
function SectionPanel({
  tabs,
  children,
}: {
  tabs: Tab[];
  children: (active: TabId) => React.ReactNode;
}) {
  const [active, setActive] = useState<TabId>(tabs[0].id);
  const tabRefs = useRef<Map<TabId, HTMLButtonElement>>(new Map());

  function focusTab(id: TabId) {
    setActive(id);
    tabRefs.current.get(id)?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const index = tabs.findIndex((tab) => tab.id === active);

    switch (event.key) {
      case "ArrowRight":
        focusTab(tabs[(index + 1) % tabs.length].id);
        break;
      case "ArrowLeft":
        focusTab(tabs[(index - 1 + tabs.length) % tabs.length].id);
        break;
      case "Home":
        focusTab(tabs[0].id);
        break;
      case "End":
        focusTab(tabs[tabs.length - 1].id);
        break;
      default:
        return;
    }

    // Only reached when a key above matched, so the page never loses a
    // scroll or a shortcut to a key this component ignored.
    event.preventDefault();
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col lg:min-h-0">
      <div
        role="tablist"
        aria-label="Resume sections"
        onKeyDown={handleKeyDown}
        className="border-rule-strong flex shrink-0 gap-6 overflow-x-auto border-b px-(--space-gutter)"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;

          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={`label -mb-px flex shrink-0 cursor-pointer items-center gap-2 border-b-2 py-4 whitespace-nowrap transition-colors duration-(--duration-fast) ${
                isActive
                  ? "border-ink text-ink"
                  : "hover:text-ink border-transparent text-ink-subtle"
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span
                  data-numeric
                  className={isActive ? "text-ink-subtle" : "text-ink-subtle/60"}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* The panel is the only thing that scrolls on a desktop-sized screen,
          which is what keeps the identity rail and the tabs permanently in
          view while a long record is read. */}
      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        tabIndex={0}
        className="flex-1 overflow-y-auto px-(--space-gutter) py-8 lg:min-h-0"
      >
        {children(active)}
      </div>
    </section>
  );
}

function EmptyResume() {
  return (
    <div className="flex flex-1 items-center justify-center px-(--space-gutter) py-16">
      <div className="max-w-sm text-center">
        <p className="font-display text-display-sm">Nothing on the record yet.</p>
        <p className="text-ink-muted mt-3 text-sm leading-relaxed">
          Every PR, win, award, and commitment added here becomes part of a permanent,
          verifiable history.
        </p>
      </div>
    </div>
  );
}
