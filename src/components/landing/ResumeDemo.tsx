import Link from "next/link";

import { Tilt } from "@/components/bits/Tilt";
import { Img } from "@/components/ui/Img";
import { Frame, Unverified, Verified } from "@/components/ui/marks";
import { getRepository, isLocalMode } from "@/lib/data";
import type { CoachContact, Profile, RecordEntry } from "@/lib/database.types";
import { env } from "@/lib/env";
import { previewCoaches, previewEntries, previewProfile } from "@/lib/fixtures";
import { levelLabel } from "@/lib/format";
import { sportName } from "@/lib/sports";

import { Section } from "./Section";

/** The seeded demo athlete — exists only in local mode's JSON database. */
const SEED_DEMO_HANDLE = "jordanreyes";

type Demo = { profile: Profile; entries: RecordEntry[]; coaches: CoachContact[]; isLive: boolean };

/**
 * Whose resume the landing shows. Local mode: the seeded demo athlete, live.
 * Supabase mode: fixtures, unless `ROSTER_DEMO_HANDLE` names a resume the
 * athlete agreed to feature — a real person who happens to claim the seed's
 * handle must never end up on the home page by accident.
 */
async function loadDemo(): Promise<Demo> {
  const handle = isLocalMode() ? SEED_DEMO_HANDLE : env().ROSTER_DEMO_HANDLE;
  if (handle) {
    const repo = await getRepository();
    const profile = await repo.getProfileByHandle(handle, null);
    if (profile) {
      const [entries, coaches] = await Promise.all([repo.listEntries(profile.id), repo.listCoaches(profile.id, null)]);
      return { profile, entries: entries.slice(0, 5), coaches, isLive: true };
    }
  }
  return { profile: previewProfile, entries: previewEntries.slice(0, 5), coaches: previewCoaches, isLive: false };
}

/**
 * The product, shown — rendered from the same shapes the app renders, with
 * a link through to the live page when the sample is a real resume.
 */
export async function ResumeDemo() {
  const { profile, entries, coaches, isLive } = await loadDemo();
  const coach = coaches[0];

  return (
    <Section
      id="resume"
      label="The resume"
      title={
        <>
          Everything a recruiter asks for. <span className="text-ink-muted">One link.</span>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
        <Tilt className="lg:col-span-5" amplitude={6}>
          <figure className="relative">
            <Img id="02" className="aspect-[4/5]" sizes="(min-width: 1024px) 40vw, 100vw" />
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-paper via-paper/70 to-transparent" aria-hidden />
            <figcaption className="absolute inset-x-0 bottom-0 [transform:translateZ(40px)]" style={{ padding: "var(--feature-pad)" }}>
              <blockquote className="font-display text-xl leading-snug tracking-tight lg:text-2xl">
                “Hardest worker I’ve coached in a decade.”
              </blockquote>
              <p className="label mt-3 flex items-center gap-1.5 text-ink-muted">
                <Verified className="text-ink" /> {coach ? [coach.name, coach.role].filter(Boolean).join(", ") : "Head Coach"}
              </p>
            </figcaption>
          </figure>
        </Tilt>

        <Frame
          as="article"
          className="lifted relative z-10 lg:col-span-7 lg:-ml-16"
          aria-label="Sample athlete resume"
        >
          <div
            className="grid gap-x-8 sm:grid-cols-[1fr_auto]"
            style={{ padding: "var(--feature-pad)", paddingBlock: "clamp(1.5rem, 3vw, 2.5rem)" }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule pb-4 sm:col-span-2">
              <div>
                <h3 className="font-display text-display leading-none tracking-tight">{profile.display_name}</h3>
                <p className="mt-1.5 text-sm text-ink-muted">
                  {[profile.positions.join(" / "), profile.grad_year ? `Class of ${profile.grad_year}` : null, profile.school].filter(Boolean).join(" · ")}
                </p>
              </div>
              <p className="label flex items-center gap-1.5">
                <Verified /> {profile.verified_count} of {profile.entry_count} verified
              </p>
            </div>

            <ul className="divide-y divide-rule">
              {entries.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-6 py-2.5">
                  <span className="text-sm">{e.title}</span>
                  <span className={`font-display flex max-w-[55%] items-center justify-end gap-2 text-right ${e.verification === "verified" ? "" : "text-ink-muted"}`} data-numeric>
                    {valueOf(e)}
                    {e.verification === "verified" ? <Verified /> : <Unverified />}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col gap-3 sm:mt-0 sm:w-56">
              <div className="relative aspect-video overflow-hidden border border-rule">
                <Img id="01" className="absolute inset-0" sizes="224px" quiet />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid size-9 place-items-center rounded-full bg-paper/80 text-ink">
                    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                  </span>
                </span>
                <span className="label absolute right-1.5 bottom-1.5 bg-paper/80 px-1.5 py-0.5">4:12</span>
              </div>
              <p className="text-sm">Senior season highlights</p>
              <p className="label border-t border-rule pt-3 text-ink-muted">
                {[profile.gpa !== null ? `GPA ${profile.gpa}` : null, levelLabel(profile.level), sportName(profile.primary_sport)].filter(Boolean).join(" · ")}
              </p>
              {isLive && (
                <Link href={`/${profile.handle}`} className="label text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
                  Open the live resume →
                </Link>
              )}
            </div>
          </div>
        </Frame>
      </div>
    </Section>
  );
}

function valueOf(e: RecordEntry): string {
  if (e.value_display) return e.unit === "s" ? e.value_display : e.value_display;
  if (e.placement) return `${e.placement}${e.field_size ? ` of ${e.field_size}` : ""}`;
  return e.org_name ?? "—";
}
