import type { ReactNode } from "react";

import { Img, type ImageId } from "@/components/ui/Img";
import { Corner, CORNER, Frame } from "@/components/ui/marks";
import { Site } from "@/components/shell/Site";

/**
 * The auth split: the form in a frame on the left, a photograph under a
 * gradient on the right. The photograph changes with the moment — the
 * tunnel for arriving, the coach for signing in.
 */
export function AuthLayout({
  label,
  title,
  lede,
  image,
  children,
  below,
}: {
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  image: ImageId;
  children: ReactNode;
  below?: ReactNode;
}) {
  return (
    <Site footer={false}>
      <main className="grid min-h-[calc(100svh-var(--header-h))] lg:grid-cols-12">
        <section
          className="flex flex-col justify-center lg:col-span-6"
          style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}
        >
          <div className="mx-auto w-full max-w-md">
            <p className="label flex items-center gap-2 text-ink-muted">
              <Corner d={CORNER.tl} />
              {label}
            </p>
            <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">{title}</h1>
            {lede && <p className="mt-4 leading-relaxed text-ink-muted">{lede}</p>}

            <Frame as="div" className="mt-10">
              <div className="p-6 sm:p-8">{children}</div>
            </Frame>

            {below && <div className="mt-8 text-sm text-ink-muted">{below}</div>}
          </div>
        </section>

        <aside className="relative hidden lg:col-span-6 lg:block" aria-hidden>
          <Img id={image} className="absolute inset-0" sizes="50vw" quiet imgClassName="opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-paper to-transparent" />
        </aside>
      </main>
    </Site>
  );
}
