import { useSyncExternalStore } from "react";

/**
 * Pointer-driven effects (tilt, magnetic pull, coverflow) only run on desktop-sized screens with a
 * mouse and motion allowed: the same gate as the `.spotlight` glow, so the two always appear together.
 * Touch, small screens and reduced motion get the static versions.
 */
export const FINE_MOTION_QUERY =
  "(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(FINE_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function snapshot() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(FINE_MOTION_QUERY).matches
    : false;
}

export function useFineMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
