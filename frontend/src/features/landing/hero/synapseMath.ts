/**
 * Pure helpers for the hero node network. No three.js and no DOM here, so they are unit-tested
 * directly and cost nothing in the initial bundle.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Deterministic PRNG (mulberry32): the network looks the same on every visit, and tests are stable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Home positions spread through a box centred on the origin. */
export function scatter(count: number, size: Vec3, random: () => number): Vec3[] {
  return Array.from({ length: count }, () => ({
    x: (random() - 0.5) * size.x,
    y: (random() - 0.5) * size.y,
    z: (random() - 0.5) * size.z,
  }));
}

/**
 * Neighbour links computed ONCE with a uniform spatial grid (cell = maxDistance), so only the 27
 * surrounding cells are examined per node instead of every other node. Each node keeps at most
 * `maxLinks` links (its nearest ones), which bounds the per-frame line work as well.
 * Returns pairs [i, j] with i < j, each pair once.
 */
export function buildLinks(
  points: Vec3[],
  maxDistance: number,
  maxLinks: number,
): [number, number][] {
  const cell = maxDistance;
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const grid = new Map<string, number[]>();
  points.forEach((p, i) => {
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  });

  const maxSq = maxDistance * maxDistance;
  const degree = new Array<number>(points.length).fill(0);
  const seen = new Set<string>();
  const links: [number, number][] = [];

  points.forEach((p, i) => {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const cz = Math.floor(p.z / cell);
    const near: { j: number; d: number }[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          for (const j of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
            if (j === i) continue;
            const q = points[j];
            const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
            if (d <= maxSq) near.push({ j, d });
          }
        }
    near.sort((a, b) => a.d - b.d || a.j - b.j);
    for (const { j } of near) {
      if (degree[i] >= maxLinks) break;
      if (degree[j] >= maxLinks) continue;
      const pair: [number, number] = i < j ? [i, j] : [j, i];
      const id = `${pair[0]}-${pair[1]}`;
      if (seen.has(id)) continue;
      seen.add(id);
      links.push(pair);
      degree[i]++;
      degree[j]++;
    }
  });
  return links;
}

/** "0 111 103" (how the design tokens store colours) -> [0..1, 0..1, 0..1]. Null if unreadable. */
export function parseRgbToken(value: string): [number, number, number] | null {
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * How visible a node is at normalised position (nx, ny) in -1..1: fades out towards the left (where
 * the hero copy sits) and the top/bottom edges. Done per node in the scene instead of a CSS
 * mask-image, which would make the browser re-composite a masked layer every frame.
 */
export function edgeFade(nx: number, ny: number): number {
  return smoothstep(-0.55, 0.25, nx) * (1 - smoothstep(0.7, 1.05, Math.abs(ny)));
}

/** 0 at or beyond `radius`, 1 at the centre, smooth in between. */
export function pulseWeight(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t * (3 - 2 * t);
}
