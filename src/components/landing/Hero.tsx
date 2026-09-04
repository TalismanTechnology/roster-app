import Magnet from "@/components/bits/Magnet";
import { Button } from "@/components/ui/Button";
import { Img } from "@/components/ui/Img";
import { Checker, Corner, CORNER, Frame, Globe } from "@/components/ui/marks";

import { ImageRevealBackground } from "./ImageRevealBackground";

// One word per line; each rises out of a clipped wrapper on load.
const HEADLINE = ["The", "athlete’s", "resume."];

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-heading" className="relative flex flex-col overflow-hidden lg:min-h-svh">
      <ImageRevealBackground />

      <div
        className="relative z-10 flex flex-1 flex-col gap-10 lg:flex-row lg:items-end lg:justify-between"
        style={{
          paddingInline: "var(--pad-x)",
          paddingTop: "calc(var(--header-h) + clamp(1.25rem, 4vh, 4rem))",
          paddingBottom: "clamp(1.25rem, 4vh, 4rem)",
        }}
      >
        <div className="flex flex-col justify-center gap-4 lg:min-h-[calc(100svh-var(--header-h)-8rem)] lg:pb-[6vh]">
          <Corner d={CORNER.tl} />
          <h1 id="hero-heading" className="font-display tracking-tight" style={{ fontSize: "var(--text-headline)", lineHeight: 1.05 }}>
            {HEADLINE.map((word, i) => (
              <span key={word} className="-mb-[0.08em] block overflow-hidden pb-[0.08em]">
                <span className="hero-word flex items-end gap-4" style={{ animationDelay: `${i * 110}ms` }}>
                  {word}
                  {i === HEADLINE.length - 1 && <Checker />}
                </span>
              </span>
            ))}
          </h1>
          <Corner d={CORNER.bl} />

          <div className="hero-cta mt-2 flex flex-wrap items-center gap-3">
            <Magnet padding={40} magnetStrength={6}>
              <Button href="/sign-up" arrow>Create your resume</Button>
            </Magnet>
            <Button href="/search" variant="ghost">Find athletes</Button>
          </div>
        </div>

        <Frame as="aside" className="hero-cta flex items-center self-start lg:self-auto">
          <div
            className="flex items-center"
            style={{ minWidth: "clamp(13rem, 18vw, 20rem)", padding: "var(--feature-pad)", gap: "var(--feature-pad)" }}
          >
            <Globe />
            <p className="text-sm leading-snug">
              <span className="font-bold">Verified by coaches.</span>
              <br />
              <span className="text-ink-muted">One link. Get found.</span>
            </p>
          </div>
        </Frame>
      </div>

      {/* Below-lg: static image in place of the interactive reveal */}
      <div className="relative z-10 lg:hidden" style={{ paddingInline: "var(--pad-x)", paddingBottom: "clamp(1.25rem, 4vh, 4rem)" }}>
        <Img id="hero-base" className="aspect-[4/5] border border-rule sm:aspect-[16/9]" priority sizes="100vw" quiet />
      </div>
    </section>
  );
}
