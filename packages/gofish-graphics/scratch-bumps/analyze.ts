// SCRATCH: classify the outline into pieces and measure curvature.
// usage: tsx analyze.ts <html> [pad] [radius] [spineW]
import { load } from "./load";
import type { Pt } from "../src/ast/graphicalOperators/enclose/blob";
import { segDist } from "../src/ast/geometry/plane";

export type Seg = {
  kind: string; // "M<i>" padded member circle, "L<i>" link side, "C" concave arc, "?"
  i0: number;
  i1: number;
  len: number;
  turn: number; // radians, + = convex (ccw ring in y-down? we normalize)
  kappa: number; // mean curvature
  mid: Pt;
};

/** Signed curvature at each vertex via the circumcircle of neighbors. */
export function curvature(ring: Pt[]): number[] {
  const n = ring.length;
  // orientation: positive area in screen coords
  let A = 0;
  for (let i = 0; i < n; i++) {
    const [a, b] = [ring[i], ring[(i + 1) % n]];
    A += a[0] * b[1] - b[0] * a[1];
  }
  const sgn = A > 0 ? 1 : -1;
  return ring.map((_, i) => {
    const p = ring[(i - 1 + n) % n],
      q = ring[i],
      r = ring[(i + 1) % n];
    const ax = q[0] - p[0],
      ay = q[1] - p[1],
      bx = r[0] - q[0],
      by = r[1] - q[1];
    const cr = ax * by - ay * bx;
    const la = Math.hypot(ax, ay),
      lb = Math.hypot(bx, by),
      lc = Math.hypot(r[0] - p[0], r[1] - p[1]);
    return (sgn * 2 * cr) / (la * lb * lc || 1e-12);
  });
}

export function classify(
  ring: Pt[],
  members: { cx: number; cy: number; r: number }[],
  pad: number,
  radius: number,
  links: [Pt, Pt, number][]
): string[] {
  return ring.map(([x, y]) => {
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (Math.abs(Math.hypot(x - m.cx, y - m.cy) - (m.r + pad)) < 0.02)
        return "M" + i;
    }
    for (let i = 0; i < links.length; i++) {
      const [a, b, w] = links[i];
      const d = segDist(x, y, a[0], a[1], b[0], b[1]);
      if (Math.abs(d - (pad + w / 2)) < 0.02) return "L" + i;
    }
    return "C";
  });
}

export function pieces(ring: Pt[], cls: string[], kap: number[]): Seg[] {
  const n = ring.length;
  // rotate so we start at a class change
  let s = 0;
  while (s < n && cls[s] === cls[(s - 1 + n) % n]) s++;
  if (s === n) s = 0;
  const out: Seg[] = [];
  let k = 0;
  while (k < n) {
    const i0 = (s + k) % n;
    let j = k;
    while (j + 1 < n && cls[(s + j + 1) % n] === cls[i0]) j++;
    let len = 0,
      turn = 0;
    for (let t = k; t <= j; t++) {
      const i = (s + t) % n,
        nx = ring[(i + 1) % n];
      const seg = Math.hypot(nx[0] - ring[i][0], nx[1] - ring[i][1]);
      len += seg;
      turn += kap[i] * seg;
    }
    const mi = (s + Math.floor((k + j) / 2)) % n;
    out.push({
      kind: cls[i0],
      i0,
      i1: (s + j) % n,
      len,
      turn,
      kappa: turn / len,
      mid: ring[mi],
    });
    k = j + 1;
  }
  return out;
}
