import Magnet from "@/components/bits/Magnet";
import { Button } from "@/components/ui/Button";
import { Img } from "@/components/ui/Img";
import { Checker, Corner, CORNER } from "@/components/ui/marks";
import { Reveal } from "@/components/ui/Reveal";

export function FinalCta({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <Reveal as="section" aria-labelledby="cta-title" className="relative flex min-h-[70svh] items-end overflow-hidden">
      <div className="absolute inset-0" aria-hidden>
        <Img id="09" className="absolute inset-0" imgClassName="opacity-70" sizes="100vw" quiet />
        <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/30 to-paper" />
      </div>

      <div
        className="relative z-10 flex w-full flex-col gap-8 lg:flex-row lg:items-end lg:justify-between"
        style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}
      >
        <div>
          <Corner d={CORNER.tl} />
          <h2 id="cta-title" className="font-display mt-4 flex items-end gap-4 leading-none tracking-tight" style={{ fontSize: "var(--text-headline)" }}>
            Get found.
            <Checker />
          </h2>
          <Corner d={CORNER.bl} className="mt-4" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Magnet padding={40} magnetStrength={6} wrapperClassName="max-sm:block">
            <Button href={signedIn ? "/resume" : "/sign-up"} variant="primary" arrow className="max-sm:w-full">
              {signedIn ? "Open your resume" : "Create your resume"}
            </Button>
          </Magnet>
          <Button href="/search" className="max-sm:w-full">Find athletes</Button>
        </div>
      </div>
    </Reveal>
  );
}
