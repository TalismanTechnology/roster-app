import { Tilt } from "@/components/bits/Tilt";
import { Img, type ImageId } from "@/components/ui/Img";

import { Section } from "./Section";

const CARDS: { label: string; img: ImageId; offset: string; position?: string }[] = [
  { label: "Football", img: "hero-reveal", offset: "", position: "object-[62%_center]" },
  { label: "Track", img: "06", offset: "lg:translate-y-10" },
  { label: "Basketball", img: "07", offset: "" },
  { label: "Soccer", img: "08", offset: "lg:translate-y-10" },
];

export function Sports() {
  return (
    <Section
      id="sports"
      label="Every sport"
      title={
        <>
          Any sport. <span className="text-ink-muted">Same record.</span>
        </>
      }
      aside={
        <p className="max-w-xs text-ink-muted">
          Positions and stat types adapt to the sport. Verification works the same everywhere.
        </p>
      }
    >
      <ul className="-mx-[var(--pad-x)] flex snap-x snap-mandatory gap-4 overflow-x-auto px-[var(--pad-x)] pb-4 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0">
        {CARDS.map((c) => (
          <li key={c.label} className={`w-[70vw] shrink-0 snap-start sm:w-[45vw] lg:w-auto ${c.offset}`}>
            <Tilt amplitude={10} scaleOnHover={1.03}>
              <div className="relative aspect-[3/4] overflow-hidden border border-rule">
                <Img id={c.img} className="absolute inset-0" imgClassName={c.position ?? ""} sizes="(min-width: 1024px) 25vw, 70vw" quiet />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-paper/90 to-transparent" aria-hidden />
                <p className="font-display absolute bottom-0 left-0 text-2xl [transform:translateZ(30px)]" style={{ padding: "var(--feature-pad)" }}>
                  {c.label}
                </p>
              </div>
            </Tilt>
          </li>
        ))}
      </ul>
    </Section>
  );
}
