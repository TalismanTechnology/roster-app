"use client";

import React, { useState, useEffect, useRef, type ReactNode, type HTMLAttributes } from 'react';
import { useReducedMotion } from 'motion/react';

import { useFinePointer } from './useFinePointer';

interface MagnetProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: number;
  disabled?: boolean;
  magnetStrength?: number;
  activeTransition?: string;
  inactiveTransition?: string;
  wrapperClassName?: string;
  innerClassName?: string;
}

const Magnet: React.FC<MagnetProps> = ({
  children,
  padding = 100,
  disabled = false,
  magnetStrength = 2,
  activeTransition = 'transform 0.3s ease-out',
  inactiveTransition = 'transform 0.5s ease-in-out',
  wrapperClassName = '',
  innerClassName = '',
  ...props
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const magnetRef = useRef<HTMLDivElement>(null);
  // Under reduced motion, and on touch screens, the magnet is simply off:
  // no listener, no transform.
  const prefersReduced = useReducedMotion();
  const isFine = useFinePointer();
  const isOff = disabled || prefersReduced === true || !isFine;

  useEffect(() => {
    if (isOff) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!magnetRef.current) return;

      const { left, top, width, height } = magnetRef.current.getBoundingClientRect();
      const centerX = left + width / 2;
      const centerY = top + height / 2;

      const distX = Math.abs(centerX - e.clientX);
      const distY = Math.abs(centerY - e.clientY);

      if (distX < width / 2 + padding && distY < height / 2 + padding) {
        setIsActive(true);
        const offsetX = (e.clientX - centerX) / magnetStrength;
        const offsetY = (e.clientY - centerY) / magnetStrength;
        setPosition({ x: offsetX, y: offsetY });
      } else {
        setIsActive(false);
        setPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [padding, isOff, magnetStrength]);

  const transitionStyle = isActive ? activeTransition : inactiveTransition;
  // Off reads as centered without a state write in the effect.
  const offset = isOff ? { x: 0, y: 0 } : position;

  return (
    <div
      ref={magnetRef}
      className={`relative inline-block ${wrapperClassName}`}
      {...props}
    >
      <div
        className={innerClassName}
        style={{
          transform: isOff ? undefined : `translate3d(${offset.x}px, ${offset.y}px, 0)`,
          transition: isOff ? undefined : transitionStyle,
          willChange: isOff ? undefined : 'transform'
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default Magnet;
