import type { PointerEvent } from "react";

/** Tracks the pointer into --mx/--my so `.spotlight` can paint a glow and a lit border under it. */
export function trackSpotlight(e: PointerEvent<HTMLElement>) {
  if (
    !window.matchMedia?.(
      "(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    ).matches
  )
    return;
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
}
