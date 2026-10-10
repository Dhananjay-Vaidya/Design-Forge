/** Capability gate for the hero node network (doc 21). Kept apart from the component file. */

export const CAPABLE_QUERY = "(min-width: 1024px) and (pointer: fine)";
export const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false;
}

/**
 * Can the scene run off the main thread? Needs Workers, OffscreenCanvas and a WebGL API. This only
 * checks that the APIs exist (cheap, no GL context is created on the main thread); if WebGL then
 * fails inside the worker, the component falls back to the static hero.
 */
export function supportsOffscreenWebGL(): boolean {
  return (
    typeof Worker === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "transferControlToOffscreen" in HTMLCanvasElement.prototype &&
    (typeof WebGL2RenderingContext === "function" || typeof WebGLRenderingContext === "function")
  );
}

/** Desktop, fine pointer, motion allowed, off-main-thread WebGL possible. Else: the static hero. */
export function canRenderSynapse(): boolean {
  return matches(CAPABLE_QUERY) && !matches(REDUCED_QUERY) && supportsOffscreenWebGL();
}
