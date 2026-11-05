// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * The smoothing of a curved outline, and the rounding of the corners the
 * keep-out cut leaves (`outline.ts`). Each keeps every padded member (and
 * each link, at its padded half-width) inside the outline: the keep-ins.
 */
import { boxGrid, type Member, type Pt } from "./prims";
import { signedArea2 } from "../../geometry/plane";
import { SegGrid, Inside, segsOf } from "./grid";
import { closingRings } from "./arcs";

/** A keep-in constraint: a segment ab (a disc when a = b) grown to `R`. The
 *  outline must keep every point of it inside. */
export type KeepIn = { a: Pt; b: Pt; R: number };

/** The smoothing's Gaussian, px of arclength. */
const SIGMA = 6;
/** The smoothing offset's margin past the least that holds every keep-in, px. */
const MARGIN = 0.05;

function gauss(ring: Pt[], sigmaSamples: number): Pt[] {
  const n = ring.length;
  const J = Math.min(Math.floor(n / 2) - 1, Math.ceil(3 * sigmaSamples));
  const w: number[] = [];
  let z = 0;
  for (let j = -J; j <= J; j++) {
    const v = Math.exp(-(j * j) / (2 * sigmaSamples * sigmaSamples));
    w.push(v);
    z += v;
  }
  return ring.map((_, i) => {
    let x = 0,
      y = 0;
    for (let j = -J; j <= J; j++) {
      const q = ring[(((i + j) % n) + n) % n];
      x += w[j + J] * q[0];
      y += w[j + J] * q[1];
    }
    return [x / z, y / z] as Pt;
  });
}

/** The keep-ins with a grid over their boxes (each capsule's axis box grown
 *  by R holds every point the capsule holds). */
type KeepGrid = { keep: KeepIn[]; grid: ReturnType<typeof boxGrid> };
const keepGrid = (keep: KeepIn[]): KeepGrid => ({
  keep,
  grid: boxGrid(
    keep.map(({ a, b, R }) => [
      Math.min(a[0], b[0]) - R,
      Math.min(a[1], b[1]) - R,
      Math.max(a[0], b[0]) + R,
      Math.max(a[1], b[1]) + R,
    ])
  ),
});

/** Push p out of every keep-in capsule that holds it: up to three passes,
 *  each over the keep-ins in order, a capsule that holds the point moving it
 *  to the capsule's edge. A pass visits only the capsules whose boxes hold
 *  the point, asking the grid again after each move, so it moves the point
 *  exactly as a pass over every capsule would. */
function pushOut(p: Pt, { keep, grid }: KeepGrid): Pt {
  let [x, y] = p;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    let last = -1;
    let at = grid.query(x, y, x, y);
    for (let q = 0; q < at.length; q++) {
      const i = at[q];
      if (i <= last) continue;
      last = i;
      const k = keep[i];
      const [a, b] = [k.a, k.b];
      const ex = b[0] - a[0],
        ey = b[1] - a[1];
      const L2 = ex * ex + ey * ey;
      const t =
        L2 < 1e-12
          ? 0
          : Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L2));
      const cx = a[0] + ex * t,
        cy = a[1] + ey * t;
      const d = Math.hypot(x - cx, y - cy);
      if (d < k.R && d > 1e-9) {
        x = cx + ((x - cx) * k.R) / d;
        y = cy + ((y - cy) * k.R) / d;
        moved = true;
        at = grid.query(x, y, x, y);
        q = -1;
      }
    }
    if (!moved) break;
  }
  return [x, y];
}

/** The outward normals of a ring, the right of travel: the region is on the
 *  left of travel on every ring (an outer ring winds positive, a hole the
 *  other way, as the arcs outline does). */
function normals(ring: Pt[]): Pt[] {
  const n = ring.length;
  return ring.map((_, i) => {
    const [p, q] = [ring[(i - 1 + n) % n], ring[(i + 1) % n]];
    const tx = q[0] - p[0],
      ty = q[1] - p[1];
    const L = Math.hypot(tx, ty) || 1;
    return [ty / L, -tx / L] as Pt;
  });
}

/** The least outward offset that holds every keep-in capsule: the most
 *  any capsule's axis sample (every 2 px) needs, signed distance to the
 *  rings (negative inside, nonzero winding) plus its radius, and at least
 *  0. The distances from a segment grid (exact). An inside sample can raise
 *  the most only when the outline is
 *  nearer than its radius less the most so far, so its search stops there
 *  (deep inside a wide outline, the hull's, it would cross many empty
 *  cells). */
function needed(rings: Pt[][], keep: KeepIn[]): number {
  if (!keep.length) return 0;
  const S = segsOf(rings);
  const G = new SegGrid(S, 4),
    In = new Inside(S);
  let c = 0;
  for (const k of keep) {
    const L = Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
    const n = Math.max(1, Math.ceil(L / 2));
    for (let t = 0; t <= n; t++) {
      const x = k.a[0] + ((k.b[0] - k.a[0]) * t) / n,
        y = k.a[1] + ((k.b[1] - k.a[1]) * t) / n;
      if (!In.has(x, y)) c = Math.max(c, G.nearest(x, y) + k.R);
      else if (k.R > c) {
        const lim = k.R - c;
        const d = G.capped(x, y, lim);
        if (d < lim) c = Math.max(c, k.R - d);
      }
    }
  }
  return c;
}

/**
 * The outline smoothed: a Gaussian along arclength (SIGMA px, on rings
 * resampled every px), then grown (grow) by the least amount that holds
 * every keep-in capsule again (smoothing pulls a convex part of radius rho in
 * by about SIGMA^2 / (2 rho)).
 */
export function smoothOutline(rings: Pt[][], keep: KeepIn[]): Pt[][] {
  const sm = rings.map((ring) => gauss(resample(ring, 1)[0], SIGMA));
  return grow(sm, needed(sm, keep) + MARGIN);
}

/**
 * The rings' region grown by c: every point within c of it. Its boundary is
 * where the distance to the rings is c. Each ring moved out along its normals
 * (offsetRing) is that boundary when every point of it is c from the rings
 * (to the joins' chord error): the usual case, a smoothed ring curving no
 * tighter than c where it is concave. Where it is, the moved ring passes
 * nearer than c: past a dent tighter than c it crosses itself in a small
 * loop that winds the other way and is left unfilled, and a hole no wider
 * than 2c turns inside out through its middle, to a hole across the fill.
 * Then the boundary is the union engine's (arcs.ts), exactly: the band of
 * every side grown by c, its rings outside the region (the outer ones moved
 * out, and each hole shrunk, or gone).
 */
function grow(rings: Pt[][], c: number): Pt[][] {
  if (c <= 0) return rings;
  const moved = rings.map((r) => offsetRing(r, c));
  const lim = c - 2 * JOIN_TOL;
  const G = new SegGrid(segsOf(rings), 4);
  if (moved.every((r) => r.every(([x, y]) => G.capped(x, y, lim) >= lim)))
    return moved;
  const sides = rings.flatMap((r) =>
    r.map(
      (a, i): Member => ({ kind: "segment", a, b: r[(i + 1) % r.length], w: 0 })
    )
  );
  const In = new Inside(segsOf(rings));
  return closingRings(sides, c, 0, true).filter(
    (q) => !In.has(q[0][0], q[0][1])
  );
}

/** The chord error of the arcs offsetRing adds at a sharp convex vertex, px. */
const JOIN_TOL = 0.05;

/**
 * A ring moved out by c: each vertex along its normal (normals), and at a
 * convex vertex that turns more than an arc step of radius c the arc of c
 * around it, from its incoming side's normal to its outgoing side's (a round
 * join). A vertex normal alone moves a sharp tip (where a member narrower
 * than the smoothing collapsed) by c along its bisector only, and the chord
 * between its two neighbors' moved points cuts across the cap; with the arc
 * the ring holds every point within c of it on its convex side, as `needed`
 * reckons.
 */
function offsetRing(r: Pt[], c: number): Pt[] {
  const n = r.length;
  const N = normals(r);
  const step =
    2 * Math.acos(Math.max(-1, 1 - JOIN_TOL / Math.max(c, JOIN_TOL)));
  const side = (i: number): Pt => {
    const [p, q] = [r[i], r[(i + 1) % n]];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [(q[1] - p[1]) / L, -(q[0] - p[0]) / L];
  };
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = r[i];
    const a = side((i - 1 + n) % n),
      b = side(i);
    // the turn from the incoming side's normal to the outgoing's, as the
    // travel turns: positive turns left, a convex vertex (the region is on
    // the left)
    const turn = Math.atan2(
      a[0] * b[1] - a[1] * b[0],
      a[0] * b[0] + a[1] * b[1]
    );
    if (c <= 0 || turn <= step) {
      out.push([p[0] + c * N[i][0], p[1] + c * N[i][1]]);
      continue;
    }
    const a0 = Math.atan2(a[1], a[0]);
    const k = Math.ceil(turn / step);
    for (let j = 0; j <= k; j++) {
      const t = a0 + (turn * j) / k;
      out.push([p[0] + c * Math.cos(t), p[1] + c * Math.sin(t)]);
    }
  }
  return out;
}

/** Resample a closed ring at a uniform step of about ds, each sample marked when the edge it
 *  lies on has a marked end (`mk`, one per vertex; none by default). */
function resample(
  ring: Pt[],
  ds: number,
  mk: boolean[] = []
): [Pt[], boolean[]] {
  const n = ring.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const [a, b] = [ring[i], ring[(i + 1) % n]];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[n];
  const m = Math.max(8, Math.round(L / ds));
  const out: Pt[] = [],
    om: boolean[] = [];
  let k = 0;
  for (let j = 0; j < m; j++) {
    const s = (L * j) / m;
    while (cum[k + 1] < s) k++;
    const t = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    const [a, b] = [ring[k], ring[(k + 1) % n]];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    om.push(!!(mk[k] || mk[(k + 1) % n]));
  }
  return [out, om];
}

/**
 * The rounding of the corners a cut leaves (outline.ts, finish).
 * Near the cut (`marks`: the points that came from the forbidden region's
 * boundary), each point moves by the inward part of a Gaussian along
 * arclength (sigma px) and no further: convex corners and spikes (where the
 * outline meets a clipped side or a keep-out, or two keep-outs meet) round
 * off; nothing moves outward, and no point moves out of the cut rings (a
 * move that would cross a band thinner than itself is halved until it
 * does not, or dropped), so the rounded outline stays inside the cut one
 * and out of what was cut. Then every point is pushed out of the
 * padded members again (pushOut), so they stay inside. The weight is 1
 * within 3σ of a cut point and tapers to 0 over the next 3σ, so the rest of
 * the outline does not move. A ring the rounding turns inside out was
 * narrower than the rounding (an opening would remove it too): dropped.
 */
export function roundCut(
  rings: Pt[][],
  marks: boolean[][],
  keep: KeepIn[],
  sigma: number
): Pt[][] {
  const out: Pt[][] = [];
  let region: Inside | null = null;
  let held: KeepGrid | null = null;
  rings.forEach((ring, ri) => {
    const mk0 = marks[ri];
    if (sigma <= 0 || ring.length < 3 || !mk0.some((x) => x)) {
      out.push(ring);
      return;
    }
    const [r, mk] = resample(ring, 1, mk0);
    const n = r.length;
    // samples to the nearest mark, around the ring
    const dist = new Float64Array(n).fill(Infinity);
    for (let pass = 0; pass < 2; pass++) {
      let d = Infinity;
      for (let q = 0; q < 2 * n; q++) {
        const i = q % n;
        d = mk[i] ? 0 : d + 1;
        if (d < dist[i]) dist[i] = d;
      }
      d = Infinity;
      for (let q = 2 * n - 1; q >= 0; q--) {
        const i = q % n;
        d = mk[i] ? 0 : d + 1;
        if (d < dist[i]) dist[i] = d;
      }
    }
    const W = 3 * sigma;
    const g = gauss(r, sigma);
    const N = normals(r);
    const res = r.map((p, i) => {
      const w = dist[i] <= W ? 1 : dist[i] >= 2 * W ? 0 : 2 - dist[i] / W;
      if (w <= 0) return p;
      const t = (g[i][0] - p[0]) * N[i][0] + (g[i][1] - p[1]) * N[i][1];
      if (t >= 0) return p;
      region ??= new Inside(segsOf(rings));
      held ??= keepGrid(keep);
      let s = w * t;
      for (let k = 0; k < 4; k++, s /= 2) {
        const q: Pt = [p[0] + s * N[i][0], p[1] + s * N[i][1]];
        if (region.has(q[0], q[1])) return pushOut(q, held);
      }
      return pushOut(p, held);
    });
    const a0 = signedArea2(ring),
      a1 = signedArea2(res);
    if (Math.sign(a1) !== Math.sign(a0) || Math.abs(a1) < 1e-6) return;
    out.push(res);
  });
  return out;
}

/** Each member grown by pad, as keep-in capsules: what the smoothing and
 *  the rounding keep inside the outline. A disc is one, a segment one (a
 *  tapered link several), and a box its four sides, each grown by pad (the
 *  outline holds the padded box when it holds its padded sides). */
export function keepIns(members: Member[], pad: number): KeepIn[] {
  return members.flatMap((m): KeepIn | KeepIn[] =>
    m.kind === "disc"
      ? { a: [m.cx, m.cy], b: [m.cx, m.cy], R: m.r + pad }
      : m.kind === "segment"
        ? m.w2 !== undefined && m.w2 !== m.w
          ? taperKeepIns(m.a, m.b, m.w / 2 + pad, m.w2 / 2 + pad)
          : { a: m.a, b: m.b, R: Math.max(0, m.w / 2 + pad) }
        : boxKeepIns(m, pad)
  );
}

/** A box's four sides, each grown by pad. */
function boxKeepIns(
  m: Extract<Member, { kind: "box" }>,
  pad: number
): KeepIn[] {
  const c: Pt[] = [
    [m.x, m.y],
    [m.x + m.w, m.y],
    [m.x + m.w, m.y + m.h],
    [m.x, m.y + m.h],
  ];
  return c.map((a, k) => ({ a, b: c[(k + 1) % 4], R: pad }));
}

/** A tapered tube as short capsules along it (each inside it),
 *  about 2 px long, of the tube's radius at their thinner end. */
function taperKeepIns(a: Pt, b: Pt, ra: number, rb: number): KeepIn[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(L / 2));
  const at = (t: number): Pt => [
    a[0] + t * (b[0] - a[0]),
    a[1] + t * (b[1] - a[1]),
  ];
  const R = (t: number) => ra + (rb - ra) * t;
  return Array.from({ length: n }, (_, i) => ({
    a: at(i / n),
    b: at((i + 1) / n),
    R: Math.max(0, Math.min(R(i / n), R((i + 1) / n))),
  }));
}
