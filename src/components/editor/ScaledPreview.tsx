"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A page shown at a fraction of its size. The content is laid out at
 * 1/scale of the column's width — so it wraps exactly as it would on a
 * page that wide — then scaled down from its top-left corner. A transform
 * doesn't change layout size, so the frame takes its height from the
 * measured content times the scale; without that the column would scroll
 * on through the empty space the unscaled page still occupies.
 *
 * Replaces CSS `zoom`, which rescales layout itself and differs between
 * engines (and in how it treats viewport units and sticky children).
 */
export function ScaledPreview({ scale, children }: { scale: number; children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    // Re-measures on every content change the server sends after a save,
    // and on column resizes, which re-wrap the page.
    const observer = new ResizeObserver(() => setHeight(inner.offsetHeight * scale));
    observer.observe(inner);
    return () => observer.disconnect();
  }, [scale]);

  return (
    <div className="relative overflow-hidden" style={{ height: height ?? undefined }}>
      <div
        ref={innerRef}
        style={{
          width: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
