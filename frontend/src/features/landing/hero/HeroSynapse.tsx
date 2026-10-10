import { useEffect, useRef, useState } from "react";

import { CAPABLE_QUERY, canRenderSynapse, REDUCED_QUERY } from "./capability";
import type { SynapseScene } from "./synapseScene";

function useCapable(): boolean {
  const [capable, setCapable] = useState(() => canRenderSynapse());
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const queries = [window.matchMedia(CAPABLE_QUERY), window.matchMedia(REDUCED_QUERY)];
    const update = () => setCapable(canRenderSynapse());
    queries.forEach((q) => q.addEventListener("change", update));
    return () => queries.forEach((q) => q.removeEventListener("change", update));
  }, []);
  return capable;
}

/**
 * The 3D node network behind the landing hero (doc 21). Decorative only: aria-hidden, no pointer
 * events, behind the hero copy. three.js is fetched on demand; until it arrives, or if anything fails,
 * this renders nothing and the existing hero (aurora + the decision-network schematic) stands alone.
 */
export function HeroSynapse() {
  const capable = useCapable();
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!capable || failed || !container) return;
    let scene: SynapseScene | null = null;
    let cancelled = false;
    const start = () => {
      import("./synapseScene")
        .then(({ createSynapseScene }) => {
          if (cancelled) return;
          scene = createSynapseScene(container);
        })
        .catch(() => {
          if (!cancelled) setFailed(true); // chunk failed to load or WebGL init threw: stay static
        });
    };
    // Fetch three.js only once the page is idle, so it never competes with the first paint.
    const hasIdle = "requestIdleCallback" in window;
    const idle = hasIdle
      ? window.requestIdleCallback(start, { timeout: 1500 })
      : window.setTimeout(start, 1500);
    return () => {
      cancelled = true;
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      scene?.dispose();
    };
  }, [capable, failed]);

  if (!capable || failed) return null;
  return (
    <div
      ref={host}
      aria-hidden="true"
      data-testid="hero-synapse"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:radial-gradient(ellipse_60%_75%_at_74%_45%,black_30%,transparent_75%)]"
    />
  );
}
