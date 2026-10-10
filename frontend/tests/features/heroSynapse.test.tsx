import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeroSynapse } from "@/features/landing/hero/HeroSynapse";
import {
  buildLinks,
  parseRgbToken,
  pulseWeight,
  scatter,
  seededRandom,
} from "@/features/landing/hero/synapseMath";

describe("synapseMath", () => {
  const points = scatter(140, { x: 640, y: 360, z: 220 }, seededRandom(7));

  it("is deterministic for a seed", () => {
    expect(scatter(5, { x: 1, y: 1, z: 1 }, seededRandom(1))).toEqual(
      scatter(5, { x: 1, y: 1, z: 1 }, seededRandom(1)),
    );
  });

  it("links only nearby nodes, each pair once, and caps links per node", () => {
    const links = buildLinks(points, 95, 3);
    const degree = new Array(points.length).fill(0);
    const ids = new Set<string>();
    for (const [i, j] of links) {
      expect(i).toBeLessThan(j);
      const [p, q] = [points[i], points[j]];
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThanOrEqual(95);
      ids.add(`${i}-${j}`);
      degree[i]++;
      degree[j]++;
    }
    expect(ids.size).toBe(links.length);
    expect(Math.max(...degree)).toBeLessThanOrEqual(3);
    expect(links.length).toBeGreaterThan(50); // the network is actually connected-looking
    expect(links.length).toBeLessThanOrEqual((140 * 3) / 2);
  });

  it("finds exactly the brute-force pairs when the cap doesn't bind", () => {
    const small = scatter(60, { x: 300, y: 200, z: 100 }, seededRandom(3));
    const brute: string[] = [];
    for (let i = 0; i < small.length; i++)
      for (let j = i + 1; j < small.length; j++) {
        const [p, q] = [small[i], small[j]];
        if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= 80) brute.push(`${i}-${j}`);
      }
    const grid = buildLinks(small, 80, 1000).map(([i, j]) => `${i}-${j}`);
    expect(grid.sort()).toEqual(brute.sort());
  });

  it("reads design-token colours and rejects junk", () => {
    expect(parseRgbToken(" 0 111 103 ")).toEqual([0, 111 / 255, 103 / 255]);
    expect(parseRgbToken("120, 52, 232")).toEqual([120 / 255, 52 / 255, 232 / 255]);
    expect(parseRgbToken("")).toBeNull();
    expect(parseRgbToken("teal")).toBeNull();
  });

  it("pulses smoothly from full at the centre to nothing at the edge", () => {
    expect(pulseWeight(0, 100)).toBe(1);
    expect(pulseWeight(100, 100)).toBe(0);
    expect(pulseWeight(250, 100)).toBe(0);
    expect(pulseWeight(25, 100)).toBeGreaterThan(pulseWeight(75, 100));
  });
});

describe("HeroSynapse (worker + OffscreenCanvas)", () => {
  type Msg = { type: string; [k: string]: unknown };
  class FakeWorker {
    static last: FakeWorker | null = null;
    messages: Msg[] = [];
    transfers: unknown[][] = [];
    terminated = false;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      FakeWorker.last = this;
    }
    postMessage(message: Msg, transfer: unknown[] = []) {
      this.messages.push(message);
      this.transfers.push(transfer);
    }
    terminate() {
      this.terminated = true;
    }
  }
  class NoopObserver {
    observe() {}
    disconnect() {}
  }
  const saved: Record<string, unknown> = {};
  const GLOBALS = [
    "matchMedia",
    "Worker",
    "OffscreenCanvas",
    "WebGLRenderingContext",
    "ResizeObserver",
    "IntersectionObserver",
    "requestIdleCallback",
    "cancelIdleCallback",
  ] as const;

  function stubEnvironment({ desktop = true, reduced = false, offscreen = true } = {}) {
    const media: Record<string, boolean> = {
      "(min-width: 1024px) and (pointer: fine)": desktop,
      "(prefers-reduced-motion: reduce)": reduced,
    };
    const w = window as unknown as Record<string, unknown>;
    w.matchMedia = (query: string) => ({
      matches: media[query] ?? false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    w.Worker = FakeWorker;
    w.WebGLRenderingContext = function WebGLRenderingContext() {};
    w.ResizeObserver = NoopObserver;
    w.IntersectionObserver = NoopObserver;
    // Fire "idle" work immediately so the deferred start runs inside the test.
    w.requestIdleCallback = (cb: () => void) => {
      cb();
      return 1;
    };
    w.cancelIdleCallback = vi.fn();
    if (offscreen) {
      w.OffscreenCanvas = function OffscreenCanvas() {};
      (
        HTMLCanvasElement.prototype as unknown as Record<string, unknown>
      ).transferControlToOffscreen = () => ({ offscreen: true });
    }
  }

  beforeEach(() => {
    FakeWorker.last = null;
    const w = window as unknown as Record<string, unknown>;
    GLOBALS.forEach((k) => (saved[k] = w[k]));
  });
  afterEach(() => {
    cleanup(); // unmount while the stubs still exist
    const w = window as unknown as Record<string, unknown>;
    GLOBALS.forEach((k) => {
      if (saved[k] === undefined) delete w[k];
      else w[k] = saved[k];
    });
    delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>)
      .transferControlToOffscreen;
    document.documentElement.classList.remove("dark");
    document.documentElement.removeAttribute("data-effects-paused");
  });

  it("hands a transferred canvas to a worker, decoratively, and cleans up on unmount", () => {
    stubEnvironment();
    const { unmount } = render(<HeroSynapse />);
    const host = screen.getByTestId("hero-synapse");
    expect(host).toHaveAttribute("aria-hidden", "true");
    expect(host.className).toContain("pointer-events-none");

    const worker = FakeWorker.last!;
    const init = worker.messages[0];
    expect(init.type).toBe("init");
    expect(init.canvas).toEqual({ offscreen: true });
    expect(worker.transfers[0]).toEqual([{ offscreen: true }]); // ownership moves to the worker
    expect((init.theme as { dark: boolean }).dark).toBe(false);
    const canvas = host.querySelector("canvas")!;
    expect(canvas).toHaveAttribute("aria-hidden", "true");

    unmount();
    expect(worker.messages.at(-1)).toEqual({ type: "dispose" });
    expect(worker.terminated).toBe(true);
    expect(canvas.isConnected).toBe(false);
  });

  it("sends the new theme only after the toggled frame, and pauses with effects paused", async () => {
    stubEnvironment();
    render(<HeroSynapse />);
    const worker = FakeWorker.last!;
    document.documentElement.classList.add("dark");
    await waitFor(() =>
      expect(
        worker.messages.some((m) => m.type === "theme" && (m.theme as { dark: boolean }).dark),
      ).toBe(true),
    );
    document.documentElement.setAttribute("data-effects-paused", "");
    await waitFor(() => expect(worker.messages.at(-1)).toEqual({ type: "run", on: false }));
  });

  it("falls back silently when WebGL fails inside the worker", async () => {
    stubEnvironment();
    render(<HeroSynapse />);
    FakeWorker.last!.onmessage?.({ data: { type: "error" } });
    await waitFor(() => expect(screen.queryByTestId("hero-synapse")).toBeNull());
  });

  it.each([
    ["a phone or tablet", { desktop: false }],
    ["reduced motion", { reduced: true }],
    ["no OffscreenCanvas", { offscreen: false }],
  ])("renders nothing for %s, leaving the static hero", (_label, env) => {
    stubEnvironment(env);
    render(<HeroSynapse />);
    expect(screen.queryByTestId("hero-synapse")).toBeNull();
    expect(FakeWorker.last).toBeNull();
  });

  it("renders nothing where matchMedia doesn't exist", () => {
    render(<HeroSynapse />);
    expect(screen.queryByTestId("hero-synapse")).toBeNull();
  });
});
