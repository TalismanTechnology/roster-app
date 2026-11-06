"use client";

import { useEffect, useRef } from 'react';

// BG_IMAGE_1: black-and-white base, always visible.
// BG_IMAGE_2: full-colour version of the same frame, revealed inside the cursor spotlight.
export const BG_IMAGE_1 = '/img/bg-base.jpg';
export const BG_IMAGE_2 = '/img/bg-reveal.jpg';

const EASE_CURSOR = 0.1;
const EASE_PARALLAX = 0.06;
const PARALLAX_RANGE = 16;

const spotlightRadius = () =>
  Math.round(Math.min(420, Math.max(160, window.innerWidth * 0.16)));

const gridCell = () =>
  Math.round(Math.min(64, Math.max(36, window.innerWidth * 0.028)));

/** Fills its nearest positioned ancestor. Mouse coordinates are taken
 *  relative to that container so the effect stays correct once the page
 *  scrolls. */
export function ImageRevealBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const patternRef = useRef<SVGPatternElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const smoothRef = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!container || !ctx) return;

    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width));
      canvas.height = Math.max(1, Math.round(rect.height));
      const cell = gridCell();
      patternRef.current?.setAttribute('width', String(cell));
      patternRef.current?.setAttribute('height', String(cell));
      pathRef.current?.setAttribute('d', `M ${cell} 0 L 0 0 0 ${cell}`);
    };

    syncSize();
    // Rest at the container's centre until the first move
    mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
    smoothRef.current = { ...mouseRef.current };

    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    // One frame of the effect: ease toward the cursor, redraw the mask, drift the grid.
    const draw = () => {
      const mouse = mouseRef.current;
      const smooth = smoothRef.current;
      smooth.x += (mouse.x - smooth.x) * EASE_CURSOR;
      smooth.y += (mouse.y - smooth.y) * EASE_CURSOR;

      const radius = spotlightRadius();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const g = ctx.createRadialGradient(smooth.x, smooth.y, 0, smooth.x, smooth.y, radius);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,1)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.75)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.4)');
      g.addColorStop(0.88, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const mask = `url(${canvas.toDataURL()})`;
      if (revealRef.current) {
        revealRef.current.style.maskImage = mask;
        revealRef.current.style.webkitMaskImage = mask;
      }

      // Parallax grid: normalise cursor to −0.5…0.5, ease toward ±16px
      const cx = smooth.x / canvas.width - 0.5;
      const cy = smooth.y / canvas.height - 0.5;
      const offset = offsetRef.current;
      offset.x += (cx * PARALLAX_RANGE - offset.x) * EASE_PARALLAX;
      offset.y += (cy * PARALLAX_RANGE - offset.y) * EASE_PARALLAX;
      patternRef.current?.setAttribute('x', offset.x.toFixed(2));
      patternRef.current?.setAttribute('y', offset.y.toFixed(2));
    };

    // Reduced motion, or no cursor to follow (a tablet at lg width): a still
    // frame, the spotlight resting at the centre. No tracking, no loop; a
    // resize just redraws the still.
    const isStill =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (isStill) {
      const still = () => {
        syncSize();
        mouseRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
        smoothRef.current = { ...mouseRef.current };
        draw();
      };
      still();
      window.addEventListener('resize', still);
      return () => window.removeEventListener('resize', still);
    }

    let frame = 0;
    const tick = () => {
      draw();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    // Run only while the hero is on screen. Below lg the container is
    // display:none, which never intersects, so phones never start the loop.
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()));
    io.observe(container);

    window.addEventListener('resize', syncSize);
    window.addEventListener('mousemove', onMove);

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener('resize', syncSize);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  const layer = (url: string) => ({
    backgroundImage: `url('${url}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  });

  return (
    <div ref={containerRef} className="hidden lg:block absolute inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={layer(BG_IMAGE_1)} />
      <div
        ref={revealRef}
        className="absolute inset-0"
        style={{ ...layer(BG_IMAGE_2), maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }}
      />
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.1 }}>
        <defs>
          <pattern ref={patternRef} id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path ref={pathRef} d="M 48 0 L 0 0 0 48" fill="none" stroke="#64748b" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      {/* Fade the photo into the page so the next section starts on solid paper */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-paper" />
    </div>
  );
}
