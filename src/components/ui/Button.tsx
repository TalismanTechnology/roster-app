import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowUpRight } from "./marks";

type Variant = "primary" | "outline" | "ghost";

type Props = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
  /** Show the up-right arrow that nudges on hover. */
  arrow?: boolean;
  className?: string;
};

const VARIANT: Record<Variant, string> = {
  primary: "btn-primary",
  outline: "btn-outline",
  ghost: "btn-ghost",
};

/**
 * Link styled as a button. Internal paths go through next/link; anything
 * else (mailto:, external) is a plain anchor.
 */
export function Button({
  href,
  children,
  variant = "outline",
  size = "md",
  arrow = false,
  className = "",
}: Props) {
  const classes = `group ${VARIANT[variant]} ${size === "sm" ? "min-h-9 px-3.5 py-1.5 text-sm" : ""} ${className}`;
  const content = (
    <>
      {children}
      {arrow && (
        <ArrowUpRight className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      )}
    </>
  );

  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <a href={href} className={classes} rel="noopener noreferrer">
      {content}
    </a>
  );
}
