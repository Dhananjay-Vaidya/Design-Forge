import { useEffect, useRef, useState } from "react";

import { CAPABLE_QUERY, canRenderSynapse, REDUCED_QUERY } from "./capability";
import type { CoreTheme, Rgb } from "./synapseCore";
import type { FromWorker, ToWorker } from "./synapse.worker";
import { parseRgbToken } from "./synapseMath";

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

function readTheme(): CoreTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: Rgb): Rgb =>
    parseRgbToken(style.getPropertyValue(name)) ?? fallback;
  return {
    teal: token("--color-primary", [0, 0.44, 0.4]),
    violet: token("--color-ai", [0.47, 0.2, 0.91]),
    dark: document.documentElement.classList.contains("dark"),
  };
}

const shouldRun = (onScreen: boolean) =>
  onScreen && !document.hidden && !document.documentElement.hasAttribute("data-effects-paused");

/**
 * The 3D node network behind the landing hero (doc 21). Decorative only: aria-hidden, no pointer
 * events, behind the hero copy. All three.js work runs in a Web Worker on an OffscreenCanvas, started
 * once the page is idle; this component only forwards size, pointer, theme and pause state. If anything
 * is unsupported or fails, it renders nothing and the existing static hero stands alone.
 */
export function HeroSynapse() {
  const capable = useCapable();
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!capable || failed || !container) return;

    let worker: Worker | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let onScreen = true;
    let rect = container.getBoundingClientRect();
    let pointerFrame = 0;
    let pendingPointer: { x: number | null; y: number | null } | null = null;
    let themeFrame = 0;
    let themeTimer = 0;
    const cleanups: (() => void)[] = [];
    const send = (message: ToWorker, transfer: Transferable[] = []) =>
      worker?.postMessage(message, transfer);
    const syncRunning = () => send({ type: "run", on: shouldRun(onScreen) });

    const start = () => {
      try {
        canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.cssText = "display:block;width:100%;height:100%";
        container.appendChild(canvas);
        const offscreen = canvas.transferControlToOffscreen();
        worker = new Worker(new URL("./synapse.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
          if (data.type === "error") setFailed(true);
        };
        worker.onerror = () => setFailed(true);
        send(
          {
            type: "init",
            canvas: offscreen,
            width: container.clientWidth,
            height: container.clientHeight,
            pixelRatio: window.devicePixelRatio || 1,
            theme: readTheme(),
            running: shouldRun(onScreen),
          },
          [offscreen],
        );
      } catch {
        setFailed(true);
        return;
      }

      // Size.
      const resizeObserver = new ResizeObserver(() => {
        rect = container.getBoundingClientRect();
        send({
          type: "resize",
          width: container.clientWidth,
          height: container.clientHeight,
          pixelRatio: window.devicePixelRatio || 1,
        });
      });
      resizeObserver.observe(container);
      cleanups.push(() => resizeObserver.disconnect());

      // Pointer: cached rect (no layout reads per move), at most one message per frame.
      const onScroll = () => {
        rect = container.getBoundingClientRect();
      };
      const onPointerMove = (event: PointerEvent) => {
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        pendingPointer = inside
          ? {
              x: (event.clientX - rect.left) / rect.width,
              y: (event.clientY - rect.top) / rect.height,
            }
          : { x: null, y: null };
        if (pointerFrame === 0) {
          pointerFrame = requestAnimationFrame(() => {
            pointerFrame = 0;
            if (pendingPointer) send({ type: "pointer", ...pendingPointer });
          });
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      cleanups.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("pointermove", onPointerMove);
        cancelAnimationFrame(pointerFrame);
      });

      // Pause offscreen, on a hidden tab, or when effects are paused.
      const intersection = new IntersectionObserver(([entry]) => {
        onScreen = entry?.isIntersecting ?? true;
        syncRunning();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", syncRunning);
      // Theme: read the tokens after the toggled frame has painted, never inside it.
      const rootObserver = new MutationObserver((records) => {
        if (records.some((r) => r.attributeName === "class")) {
          cancelAnimationFrame(themeFrame);
          window.clearTimeout(themeTimer);
          themeFrame = requestAnimationFrame(() => {
            themeTimer = window.setTimeout(() => send({ type: "theme", theme: readTheme() }), 0);
          });
        }
        syncRunning();
      });
      rootObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-effects-paused"],
      });
      cleanups.push(() => {
        intersection.disconnect();
        rootObserver.disconnect();
        document.removeEventListener("visibilitychange", syncRunning);
        cancelAnimationFrame(themeFrame);
        window.clearTimeout(themeTimer);
      });
    };

    // Start only once the page is idle, so it never competes with the first paint.
    const hasIdle = "requestIdleCallback" in window;
    const idle = hasIdle
      ? window.requestIdleCallback(start, { timeout: 1500 })
      : window.setTimeout(start, 1500);

    return () => {
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      cleanups.forEach((fn) => fn());
      send({ type: "dispose" });
      worker?.terminate();
      canvas?.remove();
    };
  }, [capable, failed]);

  if (!capable || failed) return null;
  return (
    <div
      ref={host}
      aria-hidden="true"
      data-testid="hero-synapse"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    />
  );
}
