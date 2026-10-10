/**
 * The hero node network itself: three.js, no DOM. It runs inside a Web Worker on an OffscreenCanvas
 * (see synapse.worker.ts), so parsing three.js, initialising WebGL and rendering every frame all
 * happen off the main thread and can never delay a click or a keystroke (INP).
 *
 * Budget: ~140 nodes, links built once with a spatial grid (each node keeps its 3 nearest), pixel
 * ratio capped at 1.5, 60 fps cap that drops to 30 fps while frames are expensive.
 *
 * Meaning: teal nodes and links are the calculated structure (--color-primary); the violet pulse that
 * follows the cursor (or drifts on its own) is the AI-advisory layer touching it (--color-ai).
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  NormalBlending,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from "three";

import { buildLinks, edgeFade, pulseWeight, scatter, seededRandom } from "./synapseMath";

export type Rgb = [number, number, number];

export interface CoreTheme {
  teal: Rgb;
  violet: Rgb;
  dark: boolean;
}

export interface SynapseCore {
  resize(width: number, height: number, pixelRatio: number): void;
  /** Pointer position over the hero in 0..1 units, or null when it is elsewhere. */
  pointer(x: number | null, y: number | null): void;
  theme(theme: CoreTheme): void;
  run(on: boolean): void;
  dispose(): void;
}

const BOX = { x: 640, y: 360, z: 220 };
const LINK_DISTANCE = 95;
const PULSE_RADIUS = 150;
const MAX_PIXEL_RATIO = 1.5;

type FrameScheduler = (cb: (now: number) => void) => number;
const scheduleFrame: FrameScheduler =
  typeof globalThis.requestAnimationFrame === "function"
    ? (cb) => globalThis.requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
const cancelFrame = (id: number) =>
  typeof globalThis.cancelAnimationFrame === "function"
    ? globalThis.cancelAnimationFrame(id)
    : clearTimeout(id);

export function createSynapseCore(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  { particles = 140, maxLinks = 3 }: { particles?: number; maxLinks?: number } = {},
): SynapseCore {
  // Throws when WebGL is unavailable; the caller falls back to the static hero.
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 1, 1, 2000);
  camera.position.z = 420;

  // ---- nodes -----------------------------------------------------------------------------------
  const random = seededRandom(20261011);
  const homes = scatter(particles, BOX, random);
  const phase = homes.map(() => ({
    a: random() * Math.PI * 2,
    b: random() * Math.PI * 2,
    speed: 0.15 + random() * 0.25,
    amp: 6 + random() * 10,
  }));
  const positions = new Float32Array(particles * 3);
  const colors = new Float32Array(particles * 4); // RGBA: alpha carries the edge fade
  const pointGeometry = new BufferGeometry();
  pointGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  pointGeometry.setAttribute("color", new BufferAttribute(colors, 4));
  const pointMaterial = new PointsMaterial({
    size: 4.2,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  scene.add(new Points(pointGeometry, pointMaterial));

  // ---- links (built once) ----------------------------------------------------------------------
  const links = buildLinks(homes, LINK_DISTANCE, maxLinks);
  const linePositions = new Float32Array(links.length * 6);
  const lineColors = new Float32Array(links.length * 8);
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute("position", new BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute("color", new BufferAttribute(lineColors, 4));
  const lineMaterial = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  scene.add(new LineSegments(lineGeometry, lineMaterial));

  // ---- theme -----------------------------------------------------------------------------------
  const teal = new Color(0, 0.44, 0.4);
  const violet = new Color(0.47, 0.2, 0.91);
  const setTheme = ({ teal: t, violet: v, dark }: CoreTheme) => {
    teal.setRGB(t[0], t[1], t[2]);
    violet.setRGB(v[0], v[1], v[2]);
    // Additive blending glows on dark backgrounds but vanishes on the light page; use normal there.
    // Opacity is a uniform and blending is per-draw state, so no shader rebuild is needed.
    const blending = dark ? AdditiveBlending : NormalBlending;
    pointMaterial.blending = blending;
    lineMaterial.blending = blending;
    pointMaterial.opacity = dark ? 0.9 : 0.75;
    lineMaterial.opacity = dark ? 0.32 : 0.22;
  };

  // ---- pointer ---------------------------------------------------------------------------------
  const cursor = { x: 0, y: 0, active: false, lastMove: 0 };

  // ---- frame -----------------------------------------------------------------------------------
  const frame = (now: number) => {
    const t = now / 1000;
    const idle = !cursor.active || now - cursor.lastMove > 2500;
    const px = idle ? Math.sin(t * 0.21) * BOX.x * 0.38 : cursor.x;
    const py = idle ? Math.sin(t * 0.33 + 1.2) * BOX.y * 0.32 : cursor.y;
    const strength = idle ? 0.7 : 1;

    for (let i = 0; i < particles; i++) {
      const h = homes[i];
      const p = phase[i];
      const x = h.x + Math.sin(t * p.speed + p.a) * p.amp;
      const y = h.y + Math.cos(t * p.speed * 0.9 + p.b) * p.amp;
      const z = h.z + Math.sin(t * p.speed * 0.7 + p.b) * p.amp * 0.6;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const w = pulseWeight(Math.hypot(x - px, y - py), PULSE_RADIUS) * strength;
      colors[i * 4] = teal.r + (violet.r - teal.r) * w;
      colors[i * 4 + 1] = teal.g + (violet.g - teal.g) * w;
      colors[i * 4 + 2] = teal.b + (violet.b - teal.b) * w;
      colors[i * 4 + 3] = edgeFade(x / (BOX.x / 2), y / (BOX.y / 2));
    }
    for (let k = 0; k < links.length; k++) {
      const [a, b] = links[k];
      for (let c = 0; c < 3; c++) {
        linePositions[k * 6 + c] = positions[a * 3 + c];
        linePositions[k * 6 + 3 + c] = positions[b * 3 + c];
      }
      for (let c = 0; c < 4; c++) {
        lineColors[k * 8 + c] = colors[a * 4 + c];
        lineColors[k * 8 + 4 + c] = colors[b * 4 + c];
      }
    }
    pointGeometry.attributes.position.needsUpdate = true;
    pointGeometry.attributes.color.needsUpdate = true;
    lineGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.color.needsUpdate = true;
    scene.rotation.y = Math.sin(t * 0.05) * 0.12;
    renderer.render(scene, camera);
  };

  // ---- loop: 60 fps cap, 30 fps while frames are expensive --------------------------------------
  let raf = 0;
  let running = false;
  let frameMs = 1000 / 60;
  let cost = 0;
  let last = 0;
  const loop = (now: number) => {
    if (now - last >= frameMs - 1) {
      const started = performance.now();
      frame(now);
      cost = cost * 0.9 + (performance.now() - started) * 0.1;
      if (cost > 6) frameMs = 1000 / 30;
      else if (cost < 3) frameMs = 1000 / 60;
      last = now;
    }
    raf = running ? scheduleFrame(loop) : 0;
  };

  return {
    resize(width, height, pixelRatio) {
      renderer.setPixelRatio(Math.min(pixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.setSize(Math.max(width, 1), Math.max(height, 1), false);
      camera.aspect = Math.max(width, 1) / Math.max(height, 1);
      camera.updateProjectionMatrix();
      if (!running) frame(performance.now()); // keep a correct still frame while paused
    },
    pointer(x, y) {
      if (x === null || y === null) {
        cursor.active = false;
        return;
      }
      cursor.active = true;
      cursor.x = (x - 0.5) * BOX.x * 1.15;
      cursor.y = -(y - 0.5) * BOX.y * 1.15;
      cursor.lastMove = performance.now();
    },
    theme(next) {
      setTheme(next);
      if (!running) frame(performance.now());
    },
    run(on) {
      running = on;
      if (on && raf === 0) raf = scheduleFrame(loop);
      if (!on && raf !== 0) {
        cancelFrame(raf);
        raf = 0;
      }
    },
    dispose() {
      running = false;
      cancelFrame(raf);
      raf = 0;
      pointGeometry.dispose();
      lineGeometry.dispose();
      pointMaterial.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
