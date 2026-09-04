import SpotlightCard from "@/components/bits/SpotlightCard";
import { Img, type ImageId } from "@/components/ui/Img";

import { Section } from "./Section";

const STEPS: { n: string; title: string; body: string; img: ImageId; offset: string }[] = [
  { n: "01", title: "Build it.", body: "Results, film, academics. Live the moment you save.", img: "03", offset: "" },
  { n: "02", title: "Get it verified.", body: "One tap from your coach turns a claim into a record.", img: "04", offset: "lg:mt-12" },
  { n: "03", title: "Get found.", body: "Recruiters search, open your link — no account needed.", img: "05", offset: "lg:mt-24" },
];

export function HowItWorks() {
  return (
    <Section id="how" label="How it works" title="Three steps. No gatekeeper.">
      <ol className="grid gap-4 md:grid-cols-3 lg:gap-6">
        {STEPS.map((s) => (
          <li key={s.n} className={s.offset}>
            <SpotlightCard className="group h-full border border-rule bg-paper-raised/60 transition-colors hover:border-ink-subtle">
              <Img
                id={s.img}
                className="aspect-[4/3]"
                imgClassName="transition-transform duration-700 group-hover:scale-[1.04]"
                sizes="(min-width: 768px) 33vw, 100vw"
              />
              <div className="relative" style={{ padding: "var(--feature-pad)" }}>
                <span
                  className="font-display absolute -top-7 right-[var(--feature-pad)] leading-none tracking-tighter text-ink/90"
                  style={{ fontSize: "clamp(3rem, 5vw, 4.5rem)" }}
                >
                  {s.n}
                </span>
                <h3 className="font-display text-2xl">{s.title}</h3>
                <p className="mt-1.5 text-ink-muted">{s.body}</p>
              </div>
            </SpotlightCard>
          </li>
        ))}
      </ol>
    </Section>
  );
}
