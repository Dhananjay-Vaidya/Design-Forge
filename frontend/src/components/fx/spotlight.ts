import type { PointerEvent } from "react";

/** Tracks the pointer into --mx/--my so `.spotlight` can paint a glow and a lit border under it. */
export function trackSpotlight(e: PointerEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
}
