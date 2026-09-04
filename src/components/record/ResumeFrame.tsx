"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

import { BackIcon, CalendarIcon, LinkIcon, LocationIcon, SchoolIcon } from "@/components/shell/icons";
import type { CoachContact, FilmClip, Profile, RecordEntry } from "@/lib/database.types";
import { heightLabel, levelLabel, sportLabel, weightLabel } from "@/lib/format";

import { RecordTimeline } from "./RecordTimeline";
import { AcademicsPanel, FilmPanel, ReferencePanel } from "./ResumeSections";
import { VerifiedSeal } from "./VerificationMark";

/**
 * The resume as an X profile page, taken whole: sticky blurred title bar,
 * 3:1 cover, avatar breaking the cover line, one pill action on the right,
 * name with the seal, meta rows, inline stats, then full-width tabs with the
 * blue indicator and the content below.
 *
 * The shape survives translation because it is the same problem: one person,
 * one identity block, several feeds of material behind tabs. A recruiter has
 * parsed this exact layout thousands of times, which is the whole argument
 * for adopting it — zero seconds are spent learning the page.
 */

type TabId = "record" | "film" | "academics" | "references";

type Tab = {
  id: TabId;
  label: string;
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

  // Tabs only for sections with something in them: an empty "Film" tab on a
  // distance runner's resume advertises an absence rather than hiding one.
  const tabs: Tab[] = [
    { id: "record" as const, label: "Record" },
    { id: "film" as const, label: "Film" },
    { id: "academics" as const, label: "Academics" },
    { id: "references" as const, label: "References" },
  ].filter((tab) => {
    if (tab.id === "record") return true;
    if (tab.id === "film") return film.length > 0;
    if (tab.id === "academics") return hasAcademics;
    return coaches.length > 0;
  });

  return (
    <>
      <TitleBar profile={profile} entryCount={entries.length} />
      <ProfileHeader profile={profile} entries={entries} filmCount={film.length} />

      <SectionTabs tabs={tabs}>
        {(active) => (
          <>
            {active === "record" && <RecordTimeline entries={entries} />}
            {active === "film" && <FilmPanel clips={film} />}
            {active === "academics" && <AcademicsPanel profile={profile} />}
            {active === "references" && <ReferencePanel coaches={coaches} />}
          </>
        )}
      </SectionTabs>
    </>
  );
}

/** The sticky glass bar: back arrow, bold name, entry count under it. */
function TitleBar({ profile, entryCount }: { profile: Profile; entryCount: number }) {
  return (
    <div className="bar-blur sticky top-0 z-20 flex h-[53px] shrink-0 items-center gap-6 px-4">
      <Link
        href="/"
        aria-label="Back to home"
        className="wash-hover -ml-2 flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <BackIcon className="size-5" />
      </Link>

      <div className="min-w-0 leading-tight">
        <p className="flex items-center gap-1.5 truncate text-lg font-bold">
          {profile.display_name}
          {profile.identity_verified_at && <VerifiedSeal className="size-[18px]" />}
        </p>
        <p className="label text-ink-muted" data-numeric>
          {entryCount} {entryCount === 1 ? "entry" : "entries"}
        </p>
      </div>
    </div>
  );
}

function ProfileHeader({
  profile,
  entries,
  filmCount,
}: {
  profile: Profile;
  entries: RecordEntry[];
  filmCount: number;
}) {
  const isContactable = profile.is_recruitable && profile.contact_email;

  return (
    <header>
      <Cover profile={profile} />

      {/* Avatar breaks the cover line; the action pill holds the right. */}
      <div className="px-4">
        <div className="flex items-end justify-between">
          <div className="-mt-[12%] w-1/4 min-w-24">
            <Avatar profile={profile} />
          </div>

          <div className="flex items-center gap-2 py-3">
            {isContactable && (
              <a href={`mailto:${profile.contact_email}`} className="btn-pill min-h-9 px-4">
                Contact
              </a>
            )}
          </div>
        </div>

        <div className="mt-1 flex flex-col gap-3 pb-3">
          <div className="leading-tight">
            <h1 className="flex items-center gap-1.5 text-xl font-display">
              {profile.display_name}
              {profile.identity_verified_at && <VerifiedSeal className="size-[22px]" />}
            </h1>
            <p className="text-ink-muted">@{profile.handle}</p>
          </div>

          {profile.bio && <p className="whitespace-pre-line">{profile.bio}</p>}

          <VitalsLine profile={profile} />
          <MetaRow profile={profile} />
          <StatsRow profile={profile} entries={entries} filmCount={filmCount} />
        </div>
      </div>
    </header>
  );
}

function Cover({ profile }: { profile: Profile }) {
  if (profile.cover_url) {
    return (
      <div className="bg-paper-sunken relative aspect-[3/1]">
        <Image src={profile.cover_url} alt="" fill priority className="object-cover" />
      </div>
    );
  }

  // X's empty cover is a plain slab. Ours carries the faintest accent wash so
  // a brand-new resume doesn't open with a void.
  return <div className="bg-paper-sunken aspect-[3/1] bg-gradient-to-br from-accent-wash to-transparent" />;
}

function Avatar({ profile }: { profile: Profile }) {
  if (profile.avatar_url) {
    return (
      <Image
        src={profile.avatar_url}
        alt=""
        width={140}
        height={140}
        priority
        className="border-paper bg-paper aspect-square w-full rounded-full border-4 object-cover"
      />
    );
  }

  const initials = profile.display_name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <div
      aria-hidden
      className="border-paper bg-paper-sunken text-ink-muted flex aspect-square w-full items-center justify-center rounded-full border-4 text-3xl font-bold"
    >
      {initials}
    </div>
  );
}

/** Level · sport · positions · measurables — the roster-sheet line, in ink. */
function VitalsLine({ profile }: { profile: Profile }) {
  const parts = [
    levelLabel(profile.level),
    sportLabel(profile.primary_sport),
    profile.positions.length > 0 ? profile.positions.join(" / ") : null,
    heightLabel(profile.height_cm),
    weightLabel(profile.weight_kg),
    profile.jersey ? `#${profile.jersey}` : null,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) return null;

  return <p className="text-ink font-bold">{parts.join(" · ")}</p>;
}

/** X's icon meta row: location, school, class year, and the proof links. */
function MetaRow({ profile }: { profile: Profile }) {
  const links = [
    profile.results_url && { label: "Results", href: profile.results_url },
    profile.hudl_url && { label: "Hudl", href: profile.hudl_url },
    profile.instagram && {
      label: `@${profile.instagram.replace(/^@/, "")}`,
      href: `https://instagram.com/${profile.instagram.replace(/^@/, "")}`,
    },
  ].filter((link): link is { label: string; href: string } => Boolean(link));

  const items: { icon: React.ReactNode; content: React.ReactNode }[] = [];

  if (profile.location) {
    items.push({ icon: <LocationIcon />, content: profile.location });
  }
  if (profile.school) {
    items.push({ icon: <SchoolIcon />, content: profile.school });
  }
  if (profile.grad_year) {
    items.push({ icon: <CalendarIcon />, content: `Class of ${profile.grad_year}` });
  }
  if (links.length > 0) {
    items.push({
      icon: <LinkIcon />,
      content: (
        <span className="flex flex-wrap gap-x-3">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-accent hover:underline"
            >
              {link.label}
            </a>
          ))}
        </span>
      ),
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          <span aria-hidden>{item.icon}</span>
          {item.content}
        </span>
      ))}
    </div>
  );
}

/** Bold count, muted label, inline — the Following/Followers grammar. */
function StatsRow({
  profile,
  entries,
  filmCount,
}: {
  profile: Profile;
  entries: RecordEntry[];
  filmCount: number;
}) {
  const stats = [
    { value: profile.verified_count, label: "Verified" },
    { value: entries.length, label: entries.length === 1 ? "Entry" : "Entries" },
    { value: filmCount, label: filmCount === 1 ? "Clip" : "Clips" },
  ];

  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1">
      {stats.map((stat) => (
        <span key={stat.label} className="text-ink-muted">
          <span className="text-ink font-bold" data-numeric>
            {stat.value}
          </span>{" "}
          {stat.label}
        </span>
      ))}
    </p>
  );
}

/**
 * X's tab bar: equal-width cells, full-height hover wash, the active label
 * bold with the rounded blue bar underneath. Sticks right below the title
 * bar. WAI-ARIA tabs pattern: arrow keys move, Home/End jump, only the
 * active tab is in the tab order.
 */
function SectionTabs({
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
    <>
      <div
        role="tablist"
        aria-label="Resume sections"
        onKeyDown={handleKeyDown}
        className="bar-blur border-rule sticky top-[53px] z-10 flex border-b"
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
              className="wash-hover min-w-0 flex-1 cursor-pointer"
            >
              <span className="relative mx-auto inline-flex flex-col items-center px-2 py-4">
                <span
                  className={
                    isActive ? "text-ink font-bold" : "text-ink-muted font-medium"
                  }
                >
                  {tab.label}
                </span>
                {isActive && (
                  <span
                    aria-hidden
                    className="bg-accent absolute inset-x-0 bottom-0 h-1 rounded-full"
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        tabIndex={0}
      >
        {children(active)}
      </div>
    </>
  );
}
