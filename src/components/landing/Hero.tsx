"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The Cover — the signed-out landing hero.
 *
 * A full-viewport night-track frame with the product's one display headline.
 * All interaction here is atmosphere, not chrome: the floodlight follows the
 * pointer across the letterforms, the backdrop parallaxes in layers, and the
 * boxed CTAs lean toward the cursor. Every effect degrades to a designed
 * still — touch devices get a self-running light sweep, reduced motion gets
 * the lit frame with nothing moving.
 *
 * Styles live in hero.css (imported via globals.css); the palette is scoped
 * to `.hero` so the paper/ink system below the fold is untouched.
 */

/** What belongs on a record — categories, not invented athletes. */
const TICKER_ITEMS = [
  "Personal records",
  "Meet results",
  "Game film",
  "Coach references",
  "GPA / test scores",
  "Season stats",
  "Awards",
  "Transcript-ready",
  "Verified marks",
  "One link",
];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  /**
   * One passive pointer listener drives both effects: --px/--py (0–1 across
   * the hero) for backdrop parallax, --hx/--hy (percentages across the
   * headline box) for the floodlight. Rects are cached and remeasured on
   * scroll/resize; writes are coalesced into one frame.
   */
  useEffect(() => {
    const hero = heroRef.current;
    const title = titleRef.current;
    if (!hero || !title) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let heroRect = hero.getBoundingClientRect();
    let titleRect = title.getBoundingClientRect();
    let moveFrame = 0;
    let measureFrame = 0;

    const measure = () => {
      measureFrame = 0;
      heroRect = hero.getBoundingClientRect();
      titleRect = title.getBoundingClientRect();
    };

    const scheduleMeasure = () => {
      if (!measureFrame) measureFrame = requestAnimationFrame(measure);
    };

    const onMove = (event: PointerEvent) => {
      const { clientX, clientY } = event;
      if (moveFrame) return;
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0;
        hero.dataset.pointer = "true";

        const px = clamp01((clientX - heroRect.left) / heroRect.width);
        const py = clamp01((clientY - heroRect.top) / heroRect.height);
        hero.style.setProperty("--px", px.toFixed(3));
        hero.style.setProperty("--py", py.toFixed(3));

        const hx = ((clientX - titleRect.left) / titleRect.width) * 100;
        const hy = ((clientY - titleRect.top) / titleRect.height) * 100;
        title.style.setProperty("--hx", `${hx.toFixed(1)}%`);
        title.style.setProperty("--hy", `${hy.toFixed(1)}%`);
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      if (moveFrame) cancelAnimationFrame(moveFrame);
      if (measureFrame) cancelAnimationFrame(measureFrame);
    };
  }, []);

  return (
    <section ref={heroRef} className="hero">
      <div className="hero__backdrop" aria-hidden="true">
        <div className="hero__photo" />
        <div className="hero__glow" />
        <div className="hero__lanes" />
        <div className="hero__scrim" />
        <span className="hero__lane-number">04</span>
        <div className="hero__grain" />
      </div>

      <header className="hero__bar">
        <p className="hero__wordmark">
          Roster<span>.</span>
        </p>

        <nav className="hero__nav" aria-label="Landing">
          <Link href="/preview" className="hero__nav-link">
            The record
          </Link>
          <Link href="/sign-in" className="hero__nav-link hero__nav-link--secondary">
            Sign in
          </Link>
          <Magnetic href="/sign-up" className="hero__boxed">
            <span className="hero__boxed-label">Start free</span>
            <span className="hero__boxed-arrow" aria-hidden="true">
              ↗
            </span>
          </Magnetic>
        </nav>
      </header>

      <div className="hero__meta">
        <p className="hero__meta-item">
          <span className="hero__dot" aria-hidden="true" />
          The public record for serious athletes
        </p>
        <p className="hero__meta-item">Free for athletes / 2026</p>
      </div>

      <div className="hero__stage">
        <p className="hero__kicker">High school. Club. College.</p>

        <h1 ref={titleRef} className="hero__title">
          <span className="hero__title-copy hero__title-lit" aria-hidden="true">
            Build
            <br />
            your
            <br />
            name.
          </span>
          <span className="hero__title-copy hero__title-flat">
            Build
            <br />
            your
            <br />
            name.
          </span>
        </h1>

        <div className="hero__actions">
          <Magnetic href="/sign-up" className="hero__cta">
            Build your resume
            <span className="hero__cta-arrow" aria-hidden="true">
              →
            </span>
          </Magnetic>
          <Link href="/preview" className="hero__ghost">
            See a real one →
          </Link>
        </div>
      </div>

      <div className="hero__foot">
        <div className="hero__ticker" aria-hidden="true">
          <div className="hero__ticker-track">
            {[0, 1].map((copy) => (
              <ul key={copy} className="hero__ticker-list">
                {TICKER_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const MAGNET_REACH = 0.22;
const MAGNET_MAX_PX = 7;

type MagneticProps = {
  href: string;
  className: string;
  children: ReactNode;
};

/**
 * A link that leans toward the cursor while it hovers and springs back when
 * it leaves. Pure transform via --tx/--ty; the CSS transition supplies the
 * spring. Pointer events on touch fire only during a tap, where the reset on
 * leave makes the whole thing a no-op.
 */
function Magnetic({ href, className, children }: MagneticProps) {
  const ref = useRef<HTMLAnchorElement>(null);

  const onPointerMove = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) * MAGNET_REACH;
    const dy = (event.clientY - (rect.top + rect.height / 2)) * MAGNET_REACH;
    const tx = Math.max(-MAGNET_MAX_PX, Math.min(MAGNET_MAX_PX, dx));
    const ty = Math.max(-MAGNET_MAX_PX, Math.min(MAGNET_MAX_PX, dy));
    el.style.setProperty("--tx", `${tx.toFixed(1)}px`);
    el.style.setProperty("--ty", `${ty.toFixed(1)}px`);
  };

  const onPointerLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tx", "0px");
    el.style.setProperty("--ty", "0px");
  };

  return (
    <Link
      ref={ref}
      href={href}
      className={className}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </Link>
  );
}
