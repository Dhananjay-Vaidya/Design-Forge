/** Capability gate for the hero node network (doc 21). Kept apart from the component file. */

export const CAPABLE_QUERY = "(min-width: 1024px) and (pointer: fine)";
export const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false;
}

/** Can this browser create a WebGL context at all? The probe context is released straight away. */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as
      WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Desktop, fine pointer, motion allowed, WebGL available. Everything else keeps the static hero. */
export function canRenderSynapse(): boolean {
  return matches(CAPABLE_QUERY) && !matches(REDUCED_QUERY) && hasWebGL();
}
