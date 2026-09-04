"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

type Tag = "div" | "section" | "article" | "li" | "aside";

/**
 * Fades its content up the first time it scrolls into view. Pairs with the
 * `.reveal` rules in globals.css; under prefers-reduced-motion it shows
 * immediately. Server pages wrap a section in this instead of importing a
 * hook, so they stay Server Components.
 */
export function Reveal({
  children,
  as = "div",
  className = "",
  threshold = 0.15,
  ...rest
}: {
  children: ReactNode;
  as?: Tag;
  className?: string;
  threshold?: number;
} & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLDivElement>(null);
  // Every tag in `Tag` takes the same ref and attributes as a div; narrowing
  // the element type here keeps the JSX below fully typed without a cast per tag.
  const Component = as as "div";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.shown = "";
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.shown = "";
        io.disconnect();
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return (
    <Component ref={ref} className={`reveal ${className}`} {...rest}>
      {children}
    </Component>
  );
}
