/**
 * The three.js scene behind the landing hero. This is the ONLY module that imports three, and it is
 * loaded with a dynamic import() from HeroSynapse, so three.js lives in its own async chunk and never
 * touches the initial bundle or the LCP path.
 *
 * Budget: ~140 nodes, links built once with a spatial grid (each node keeps its 3 nearest), so a frame
 * updates ~140 points, ~200 line segments and their colours. Pixel ratio is capped at 1.5. The loop
 * only runs while the hero is on screen, the tab is visible and effects are not paused.
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

import { buildLinks, parseRgbToken, pulseWeight, scatter, seededRandom } from "./synapseMath";

export interface SynapseScene {
  dispose(): void;
}

export interface SynapseOptions {
  particles?: number;
  maxLinks?: number;
}

const BOX = { x: 640, y: 360, z: 220 };
const LINK_DISTANCE = 95;
const PULSE_RADIUS = 150;
const MAX_PIXEL_RATIO = 1.5;

function readToken(name: string): Color | null {
  const rgb = parseRgbToken(getComputedStyle(document.documentElement).getPropertyValue(name));
  return rgb ? new Color(rgb[0], rgb[1], rgb[2]) : null;
}

export function createSynapseScene(
  container: HTMLElement,
  { particles = 140, maxLinks = 3 }: SynapseOptions = {},
): SynapseScene {
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  container.appendChild(canvas);

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
  const colors = new Float32Array(particles * 3);
  const pointGeometry = new BufferGeometry();
  pointGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  pointGeometry.setAttribute("color", new BufferAttribute(colors, 3));
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
  const lineColors = new Float32Array(links.length * 6);
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute("position", new BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute("color", new BufferAttribute(lineColors, 3));
  const lineMaterial = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  scene.add(new LineSegments(lineGeometry, lineMaterial));

  // ---- theme: token colours + blending that reads in both light and dark -----------------------
  let teal = readToken("--color-primary") ?? new Color(0, 0.44, 0.4);
  let violet = readToken("--color-ai") ?? new Color(0.47, 0.2, 0.91);
  const applyTheme = () => {
    teal = readToken("--color-primary") ?? teal;
    violet = readToken("--color-ai") ?? violet;
    const dark = document.documentElement.classList.contains("dark");
    // Additive blending glows on dark backgrounds but vanishes on the light page; use normal there.
    const blending = dark ? AdditiveBlending : NormalBlending;
    pointMaterial.blending = blending;
    lineMaterial.blending = blending;
    pointMaterial.opacity = dark ? 0.9 : 0.75;
    lineMaterial.opacity = dark ? 0.32 : 0.22;
    pointMaterial.needsUpdate = true;
    lineMaterial.needsUpdate = true;
  };
  applyTheme();

  // ---- pointer: the violet pulse follows the cursor over the hero, otherwise drifts --------------
  const pointer = { x: 0, y: 0, active: false, lastMove: 0 };
  const onPointerMove = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    pointer.active = inside;
    if (!inside) return;
    // Map to the scene's z=0 plane (the box spans BOX.x by BOX.y at that depth, roughly).
    pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * BOX.x * 1.15;
    pointer.y = -((event.clientY - rect.top) / rect.height - 0.5) * BOX.y * 1.15;
    pointer.lastMove = performance.now();
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // ---- sizing ----------------------------------------------------------------------------------
  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  // ---- frame -----------------------------------------------------------------------------------
  const frame = (now: number) => {
    const t = now / 1000;
    const idle = !pointer.active || now - pointer.lastMove > 2500;
    const px = idle ? Math.sin(t * 0.21) * BOX.x * 0.38 : pointer.x;
    const py = idle ? Math.sin(t * 0.33 + 1.2) * BOX.y * 0.32 : pointer.y;
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
      colors[i * 3] = teal.r + (violet.r - teal.r) * w;
      colors[i * 3 + 1] = teal.g + (violet.g - teal.g) * w;
      colors[i * 3 + 2] = teal.b + (violet.b - teal.b) * w;
    }
    for (let k = 0; k < links.length; k++) {
      const [a, b] = links[k];
      for (let c = 0; c < 3; c++) {
        linePositions[k * 6 + c] = positions[a * 3 + c];
        linePositions[k * 6 + 3 + c] = positions[b * 3 + c];
        lineColors[k * 6 + c] = colors[a * 3 + c];
        lineColors[k * 6 + 3 + c] = colors[b * 3 + c];
      }
    }
    pointGeometry.attributes.position.needsUpdate = true;
    pointGeometry.attributes.color.needsUpdate = true;
    lineGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.color.needsUpdate = true;
    scene.rotation.y = Math.sin(t * 0.05) * 0.12;
    renderer.render(scene, camera);
  };

  // ---- run only while it can be seen ------------------------------------------------------------
  let raf = 0;
  let onScreen = true;
  const shouldRun = () =>
    onScreen && !document.hidden && !document.documentElement.hasAttribute("data-effects-paused");
  // Cap at ~60 fps: high-refresh displays would otherwise do 2x the work for no visible gain.
  const FRAME_MS = 1000 / 60;
  let last = 0;
  const loop = (now: number) => {
    if (now - last >= FRAME_MS - 1) {
      frame(now);
      last = now;
    }
    raf = shouldRun() ? requestAnimationFrame(loop) : 0;
  };
  const sync = () => {
    if (shouldRun() && raf === 0) raf = requestAnimationFrame(loop);
    if (!shouldRun() && raf !== 0) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const intersection = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    sync();
  });
  intersection.observe(container);
  const rootObserver = new MutationObserver(() => {
    applyTheme();
    sync();
  });
  rootObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-effects-paused"],
  });
  document.addEventListener("visibilitychange", sync);
  frame(performance.now()); // paint once immediately, then animate
  sync();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      raf = 0;
      intersection.disconnect();
      resizeObserver.disconnect();
      rootObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pointermove", onPointerMove);
      pointGeometry.dispose();
      lineGeometry.dispose();
      pointMaterial.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
