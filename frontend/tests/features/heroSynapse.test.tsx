import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeroSynapse } from "@/features/landing/hero/HeroSynapse";
import {
  buildLinks,
  parseRgbToken,
  pulseWeight,
  scatter,
  seededRandom,
} from "@/features/landing/hero/synapseMath";
import * as sceneModule from "@/features/landing/hero/synapseScene";

vi.mock("@/features/landing/hero/synapseScene", () => ({ createSynapseScene: vi.fn() }));

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

describe("HeroSynapse", () => {
  const create = vi.mocked(sceneModule.createSynapseScene);
  const dispose = vi.fn();
  let media: Record<string, boolean>;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  function stubEnvironment({ desktop = true, reduced = false, webgl = true } = {}) {
    media = {
      "(min-width: 1024px) and (pointer: fine)": desktop,
      "(prefers-reduced-motion: reduce)": reduced,
    };
    window.matchMedia = vi.fn((query: string) => ({
      matches: media[query] ?? false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    // Fire "idle" work immediately so the deferred three.js import runs inside the test.
    window.requestIdleCallback = ((cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 });
      return 1;
    }) as typeof window.requestIdleCallback;
    window.cancelIdleCallback = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() =>
      webgl
        ? ({ getExtension: () => ({ loseContext: vi.fn() }) } as unknown as RenderingContext)
        : null,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  }

  beforeEach(() => {
    create.mockReset();
    dispose.mockReset();
    create.mockReturnValue({ dispose });
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    // @ts-expect-error jsdom has no matchMedia; remove the stub again
    delete window.matchMedia;
    // @ts-expect-error jsdom has no idle callbacks either
    delete window.requestIdleCallback;
  });

  it("loads the scene on a capable desktop, decoratively, and disposes it on unmount", async () => {
    stubEnvironment();
    const { unmount } = render(<HeroSynapse />);
    const host = screen.getByTestId("hero-synapse");
    expect(host).toHaveAttribute("aria-hidden", "true");
    expect(host.className).toContain("pointer-events-none");
    await waitFor(() => expect(create).toHaveBeenCalledWith(host));
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a phone or tablet", { desktop: false }],
    ["reduced motion", { reduced: true }],
    ["no WebGL", { webgl: false }],
  ])("renders nothing for %s, leaving the static hero", async (_label, env) => {
    stubEnvironment(env);
    render(<HeroSynapse />);
    expect(screen.queryByTestId("hero-synapse")).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(create).not.toHaveBeenCalled();
  });

  it("renders nothing where matchMedia doesn't exist", () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
    render(<HeroSynapse />);
    expect(screen.queryByTestId("hero-synapse")).toBeNull();
  });

  it("falls back silently when the scene fails to start", async () => {
    stubEnvironment();
    create.mockImplementation(() => {
      throw new Error("WebGL context lost");
    });
    render(<HeroSynapse />);
    await waitFor(() => expect(screen.queryByTestId("hero-synapse")).toBeNull());
  });
});
