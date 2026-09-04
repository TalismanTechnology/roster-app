import Link from "next/link";

import { Tilt } from "@/components/bits/Tilt";
import { Img } from "@/components/ui/Img";
import { Frame, Unverified, Verified } from "@/components/ui/marks";
import { getRepository } from "@/lib/data";
import type { RecordEntry } from "@/lib/database.types";
import { levelLabel, sportLabel } from "@/lib/format";

import { Section } from "./Section";

const DEMO_HANDLE = "jordanreyes";

/**
 * The product, shown. Pulls a real seeded resume from the repository so
 * what the landing promises is exactly what the app renders — with a link
 * through to the live page underneath it.
 */
export async function ResumeDemo() {
  const repo = await getRepository();
  const profile = await repo.getProfileByHandle(DEMO_HANDLE, null);
  const entries = profile ? (await repo.listEntries(profile.id)).slice(0, 5) : [];
  const coaches = profile ? await repo.listCoaches(profile.id, null) : [];
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
                “Best route-runner I’ve coached in a decade.”
              </blockquote>
              <p className="label mt-3 flex items-center gap-1.5 text-ink-muted">
                <Verified className="text-ink" /> {coach ? `${coach.name}, ${coach.role}` : "Head Coach"}
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
                <h3 className="font-display text-display leading-none tracking-tight">{profile?.display_name ?? "Jordan Reyes"}</h3>
                <p className="mt-1.5 text-sm text-ink-muted">
                  {profile
                    ? [profile.positions.join(" / "), `Class of ${profile.grad_year}`, profile.school].filter(Boolean).join(" · ")
                    : "WR / DB · Class of 2027 · Westlake HS"}
                </p>
              </div>
              {profile && (
                <p className="label flex items-center gap-1.5">
                  <Verified /> {profile.verified_count} of {profile.entry_count} verified
                </p>
              )}
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
                {profile ? `GPA ${profile.gpa} · ${levelLabel(profile.level)} · ${sportLabel(profile.primary_sport)}` : "GPA 3.8 · High School · Football"}
              </p>
              {profile && (
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
