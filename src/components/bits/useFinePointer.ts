"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(hover: hover) and (pointer: fine)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Whether the primary input is a mouse or trackpad. Cursor-following
 * effects (magnet, tilt, spotlight) run only when it is: on a phone a tap
 * fires emulated mouse events that leave them stuck mid-effect. False on
 * the server, so the first paint is the plain, touch-safe version.
 */
export function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
