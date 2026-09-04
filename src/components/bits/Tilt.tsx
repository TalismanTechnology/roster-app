"use client";

import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, type SpringOptions } from "motion/react";

const SPRING: SpringOptions = { damping: 30, stiffness: 100, mass: 2 };

type Props = {
  children: ReactNode;
  className?: string;
  /** Max tilt in degrees. */
  amplitude?: number;
  scaleOnHover?: number;
};

/** Adapted from React Bits' TiltedCard (MIT): the same spring-driven 3D tilt,
 *  but it wraps arbitrary children and sizes to its container instead of a
 *  fixed-pixel image. Children with `[transform:translateZ(…)]` float above
 *  the surface. */
export function Tilt({ children, className = '', amplitude = 8, scaleOnHover = 1.02 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), SPRING);
  const rotateY = useSpring(useMotionValue(0), SPRING);
  const scale = useSpring(1, SPRING);

  const reset = () => {
    rotateX.set(0);
    rotateY.set(0);
    scale.set(1);
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    const ox = e.clientX - rect.left - rect.width / 2;
    const oy = e.clientY - rect.top - rect.height / 2;
    rotateX.set((oy / (rect.height / 2)) * -amplitude);
    rotateY.set((ox / (rect.width / 2)) * amplitude);
  };

  return (
    <div
      ref={ref}
      className={`[perspective:900px] ${className}`}
      onMouseMove={onMove}
      onMouseEnter={() => scale.set(scaleOnHover)}
      onMouseLeave={reset}
    >
      <motion.div className="size-full [transform-style:preserve-3d] will-change-transform" style={{ rotateX, rotateY, scale }}>
        {children}
      </motion.div>
    </div>
  );
}
