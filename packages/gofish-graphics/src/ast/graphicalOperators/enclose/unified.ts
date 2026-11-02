/**
 * PROTOTYPE (scratch, not for merge): one `Shape.blob` outline built on the
 * exact arcs closing (`arcs.ts`):
 *
 *   Shape.blob({ convexity, radius, connected, holes, avoiding, clearance })
 *
 *  1. Links. `connected: true` joins the members by the spanning tree of
 *     their centers (zero-width segment members, as `ARCS_PROTOTYPE.spine`).
 *     `connected: false` joins only the members the closing disc cannot pass
 *     between (padded gap < 2 × radius), shortest gaps first (Kruskal), with
 *     a zero-width link between their nearest points. Either way, every two
 *     pieces of the padded members and links that the disc cannot pass
 *     between are in one piece. That is the no-cusp rule: the closing only
 *     makes a sharp tip where two outside discs overlap across a gap the
 *     disc cannot pass, and that gap is now always bridged.
 *  2. The exact closing of members + links, grown by padding, by a disc of
 *     radius r. `convexity` picks r: the r whose closed area fills that share
 *     of the area between the padded union (r = 0) and the padded convex hull
 *     (r = ∞), found by bisection (area grows with r). convexity 1 is the
 *     padded convex hull itself. An explicit `radius` skips the bisection.
 *  3. Keep-outs (`avoiding`, grown by `clearance`) cut out of the closing.
 *  4. The approved smoothing: Gaussian along arclength, then the least
 *     uniform outward offset that holds every padded member and link again.
 *     With keep-outs, the cut is redone after the offset, grown by what the
 *     offset pushed into them, until both hold.
 */
import { signedArea2, pointInRing, segDist } from "../../geometry/plane";
import { convexHull, type BlobMember, type Pt } from "./blob";
import { closingRings, keepIns } from "./arcs";
import { resample, smoothOutline, type SmoothSpec } from "./arcsSmooth";
import { beyondHull, type Beyond } from "./beyond";
import { buildFiltration, type Filtration } from "./filtration";
import {
  buildBlend,
  blendRings,
  buildSeal,
  gridFor,
  lidRings,
  sealOpenShare,
  type Seal as SealBay,
} from "./localFill";

/**
 * PROTOTYPE: how `convexity` finds its closing radius.
 *  - "filtration" (default): the closed area as a function of the radius is
 *    precomputed once per member set (filtration.ts), so a convexity is one
 *    lookup and one exact closing. The spine, the padded hull and the
 *    filtration are cached per member set, padding, neck and keep-outs, so
 *    dragging convexity reuses them.
 *  - "bisection": the earlier search, 6-14 exact closings per call, nothing
 *    cached (kept for comparison).
 * `h` is the filtration's sample spacing in px (default 1).
 */
export const UNIFIED_PROTOTYPE: {
  search: "filtration" | "bisection";
  h?: number;
} = { search: "filtration" };

/** PROTOTYPE: a small cache of per-member-set work (spine, hull, filtration),
 *  keyed by the inputs it depends on; `clearUnifiedCache` empties it. */
const CACHE = new Map<string, unknown>();
export const clearUnifiedCache = () => CACHE.clear();
function memo<T>(key: string, f: () => T): T {
  if (CACHE.has(key)) {
    const v = CACHE.get(key) as T;
    CACHE.delete(key); // most recent last
    CACHE.set(key, v);
    return v;
  }
  const t0 = performance.now();
  const v = f();
  UNIFIED_STATS.msCached =
    (UNIFIED_STATS.msCached ?? 0) + performance.now() - t0;
  CACHE.set(key, v);
  while (CACHE.size > 64) CACHE.delete(CACHE.keys().next().value!);
  return v;
}

export type UnifiedOptions = {
  padding: number;
  /** Share of the gap between padded union and padded hull to fill. */
  convexity?: number;
  /** The closing radius in px; when given, convexity is not used. */
  radius?: number;
  connected?: boolean;
  holes?: boolean;
  avoiding?: BlobMember[];
  clearance?: number;
  /** Width of the spine links (connected), px. Default 0. */
  linkWidth?: number;
  /** PROTOTYPE: how convexity in (1, 2] rounds the hull (beyond.ts).
   *  Default "ellipse". */
  beyond?: Beyond;
  /** The spine links' width, as a share of the padded members' they join:
   *  1 (default) is no neck. PROTOTYPE. */
  neck?: number;
  /** null: no smoothing. Default: the approved blur, sigma 6. */
  smooth?: SmoothSpec | null;
  /** PROTOTYPE: what convexity in [0, 1] means (not an API option yet).
   *  - "area" (default): the share of the area between the spine and the
   *    padded hull that is filled; picks one closing radius for the set.
   *  - "radius": the closing radius itself, r = padding + s·c / (1 − c),
   *    with s = the padded hull's area over its perimeter (RADIUS_SCALE).
   *    0 is the spine, 1 (r = ∞) the padded hull.
   *  - "blend": every pocket of hull − spine fills at the same rate, by
   *    the level sets of a harmonic field (localFill.ts); no closing
   *    radius, and nothing seals. */
  means?: Means;
  /** PROTOTYPE: what a bay does when the closing disc stops fitting through
   *  its mouth (for "area" and "radius"; not an API option yet).
   *  - "jump" (default): it fills at once (the exact closing, holes
   *    filled).
   *  - "lake": it stays open as a hole for as long as an r-disc fits inside
   *    it (the exact closing with the sealed bays' holes kept). The members'
   *    own holes stay filled unless `holes`.
   *  - "lid": it fills from its far end to its mouth as r grows from the
   *    seal r_s to r_s + the bay's depth (localFill.ts); not an exact
   *    closing in between. */
  seal?: Seal;
};

export type Means = "area" | "radius" | "blend";
export type Seal = "jump" | "lake" | "lid";

/** PROTOTYPE: the length s of the "radius" convexity, r = padding +
 *  s·c / (1 − c), so c = 0.5 is r = padding + s. The padded hull's area
 *  over its perimeter: half the width of a long strip, half the radius of a
 *  disc. At 0.5 the closing disc is then about as wide as the hull is
 *  thick. Scale-free: the whole picture scaled scales r with it. */
export function radiusScale(hull: Pt[]): number {
  let P = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i],
      b = hull[(i + 1) % hull.length];
    P += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return P > 0 ? Math.abs(ringsArea([hull])) / P : 1;
}

/** A point inside a ring: the middle of the widest run of a horizontal
 *  line through its box's middle that lies inside it. */
function interiorPoint(ring: Pt[]): Pt {
  let [ya, yb] = [Infinity, -Infinity];
  for (const p of ring) {
    ya = Math.min(ya, p[1]);
    yb = Math.max(yb, p[1]);
  }
  const y = (ya + yb) / 2 + 1e-7;
  const xs: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    if (a[1] <= y !== b[1] <= y)
      xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  xs.sort((p, q) => p - q);
  let best: Pt = ring[0],
    w = -1;
  for (let i = 0; i + 1 < xs.length; i += 2)
    if (xs[i + 1] - xs[i] > w) {
      w = xs[i + 1] - xs[i];
      best = [(xs[i] + xs[i + 1]) / 2, y];
    }
  return best;
}

/** Stats from the last call, for the scratch measurement scripts. */
export const UNIFIED_STATS: {
  radius?: number;
  iterations?: number;
  ms?: number;
  links?: number;
  areaTarget?: number;
  areaGot?: number;
  areaUnion?: number;
  areaHull?: number;
  /** PROTOTYPE (playground): the links the closing used, and the time of
   *  each stage in ms (links, closing with its radius search, cut and
   *  smoothing). */
  linkMembers?: BlobMember[];
  msLinks?: number;
  msClose?: number;
  msSmooth?: number;
  /** PROTOTYPE (filtration): its build time when this call built it (0
   *  when it came from the cache), and its size */
  msFiltration?: number;
  /** PROTOTYPE: the time this call spent building what it cached (spine,
   *  hull, filtration); a convexity change on the same set skips it */
  msCached?: number;
  filtration?: Pick<Filtration, "samples" | "triangles" | "knots" | "h">;
  /** PROTOTYPE (convexity modes): the mode and seal treatment used, the
   *  time spent on grid work this call (lid, blend), and how many sealed
   *  bays the lid was filling */
  means?: Means;
  seal?: Seal;
  msGrid?: number;
  lidActive?: number;
} = {};

// ── members as a core (point, segment or box) plus a radius ─────────────────

type Core =
  | { k: "seg"; a: Pt; b: Pt; rho: number }
  | { k: "box"; x0: number; y0: number; x1: number; y1: number };

const coreOf = (m: BlobMember): Core =>
  m.kind === "disc"
    ? { k: "seg", a: [m.cx, m.cy], b: [m.cx, m.cy], rho: m.r }
    : m.kind === "segment"
      ? { k: "seg", a: m.a, b: m.b, rho: Math.max(m.w, m.w2 ?? m.w) / 2 }
      : { k: "box", x0: m.x, y0: m.y, x1: m.x + m.w, y1: m.y + m.h };

const segsOf = (c: Core): [Pt, Pt][] =>
  c.k === "seg"
    ? [[c.a, c.b]]
    : [
        [
          [c.x0, c.y0],
          [c.x1, c.y0],
        ],
        [
          [c.x1, c.y0],
          [c.x1, c.y1],
        ],
        [
          [c.x1, c.y1],
          [c.x0, c.y1],
        ],
        [
          [c.x0, c.y1],
          [c.x0, c.y0],
        ],
      ];

const rhoOf = (c: Core) => (c.k === "seg" ? c.rho : 0);

/** Nearest points of segments pq and rs (each may be a point). */
function segSeg(p: Pt, q: Pt, r: Pt, s: Pt): [Pt, Pt, number] {
  const near = (a: Pt, b: Pt, x: Pt): Pt => {
    const ex = b[0] - a[0],
      ey = b[1] - a[1];
    const L2 = ex * ex + ey * ey;
    const t =
      L2 < 1e-12
        ? 0
        : Math.max(
            0,
            Math.min(1, ((x[0] - a[0]) * ex + (x[1] - a[1]) * ey) / L2)
          );
    return [a[0] + ex * t, a[1] + ey * t];
  };
  // proper crossing: distance 0
  const d = (a: Pt, b: Pt, c: Pt) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p, q, r),
    d2 = d(p, q, s),
    d3 = d(r, s, p),
    d4 = d(r, s, q);
  if (d1 * d2 < 0 && d3 * d4 < 0) {
    const t = d1 / (d1 - d2);
    const x: Pt = [r[0] + (s[0] - r[0]) * t, r[1] + (s[1] - r[1]) * t];
    return [x, x, 0];
  }
  let best: [Pt, Pt, number] = [p, r, Infinity];
  for (const [x, y] of [
    [p, near(r, s, p)],
    [q, near(r, s, q)],
    [near(p, q, r), r],
    [near(p, q, s), s],
  ] as [Pt, Pt][]) {
    const dd = Math.hypot(x[0] - y[0], x[1] - y[1]);
    if (dd < best[2]) best = [x, y, dd];
  }
  return best;
}

/** The nearest points of two members' surfaces and their gap (≤ 0 when
 *  they overlap). */
function nearest(A: Core, B: Core): [Pt, Pt, number] {
  const inBox = (c: Core, p: Pt) =>
    c.k === "box" &&
    p[0] >= c.x0 &&
    p[0] <= c.x1 &&
    p[1] >= c.y0 &&
    p[1] <= c.y1;
  if (
    inBox(A, B.k === "seg" ? B.a : [B.x0, B.y0]) ||
    inBox(B, A.k === "seg" ? A.a : [A.x0, A.y0])
  )
    return [[0, 0], [0, 0], -1];
  let best: [Pt, Pt, number] = [[0, 0], [0, 0], Infinity];
  for (const [p, q] of segsOf(A))
    for (const [r, s] of segsOf(B)) {
      const x = segSeg(p, q, r, s);
      if (x[2] < best[2]) best = x;
    }
  const [x, y, d] = best;
  const ra = rhoOf(A),
    rb = rhoOf(B);
  const gap = d - ra - rb;
  if (d < 1e-9) return [x, y, gap];
  const ux = (y[0] - x[0]) / d,
    uy = (y[1] - x[1]) / d;
  return [
    [x[0] + ux * ra, x[1] + uy * ra],
    [y[0] - ux * rb, y[1] - uy * rb],
    gap,
  ];
}

/**
 * The links for `connected: false`: join every two pieces whose padded gap
 * is under 2 r (grown by pad + r, they overlap), shortest gaps first, each
 * by a zero-width segment between their nearest points. A link is a member
 * too, so a piece near a link (not near its ends) is joined as well; repeat
 * until no two pieces are that near.
 *
 * With `neck` (the connected spine), a link is instead a tapered tube
 * between the nearest points of the two members' cores (a disc's center, a
 * segment's own line, a box's center line along its long side), whose
 * half-width once grown by padding is `neck` times the padded member's at
 * each end: 1 is a tube as wide as the members it joins (no neck). Its core
 * width is then 2 (neck (rho + pad) - pad), below 0 when the tube is to be
 * thinner than the padding.
 */
export function nearLinks(
  members: BlobMember[],
  pad: number,
  r: number,
  neck?: number
): BlobMember[] {
  const prims: Core[] = members.map(coreOf);
  const comp = prims.map((_, i) => i);
  const find = (i: number): number =>
    comp[i] === i ? i : (comp[i] = find(comp[i]));
  const links: BlobMember[] = [];
  const reach = 2 * (pad + r);
  // bounding boxes for pruning
  const bb = (c: Core) =>
    c.k === "box"
      ? [c.x0, c.y0, c.x1, c.y1]
      : [
          Math.min(c.a[0], c.b[0]) - c.rho,
          Math.min(c.a[1], c.b[1]) - c.rho,
          Math.max(c.a[0], c.b[0]) + c.rho,
          Math.max(c.a[1], c.b[1]) + c.rho,
        ];
  const boxes = prims.map(bb);
  // a member's core as a segment and the half-width around it (a link: its
  // own, already necked)
  const linkCore = (i: number): [Pt, Pt, number, boolean] => {
    if (i >= members.length) {
      const c = prims[i] as Extract<Core, { k: "seg" }>;
      return [c.a, c.b, c.rho, false];
    }
    const m = members[i];
    if (m.kind === "disc") return [[m.cx, m.cy], [m.cx, m.cy], m.r, true];
    if (m.kind === "segment")
      return [m.a, m.b, Math.max(m.w, m.w2 ?? m.w) / 2, true];
    return m.w >= m.h
      ? [
          [m.x + m.h / 2, m.y + m.h / 2],
          [m.x + m.w - m.h / 2, m.y + m.h / 2],
          m.h / 2,
          true,
        ]
      : [
          [m.x + m.w / 2, m.y + m.w / 2],
          [m.x + m.w / 2, m.y + m.h - m.w / 2],
          m.w / 2,
          true,
        ];
  };
  const tube = (i: number, j: number, nk: number): BlobMember => {
    const [a0, a1, ra, ma] = linkCore(i),
      [b0, b1, rb, mb] = linkCore(j);
    const [x, y] = segSeg(a0, a1, b0, b1);
    const half = (rho: number, member: boolean) =>
      member ? nk * (rho + pad) - pad : rho;
    return {
      kind: "segment",
      a: x,
      b: y,
      w: 2 * half(ra, ma),
      w2: 2 * half(rb, mb),
    };
  };
  const close = (i: number, j: number) =>
    boxes[i][0] - reach <= boxes[j][2] &&
    boxes[j][0] - reach <= boxes[i][2] &&
    boxes[i][1] - reach <= boxes[j][3] &&
    boxes[j][1] - reach <= boxes[i][3];
  // overlapping members are one piece already
  let from = 0;
  for (let round = 0; round < 8; round++) {
    const pairs: [number, number, Pt, Pt, number][] = [];
    for (let i = 0; i < prims.length; i++)
      for (let j = Math.max(i + 1, from); j < prims.length; j++) {
        if (!close(i, j)) continue;
        const [p, q, gap] = nearest(prims[i], prims[j]);
        if (gap < reach) pairs.push([i, j, p, q, gap]);
      }
    pairs.sort((a, b) => a[4] - b[4]);
    const n0 = prims.length;
    for (const [i, j, p, q, gap] of pairs) {
      const [ci, cj] = [find(i), find(j)];
      if (ci === cj) continue;
      comp[ci] = cj;
      if (gap <= 0) continue; // overlapping: joined already
      const link: BlobMember =
        neck === undefined
          ? { kind: "segment", a: p, b: q, w: 0 }
          : tube(i, j, neck);
      links.push(link);
      prims.push(coreOf(link));
      boxes.push(bb(prims.at(-1)!));
      comp.push(cj);
    }
    if (prims.length === n0) break;
    from = n0; // only pairs involving the new links next round
  }
  return links;
}

// ── area, hull ──────────────────────────────────────────────────────────────

export const ringsArea = (rings: Pt[][]) =>
  rings.reduce((s, r) => s + signedArea2(r) / 2, 0);

/** The padded members' boundary points, about every 0.5 px. */
function paddedSamples(members: BlobMember[], pad: number): Pt[] {
  const out: Pt[] = [];
  const circle = (c: Pt, R: number) => {
    const n = Math.max(16, Math.ceil((2 * Math.PI * R) / 0.5));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      out.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]);
    }
  };
  for (const m of members) {
    if (m.kind === "disc") circle([m.cx, m.cy], m.r + pad);
    else if (m.kind === "segment") {
      circle(m.a, Math.max(0, m.w / 2 + pad));
      circle(m.b, Math.max(0, (m.w2 ?? m.w) / 2 + pad));
    } else {
      // a box grown by pad: its corners' circles
      for (const c of [
        [m.x, m.y],
        [m.x + m.w, m.y],
        [m.x, m.y + m.h],
        [m.x + m.w, m.y + m.h],
      ] as Pt[])
        circle(c, Math.max(pad, 1e-6));
    }
  }
  return out;
}

/** The padded convex hull, winding as the closing does (positive). */
export function paddedHull(members: BlobMember[], pad: number): Pt[] {
  const h = convexHull(paddedSamples(members, pad));
  return signedArea2(h) > 0 ? h : h.slice().reverse();
}

// ── keep-outs ───────────────────────────────────────────────────────────────

type Disc = { c: Pt; R: number };

/** Keep-out discs: each avoided member grown by clearance (a segment as
 *  discs along it, scratch only). */
export function keepOuts(avoiding: BlobMember[], clearance: number): Disc[] {
  const out: Disc[] = [];
  for (const m of avoiding) {
    if (m.kind === "disc") out.push({ c: [m.cx, m.cy], R: m.r + clearance });
    else if (m.kind === "segment") {
      const L = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]);
      const n = Math.max(1, Math.ceil(L / 2));
      for (let i = 0; i <= n; i++)
        out.push({
          c: [
            m.a[0] + ((m.b[0] - m.a[0]) * i) / n,
            m.a[1] + ((m.b[1] - m.a[1]) * i) / n,
          ],
          R: m.w / 2 + clearance,
        });
    } else
      out.push({
        c: [m.x + m.w / 2, m.y + m.h / 2],
        R: Math.hypot(m.w, m.h) / 2 + clearance,
      });
  }
  return out;
}

/** Cut disc K out of the rings: a run inside K becomes the arc of K's circle
 *  that lies in the region; a disc wholly inside a ring becomes a hole. */
function cutDisc(rings: Pt[][], K: Disc): Pt[][] {
  const inK = (p: Pt) => Math.hypot(p[0] - K.c[0], p[1] - K.c[1]) < K.R;
  const out: Pt[][] = [];
  let touched = false;
  for (const ring0 of rings) {
    const ring = resample(ring0, 0.5);
    const n = ring.length;
    const ins = ring.map(inK);
    if (!ins.some((x) => x)) {
      out.push(ring0);
      continue;
    }
    touched = true;
    if (ins.every((x) => x)) continue; // the ring is inside K: gone
    const first = ins.findIndex((x) => !x);
    const res: Pt[] = [];
    const ang = (p: Pt) => Math.atan2(p[1] - K.c[1], p[0] - K.c[0]);
    const onK = (a: number): Pt => [
      K.c[0] + K.R * Math.cos(a),
      K.c[1] + K.R * Math.sin(a),
    ];
    let k = 0;
    while (k < n) {
      const i = (first + k) % n;
      if (!ins[i]) {
        res.push(ring[i]);
        k++;
        continue;
      }
      // a run inside K: from the last outside point to the next
      const enter = res.at(-1)!;
      let m = k;
      while (m < n && ins[(first + m) % n]) m++;
      const exit = ring[(first + m) % n];
      const mid = ring[(first + Math.floor((k + m) / 2)) % n];
      const a0 = ang(enter),
        a1 = ang(exit);
      // the arc whose middle is inside the ring (the region side) — two
      // candidates, ccw and cw
      let d = a1 - a0;
      while (d <= 0) d += 2 * Math.PI;
      const cands = [d, d - 2 * Math.PI];
      const holeSide = (dd: number) => pointInRingAny(rings, onK(a0 + dd / 2));
      void mid;
      const dd = holeSide(cands[0]) ? cands[0] : cands[1];
      const steps = Math.max(2, Math.ceil((Math.abs(dd) * K.R) / 0.5));
      for (let s = 1; s < steps; s++) res.push(onK(a0 + (dd * s) / steps));
      k = m;
    }
    out.push(res);
  }
  if (!touched) {
    // K wholly inside the region (not touching its boundary): a hole
    const inside = rings.some((r) => signedArea2(r) > 0 && pointInRing(K.c, r));
    const inHole = rings.some((r) => signedArea2(r) < 0 && pointInRing(K.c, r));
    if (inside && !inHole) {
      const n = Math.max(16, Math.ceil((2 * Math.PI * K.R) / 0.5));
      const hole: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const a = (-2 * Math.PI * i) / n; // winds the other way
        hole.push([K.c[0] + K.R * Math.cos(a), K.c[1] + K.R * Math.sin(a)]);
      }
      out.push(signedArea2(hole) < 0 ? hole : hole.reverse());
    }
  }
  return out;
}

/** Whether p is inside the region (nonzero over all rings). */
function pointInRingAny(rings: Pt[][], p: Pt): boolean {
  let w = 0;
  for (const r of rings)
    if (pointInRing(p, r)) w += signedArea2(r) > 0 ? 1 : -1;
  return w > 0;
}

/** How far the rings reach into the keep-outs (0 when clear). */
export function intrusion(rings: Pt[][], K: Disc[]): number {
  let worst = 0;
  for (const k of K) {
    // the region's points within k: the nearest ring point, if k's center
    // is outside the region; if inside, the whole disc intrudes
    let dmin = Infinity;
    for (const r of rings)
      for (let i = 0; i < r.length; i++) {
        const [a, b] = [r[i], r[(i + 1) % r.length]];
        dmin = Math.min(dmin, segDist(k.c[0], k.c[1], a[0], a[1], b[0], b[1]));
      }
    const inside = pointInRingAny(rings, k.c);
    worst = Math.max(worst, inside ? k.R + dmin : Math.max(0, k.R - dmin));
  }
  return worst;
}

/**
 * Links bent around the keep-outs: a link whose capsule (radius pad) would
 * reach into a keep-out disc goes around it instead, along the tangents and
 * an arc pad clear of the disc, on the side the link passes nearer (below,
 * +y, on a tie). Scratch: one disc at a time, a few levels deep.
 */
export function routeAround(
  links: BlobMember[],
  K: Disc[],
  pad: number,
  depth = 0
): BlobMember[] {
  if (K.length === 0 || depth > 3) return links;
  const out: BlobMember[] = [];
  for (const l of links) {
    if (l.kind !== "segment") {
      out.push(l);
      continue;
    }
    const [a, b] = [l.a, l.b];
    let hit: Disc | undefined;
    let hd = Infinity;
    for (const k of K) {
      const d = segDist(k.c[0], k.c[1], a[0], a[1], b[0], b[1]);
      const Rd = k.R + pad + Math.max(l.w, l.w2 ?? l.w) / 2;
      const da = Math.hypot(a[0] - k.c[0], a[1] - k.c[1]);
      const db = Math.hypot(b[0] - k.c[0], b[1] - k.c[1]);
      if (d < Rd - 1e-6 && da > Rd + 0.5 && db > Rd + 0.5 && d < hd) {
        hit = k;
        hd = d;
      }
    }
    if (!hit) {
      out.push(l);
      continue;
    }
    const c = hit.c;
    const Rd = hit.R + pad + Math.max(l.w, l.w2 ?? l.w) / 2 + 0.5;
    // the side: the normal of ab pointing away from c (below on a tie)
    const ex = b[0] - a[0],
      ey = b[1] - a[1];
    const L = Math.hypot(ex, ey);
    let [nx, ny] = [-ey / L, ex / L];
    const side = (a[0] - c[0]) * nx + (a[1] - c[1]) * ny;
    if (Math.abs(side) < 1e-6) {
      if (ny < 0) [nx, ny] = [-nx, -ny];
    } else if (side < 0) [nx, ny] = [-nx, -ny];
    const mid = Math.atan2(ny, nx);
    // tangent angles from a and b on the chosen side
    const tang = (p: Pt) => {
      const dp = Math.hypot(p[0] - c[0], p[1] - c[1]);
      const th = Math.atan2(p[1] - c[1], p[0] - c[0]);
      const al = Math.acos(Math.min(1, Rd / dp));
      // of th ± al, the one nearer `mid`
      const near = (x: number) => {
        let d = x - mid;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return Math.abs(d);
      };
      return near(th + al) < near(th - al) ? th + al : th - al;
    };
    const t0 = tang(a);
    let t1 = tang(b);
    // go from t0 to t1 through mid
    let d = t1 - t0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const via = (() => {
      let m = mid - t0;
      while (m > Math.PI) m -= 2 * Math.PI;
      while (m < -Math.PI) m += 2 * Math.PI;
      return m;
    })();
    if (Math.sign(via) !== Math.sign(d) || Math.abs(via) > Math.abs(d))
      d = d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI;
    t1 = t0 + d;
    const n = Math.max(2, Math.ceil(Math.abs(d) / 0.2));
    const Rc = Rd / Math.cos(Math.abs(d) / n / 2);
    const pts: Pt[] = [a];
    for (let i = 0; i <= n; i++) {
      const t = t0 + (d * i) / n;
      const R = i === 0 || i === n ? Rd : Rc;
      pts.push([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]);
    }
    pts.push(b);
    // the widths along the route, by arclength, from w at a to w2 at b
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(
        cum[i - 1] +
          Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      );
    const w2 = l.w2 ?? l.w;
    const wAt = (i: number) => l.w + ((w2 - l.w) * cum[i]) / (cum.at(-1) || 1);
    const segs: BlobMember[] = [];
    for (let i = 0; i + 1 < pts.length; i++)
      segs.push({
        kind: "segment",
        a: pts[i],
        b: pts[i + 1],
        w: wAt(i),
        w2: wAt(i + 1),
      });
    out.push(...routeAround(segs, K, pad, depth + 1));
  }
  return out;
}

// ── the outline ─────────────────────────────────────────────────────────────

export function unifiedOutline(
  members: BlobMember[],
  o: UnifiedOptions
): Pt[][] {
  if (members.length === 0) return [];
  const t0 = performance.now();
  const pad = Math.max(0, o.padding);
  const holes = o.holes ?? false;
  const connected = o.connected ?? true;
  const K = keepOuts(o.avoiding ?? [], o.clearance ?? 4);
  // connected: the same Kruskal over gaps with no limit (a spanning tree of
  // the pieces, each link between nearest points); members that already
  // touch get no link. Links bend around the keep-outs.
  UNIFIED_STATS.msFiltration = 0;
  UNIFIED_STATS.msCached = 0;
  const filt = UNIFIED_PROTOTYPE.search === "filtration";
  const key = (...xs: unknown[]) => JSON.stringify(xs);
  const spineOf = () =>
    routeAround(nearLinks(members, pad, Infinity, o.neck ?? 1), K, pad);
  const spine = !connected
    ? []
    : filt
      ? memo(key("spine", members, pad, o.neck ?? 1, K), spineOf)
      : spineOf();
  const tLinks = performance.now();
  const linksAt = (r: number) =>
    connected ? spine : routeAround(nearLinks(members, pad, r), K, pad);
  const closeAt = (r: number) => {
    const links = linksAt(r);
    const all = [...members, ...links];
    return { all, rings: closingRings(all, pad, r, holes), links };
  };
  let iterations = 0;
  let r: number;
  let res: { all: BlobMember[]; rings: Pt[][]; links: BlobMember[] };
  const means: Means = o.means ?? "area";
  const sealMode: Seal = o.seal ?? "jump";
  UNIFIED_STATS.means = means;
  UNIFIED_STATS.seal = means === "blend" ? undefined : sealMode;
  UNIFIED_STATS.msGrid = 0;
  UNIFIED_STATS.lidActive = 0;
  if (o.radius !== undefined) {
    r = o.radius;
    res = r === Infinity ? hullRes() : closeAt(r);
  } else if (means !== "area" || sealMode !== "jump") {
    // PROTOTYPE: the convexity modes and seal treatments (see Means, Seal).
    // Always the cached path: the filtration, never the bisection, picks
    // the radius of "area" here.
    const c = Math.max(0, Math.min(2, o.convexity ?? 0.5));
    const rMin = pad;
    const fm = connected ? [...members, ...spine] : members;
    const h = UNIFIED_PROTOTYPE.h ?? 1;
    const spineRes = () =>
      memo(key("spineRes", members, spine, pad, holes), () => closeAt(rMin));
    // the filled spine, for telling the members' own holes from lakes
    const filledSpine = () =>
      memo(key("filledSpine", members, spine, pad), () =>
        closingRings([...members, ...linksAt(rMin)], pad, rMin, false)
      );
    const filtOf = (hm: boolean | "lake") =>
      memo(key("filtration", fm, pad, hm, h), () => {
        const F = buildFiltration(fm, pad, rMin, hm, h);
        UNIFIED_STATS.msFiltration = F.ms;
        return F;
      });
    const grid = () =>
      memo(key("grid", members, spine, pad), () => gridFor([hullOf()]));
    // the bays that seal (the filtration's big jumps), for the lid
    const sealsOf = () =>
      memo(key("seals", fm, pad, holes, h), () => {
        const F = filtOf(holes);
        const M = 0.1; // the sampled seal radius is off the exact one by less
        const G = grid();
        const inside = (rings: Pt[][], p: Pt) => pointInRingAny(rings, p);
        const out: SealBay[] = [];
        for (const j of F.jumps) {
          let lo = Math.max(rMin, j.r - M),
            hi = j.r + M;
          const first = buildSeal(
            closeAt(lo).rings,
            closeAt(hi).rings,
            j.r,
            j.dA,
            G
          );
          if (!first) continue;
          // the exact seal radius: the bisection on whether the bay's deepest
          // point is closed, so the closing before the seal is the last one
          // with the bay open (the lid then starts from it, no step back)
          const p: Pt = [
            G.x0 + G.h * (first.seed % G.nx),
            G.y0 + G.h * Math.floor(first.seed / G.nx),
          ];
          let loRings = closeAt(lo).rings;
          for (let k = 0; k < 6 && inside(loRings, p) && lo > rMin; k++) {
            lo = Math.max(rMin, lo - 2 * M);
            loRings = closeAt(lo).rings;
          }
          if (inside(loRings, p)) continue;
          let hiRings = closeAt(hi).rings;
          for (let k = 0; k < 18 && hi - lo > 1e-5; k++) {
            const m = (lo + hi) / 2;
            const mr = closeAt(m).rings;
            if (inside(mr, p)) [hi, hiRings] = [m, mr];
            else [lo, loRings] = [m, mr];
          }
          const s = buildSeal(loRings, hiRings, hi, j.dA, G);
          if (s) out.push({ ...s, rk: j.r });
        }
        return out;
      });
    // a sealed bay left open as a hole; the members' own holes are filled
    // unless `holes`
    const lakeAt = (rr: number) => {
      const links = linksAt(rr);
      const all = [...members, ...links];
      const open = closingRings(all, pad, rr, true);
      if (holes) return { all, rings: open, links };
      // TODO(prototype): the holes-open closing (arcs.ts, holes: true) cuts
      // its outer loop short beside a hole whose wall is thin (penguins set
      // 0: 298 px² less than the filled closing at r = padding), so lake
      // starts below the spine there. Pairing the filled closing's outer
      // loop with these holes is worse (its holes then overrun the outer
      // loop); the fix belongs in the holes path of closingRings.
      const fs = filledSpine();
      const rings = open.filter(
        (g) =>
          signedArea2(g) > 0 ||
          !fs.some((B) => pointInRing(interiorPoint(g), B))
      );
      return { all, rings, links };
    };
    const drawAt = (rr: number) => {
      if (rr === Infinity) return hullRes();
      if (sealMode === "lake") return lakeAt(rr);
      const ex = closeAt(rr);
      if (sealMode !== "lid") return ex;
      const tg = performance.now();
      const seals = sealsOf();
      const lid = lidRings(ex.rings, rr, seals, grid(), holes);
      UNIFIED_STATS.msGrid! += performance.now() - tg;
      if (!lid) return ex;
      UNIFIED_STATS.lidActive = lid.active;
      return { ...ex, rings: lid.rings };
    };
    if (c > 1) {
      r = Infinity;
      res = {
        all: [...members, ...spine],
        rings: [beyondHull(hullOf(), members, pad, c, o.beyond)],
        links: spine,
      };
    } else if (c >= 1) {
      r = Infinity;
      res = hullRes();
    } else if (c <= 0) {
      r = rMin;
      res = spineRes();
    } else if (means === "blend") {
      r = NaN;
      const sp = spineRes();
      const B = memo(key("blend", members, spine, pad, holes), () =>
        buildBlend(sp.rings, hullOf())
      );
      const tg = performance.now();
      res = { ...sp, rings: blendRings(B, c, holes) };
      UNIFIED_STATS.msGrid = performance.now() - tg;
      iterations = 0;
    } else if (means === "radius") {
      const s = memo(key("scale", members, spine, pad), () =>
        radiusScale(hullOf())
      );
      r = rMin + (s * c) / (1 - c);
      res = drawAt(r);
      iterations = 1;
    } else {
      // "area" with a seal treatment: the area-vs-radius curve that
      // treatment draws. lake: the holes-open filtration, the members' own
      // holes kept filled unless `holes`. lid: the filled filtration less,
      // in each bay still filling, the share of its seal's area still open.
      const F = filtOf(sealMode === "lake" ? (holes ? true : "lake") : holes);
      Object.assign(UNIFIED_STATS, {
        areaUnion: F.A0,
        areaHull: F.A1,
        areaTarget: F.A0 + c * (F.A1 - F.A0),
      });
      if (sealMode === "lake") r = F.radiusFor(c).r;
      else {
        const seals = sealsOf();
        const target = F.A0 + c * (F.A1 - F.A0);
        const proxy = (x: number) =>
          F.area(x) - seals.reduce((t, s) => t + s.dA * sealOpenShare(s, x), 0);
        let lo = rMin,
          hi = Math.max(2 * rMin, 1);
        while (proxy(hi) < target && hi < 1e6) [lo, hi] = [hi, 2 * hi];
        if (proxy(hi) < target) r = Infinity;
        else {
          // tight: a looser stop lets r step back as c steps up (two
          // targets landing in one tolerance window), and the closed area
          // grows by up to ~1000 px² per px of r near a seal
          for (let it = 0; it < 80 && hi - lo > 1e-7 * Math.max(1, lo); it++) {
            const m = (lo + hi) / 2;
            if (proxy(m) >= target) hi = m;
            else lo = m;
          }
          r = hi;
        }
      }
      res = drawAt(r);
      iterations = 1;
    }
  } else if (filt) {
    // the radius from the precomputed filtration: one exact closing. Not
    // connected, the links depend on r, so the filtration is the members'
    // alone (PROTOTYPE shortcut: the links the closing then adds are thin
    // and mostly inside it; the closing itself still has them).
    const c = Math.max(0, Math.min(2, o.convexity ?? 0.5));
    const rMin = pad;
    const fm = connected ? [...members, ...spine] : members;
    const h = UNIFIED_PROTOTYPE.h ?? 1;
    const F = memo(key("filtration", fm, pad, holes, h), () => {
      const F = buildFiltration(fm, pad, rMin, holes, h);
      UNIFIED_STATS.msFiltration = F.ms;
      return F;
    });
    const { r: rc } = F.radiusFor(Math.min(1, c));
    Object.assign(UNIFIED_STATS, {
      areaUnion: F.A0,
      areaHull: F.A1,
      areaTarget: F.A0 + Math.min(1, c) * (F.A1 - F.A0),
      filtration: {
        samples: F.samples,
        triangles: F.triangles,
        knots: F.knots,
        h,
      },
    });
    if (c > 1) {
      r = Infinity;
      res = {
        all: [...members, ...spine],
        rings: [beyondHull(hullOf(), members, pad, c, o.beyond)],
        links: spine,
      };
    } else {
      r = rc;
      res = r === Infinity ? hullRes() : closeAt(r);
      iterations = 1;
    }
  } else {
    const c = Math.max(0, Math.min(2, o.convexity ?? 0.5));
    // The least radius is the padding: every concave corner is then an arc
    // of at least padding, as every convex one is (convexity 0).
    const rMin = pad;
    const base = closeAt(rMin);
    const A0 = ringsArea(base.rings);
    const hull = paddedHull([...members, ...spine], pad);
    const A1 = ringsArea([hull]);
    const target = A0 + c * (A1 - A0);
    Object.assign(UNIFIED_STATS, {
      areaUnion: A0,
      areaHull: A1,
      areaTarget: target,
    });
    if (c > 1) {
      // PROTOTYPE: rounder than the hull, toward Shape.oval() at 2
      r = Infinity;
      res = {
        all: [...members, ...spine],
        rings: [beyondHull(hull, members, pad, c, o.beyond)],
        links: spine,
      };
    } else if (c >= 1) {
      r = Infinity;
      res = hullRes();
    } else if (c <= 0 || target <= A0) {
      r = rMin;
      res = base;
    } else {
      const ext = hull.reduce(
        (m, p) => Math.max(m, Math.hypot(p[0] - hull[0][0], p[1] - hull[0][1])),
        0
      );
      let lo = rMin,
        loRes = base;
      let hi = Math.max(1, 2 * rMin);
      let hiRes = closeAt(hi);
      iterations++;
      while (ringsArea(hiRes.rings) < target && hi < 64 * ext) {
        [lo, loRes] = [hi, hiRes];
        hi *= 2;
        hiRes = closeAt(hi);
        iterations++;
      }
      if (ringsArea(hiRes.rings) < target) {
        r = Infinity;
        res = hullRes();
      } else {
        // bisection to 0.5% of the hull gap, or 0.25 px in r
        while (hi - lo > 0.25 && iterations < 30) {
          if (Math.abs(ringsArea(hiRes.rings) - target) < 0.005 * (A1 - A0))
            break;
          const mid = (lo + hi) / 2;
          const m = closeAt(mid);
          iterations++;
          if (ringsArea(m.rings) >= target) [hi, hiRes] = [mid, m];
          else [lo, loRes] = [mid, m];
        }
        // where the area jumps (a pocket closing into a filled hole), the
        // side nearer the target
        const nearer =
          Math.abs(ringsArea(loRes.rings) - target) <
          Math.abs(ringsArea(hiRes.rings) - target);
        [r, res] = nearer ? [lo, loRes] : [hi, hiRes];
      }
    }
  }
  function hullOf() {
    const f = () => paddedHull([...members, ...spine], pad);
    return filt ? memo(key("hull", members, spine, pad), f) : f();
  }
  function hullRes() {
    return {
      all: [...members, ...spine],
      rings: [hullOf()],
      links: spine,
    };
  }
  let rings = res.rings;
  const tClose = performance.now();
  UNIFIED_STATS.areaGot = ringsArea(rings);
  const keep = keepIns(res.all, pad);
  const cut = (rs: Pt[][], grow: number) =>
    K.reduce((acc, k) => cutDisc(acc, { c: k.c, R: k.R + grow }), rs);
  // PROTOTYPE: above convexity 1 the blur fades out, σ·(2 − c): the outline
  // is (2 − c)·hull ⊕ (c − 1)·oval, whose curvature jumps (where the hull's
  // straight sides meet its arcs) shrink to none at 2, so convexity 2 is
  // Shape.oval() exactly.
  const fade =
    o.radius === undefined && (o.convexity ?? 0.5) > 1
      ? Math.max(0, 2 - Math.min(2, o.convexity!))
      : 1;
  const spec0: SmoothSpec | null =
    o.smooth === undefined ? { kind: "blur", sigma: 6 } : o.smooth;
  const spec: SmoothSpec | null =
    spec0 && "sigma" in spec0 && fade < 1
      ? spec0.sigma * fade < 1e-6
        ? null
        : { ...spec0, sigma: spec0.sigma * fade }
      : spec0;
  if (spec === null) rings = cut(rings, 0);
  else {
    let grow = 0;
    let out = rings;
    for (let round = 0; round < 4; round++) {
      out = smoothOutline(cut(rings, grow), keep, spec);
      const into = K.length ? intrusion(out, K) : 0;
      if (into < 0.05) break;
      grow += into + 0.1;
    }
    rings = out;
  }
  Object.assign(UNIFIED_STATS, {
    radius: r,
    iterations,
    ms: performance.now() - t0,
    links: res.links.length,
    linkMembers: res.links,
    msLinks: tLinks - t0,
    msClose: tClose - tLinks,
    msSmooth: performance.now() - tClose,
  });
  return rings;
}
