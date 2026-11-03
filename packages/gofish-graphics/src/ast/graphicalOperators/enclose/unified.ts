/**
 * PROTOTYPE (scratch, not for merge): one `Shape.blob` outline built on the
 * exact arcs closing (`arcs.ts`):
 *
 *   Shape.blob({ convexity, reach, neck, holes, avoiding, clearance })
 *   Shape.arcs({ radius, holes, avoiding, clearance })   (connected: false)
 *
 *  1. Links. Blob: the members' join tree (a minimum spanning tree over
 *     all pairs: on the padded gaps for "px", else on the centre distance
 *     or HDBSCAN's mutual reachability; joinTree), its edges kept where
 *     they have entered at `reach`, each a tapered tube at its full neck
 *     width (joinLinks; reach is discrete, no link grows in). The kept
 *     links split the members into pieces; each piece is filled on its
 *     own (steps 2 to 4) and kept a padding apart from the others
 *     (separate.ts). reach = ∞ (default) is one piece, the full tree. Arcs
 *     (`connected: false`) joins only the members the closing disc cannot
 *     pass between (padded gap < 2 × radius), shortest gaps first (Kruskal),
 *     with a zero-width link between their nearest points: the no-cusp
 *     rule, the closing only makes a sharp tip where two outside discs
 *     overlap across a gap the disc cannot pass, and that gap is now always
 *     bridged. (A blob piece is closed at r = padding on its own, so no
 *     closing ever spans two pieces and nearLinks has no role there.)
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
import { closingRings, keepIns, withArcsTolerance } from "./arcs";
import {
  buildMeshBlend,
  meshBlendRings,
  MESH_BLEND,
  MESH_DRAFT,
} from "./meshBlend";
import { roundCut, smoothOutline, type SmoothSpec } from "./arcsSmooth";
import { beyondHull, beyondEnds, minkowski, type Beyond } from "./beyond";
import {
  cutField,
  cutRings,
  nearPieces,
  spineBox,
  SEPARATE,
  type CutField,
} from "./separate";
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
  /** the per-bay blend's solver: P1 finite elements on a mesh (meshBlend.ts,
   *  default) or the earlier 1 px grid (localFill.ts), kept for comparison */
  blend?: "mesh" | "grid";
  /** a coarser blend mesh (MESH_DRAFT) and spine (0.2 px arcs), for the
   *  playground while a slider is dragged; the exact one when it is let go */
  draft?: boolean;
} = { search: "filtration" };

/** PROTOTYPE: a small cache of per-member-set work (spine, hull, filtration),
 *  keyed by the inputs it depends on; `clearUnifiedCache` empties it. */
const CACHE = new Map<string, unknown>();
export const clearUnifiedCache = () => {
  CACHE.clear();
  INTERN.clear();
};
function memo<T>(key: string, f: () => T, counted = true): T {
  if (CACHE.has(key)) {
    const v = CACHE.get(key) as T;
    CACHE.delete(key); // most recent last
    CACHE.set(key, v);
    return v;
  }
  const t0 = performance.now();
  const v = f();
  if (counted)
    UNIFIED_STATS.msCached =
      (UNIFIED_STATS.msCached ?? 0) + performance.now() - t0;
  CACHE.set(key, v);
  // PROTOTYPE: room for every piece of every set at every join on penguins
  // (up to ~350 pieces × ~10 entries each, per set of options)
  while (CACHE.size > 16384) CACHE.delete(CACHE.keys().next().value!);
  return v;
}
/** PROTOTYPE: a short stand-in for a long cache key (a member set's JSON),
 *  so per-piece keys stay small. */
const INTERN = new Map<string, number>();
const intern = (s: string) => {
  let v = INTERN.get(s);
  if (v === undefined) INTERN.set(s, (v = INTERN.size));
  return v;
};

export type UnifiedOptions = {
  padding: number;
  /** Share of the gap between padded union and padded hull to fill. */
  convexity?: number;
  /** The closing radius in px; when given, convexity is not used. */
  radius?: number;
  /** false: the arcs shape (the exact closing at `radius`, links from the
   *  closing's reach, no smoothing by the playground). Default true: blob. */
  connected?: boolean;
  /** PROTOTYPE (blob): how far links reach: where the join tree is cut, in
   *  `reachMeasure` (px: the longest padded gap a link may cross; typical:
   *  this many times the usual spacing); cut edges leave the members in
   *  separate pieces, each filled on its own. Discrete: the outline changes
   *  only where reach crosses an edge's entry. Default ∞ (one piece, the
   *  full tree). See joinLinks. */
  reach?: number;
  /** PROTOTYPE: what `reach` is measured in (not an API option yet); see
   *  ReachMeasure. Default "px". With "pieces", reach = k pieces kept, and
   *  the default is 1 (one piece, the full spanning tree). */
  reachMeasure?: ReachMeasure;
  /** PROTOTYPE: the distance the join tree of the relative measures and
   *  "pieces" is built on (not "px", whose tree is on the padded gap): the
   *  centre distance ("plain", the Euclidean MST) or HDBSCAN's mutual
   *  reachability ("mutual", its MST over all pairs). Default "plain". See
   *  joinTree. */
  reachDistance?: ReachDistance;
  /** PROTOTYPE: "mutual"'s k: the core distance is the centre distance to
   *  the k-th nearest other member (HDBSCAN's min_samples = k + 1, which
   *  counts the member itself). Default REACH_CORE_K. */
  reachCore?: number;
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
/** PROTOTYPE: what `join` is measured in (joinEntries).
 *  - "px": the longest padded gap a link crosses, in px (scales with nothing).
 *  - "share": the share of the join tree's edges kept, shortest first, 0..1.
 *  - "typical": a multiple of the set's typical edge: the median length of
 *    the join tree's edges that do not touch, 0..∞.
 *  - "local": a multiple of each edge's nearby edges (Zahn 1971: the mean
 *    length of the tree edges within depth 2 on each side), 0..∞.
 *  - "pieces": join = k, the number of pieces kept: the k − 1 longest
 *    links (that do not touch) are cut, the rest kept; 1..(the pieces left
 *    when only touching members are joined).
 *  In all of these but "px", members whose padding touches stay one piece. */
export type ReachMeasure = "px" | "share" | "typical" | "local" | "pieces";
/** PROTOTYPE: the distance the join tree of "share", "typical", "local"
 *  and "pieces" is built on: "plain" the centre distance d, "mutual" the
 *  mutual reachability max(core(a), core(b), d) (joinTree). */
export type ReachDistance = "plain" | "mutual";
/** PROTOTYPE: the default k of the "mutual" core distance (the k-th nearest
 *  other member; HDBSCAN's min_samples = 5 counts the point itself). */
export const REACH_CORE_K = 4;
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
  /** the area after the cut, before its corners are rounded */
  areaCut?: number;
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
  /** PROTOTYPE: the per-bay blend mesh's size and build times */
  meshBlend?: Record<string, number>;
  /** PROTOTYPE (join): how many pieces, each piece's radius, the spanning
   *  join tree's edges (kept or cut), and the time spent keeping the
   *  pieces apart (0 when cached) */
  pieces?: number;
  radii?: number[];
  joinTree?: JoinEdge[];
  /** the median tree edge in the ranked distance ("typical"'s unit) */
  joinTypical?: number;
  msSeparate?: number;
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

// ── join: which members are one piece ───────────────────────────────────────
//
// PROTOTYPE. `join` is discrete by design: a tree edge is either cut or kept, and a kept edge
// is a link at its full neck width from the join where it enters. The outline is a function of
// the set of kept edges alone, so it changes only where join crosses an edge's entry (a bar of
// the playground's barcode), and the pieces only ever merge as join grows. (An earlier version
// grew each link in over a ramp of join; that made the outline move between the bars without
// the pieces changing, and still stepped where two pieces merged. Both are gone: the merge
// step is the change join stands for.) Neck stays the continuous control of a link's width.

/** PROTOTYPE: one edge of the join tree, for the playground's links view and barcode. */
export type JoinEdge = {
  /** the padded gap in px (≤ 0: the padded members touch or overlap) */
  gap: number;
  /** kept at this join (its members are one piece through it) */
  kept: boolean;
  /** the edge's axis (between the members' cores) */
  a: Pt;
  b: Pt;
  /** whether the members themselves overlap (no link is needed) */
  overlap: boolean;
  /** the join value, in each measure, from which this edge is kept (for any join ≥ it;
   *  "pieces", which counts down: for any join < it); −∞: always kept */
  enter: Record<ReachMeasure, number>;
  /** the two members it joins */
  i: number;
  j: number;
  /** its weight in the tree's distance: the padded gap ("px"), the centre distance
   *  ("plain") or the mutual reachability ("mutual") */
  w: number;
  /** the padded members touch or overlap: kept at every join */
  floor: boolean;
};

/** PROTOTYPE: the depth of Zahn's neighbourhood ("local"). */
export const REACH_DEPTH = 2;

/** One tree edge before it is measured. */
type TreeEdge = {
  i: number;
  j: number;
  /** padded gap, px */
  g: number;
  /** centre distance: between the members' core axes, px */
  d: number;
  /** the tree's distance (JoinEdge.w) */
  w: number;
  overlap: boolean;
  a: Pt;
  b: Pt;
};

/** A member pair: its padded gap, centre distance and link axis. */
type Pair = TreeEdge;

/** The join tree of a member set: what every join of one measure × distance cuts. */
type JoinTree = {
  E: TreeEdge[];
  enter: Record<ReachMeasure, number>[];
  /** "typical"'s unit: the median w of the tree's edges (joinEntries) */
  D: number;
  /** every pair, by padded gap (the closing's merge order), for gap-tree links */
  byGap: Pair[];
  /** each member's core radius (its links' widths) */
  rho: number[];
};

/**
 * PROTOTYPE: the join tree. A minimum spanning tree over ALL member pairs, Kruskal, in the
 * measure's distance:
 *
 *  - "px": the padded gap g. The order in which the exact closing merges the members as its
 *    radius grows (two padded members g apart merge at r = g/2): single linkage on the gaps.
 *  - "plain": the centre distance d (between the members' core axes: the centres, for
 *    dots). The Euclidean MST: single linkage, as Zahn (1971) and Gower and Ross (1969).
 *  - "mutual": HDBSCAN's mutual reachability (Campello, Moulavi and Sander 2013; McInnes,
 *    Healy and Astels, the hdbscan library), w = max(core(a), core(b), d), with core(m) the
 *    centre distance from m to its k-th nearest OTHER member. HDBSCAN counts the point itself
 *    among its min_samples nearest (Campello et al.: "the distance from x_p to its m_pts-
 *    nearest neighbor (including x_p)"; hdbscan: the last column of a k = min_samples query
 *    that returns the point at distance 0), so k others is min_samples = k + 1, and the
 *    default k = 4 is hdbscan's min_samples = 5. The tree is the MST of the complete
 *    mutual-reachability graph, as HDBSCAN builds it; HDBSCAN's condensed tree and its
 *    choice of clusters by stability are left out (raising a cut can then split a piece back
 *    apart, and join must only ever merge).
 *
 * The touching floor: members whose padding touches or overlaps (g ≤ 0) are one piece at
 * every join (in "px" from join 0 up, as before): the Čech complex at radius = padding, the
 * padded members' own union. Kruskal takes those pairs first (by gap), which is the MST of
 * the graph with the touching pairs' weight set to 0: the touching graph's components are
 * contracted, and the rest of the tree is the MST between them. Its edges past the floor are
 * the barcode's bars. At any threshold t the pieces are the components of (the touching
 * graph ∪ every pair with w ≤ t), whichever spanning tree of the touching graph is taken,
 * so the floor changes no piece; it only makes the tree hold the touching edges, so cutting
 * the k − 1 longest of the rest gives exactly k pieces.
 *
 * Ties in w (common in "mutual": every pair nearer than both cores has w = the larger core)
 * are broken by the centre distance, then by index: among the edges that merge at one
 * distance the tree takes the nearest pair. The pieces at any join do not depend on it;
 * only the edges drawn do.
 */
function joinTree(
  members: BlobMember[],
  pad: number,
  measure: ReachMeasure,
  distance: ReachDistance,
  coreK: number
): JoinTree {
  const n = members.length;
  const ax = members.map(coreAxis);
  // every pair's gap and axis do not depend on the padding: cached per
  // member set, so a padding drag only re-sorts them
  const P0 = memo(key("pairs", members), () => {
    const prims = members.map(coreOf);
    const out: Pair[] = [];
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const gap = nearest(prims[i], prims[j])[2];
        const [x, y] = segSeg(ax[i][0], ax[i][1], ax[j][0], ax[j][1]);
        out.push({
          i,
          j,
          g: gap,
          d: Math.hypot(x[0] - y[0], x[1] - y[1]),
          w: 0,
          overlap: gap <= 0,
          a: x,
          b: y,
        });
      }
    return out;
  });
  const P: Pair[] = P0.map((p) => ({ ...p, g: p.g - 2 * pad }));
  const byGap = P.slice().sort((p, q) => p.g - q.g);
  const px = measure === "px";
  const core =
    !px && distance === "mutual" ? coreFromPairs(P, n, coreK) : undefined;
  const W = (p: Pair) =>
    px ? p.g : core ? Math.max(core[p.i], core[p.j], p.d) : p.d;
  const order = px
    ? byGap
    : P.slice().sort((p, q) => {
        const fp = p.g <= 0,
          fq = q.g <= 0;
        if (fp !== fq) return fp ? -1 : 1;
        if (fp) return p.g - q.g;
        return W(p) - W(q) || p.d - q.d;
      });
  const comp = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number =>
    comp[i] === i ? i : (comp[i] = find(comp[i]));
  const E: TreeEdge[] = [];
  for (const p of order) {
    const [ci, cj] = [find(p.i), find(p.j)];
    if (ci === cj) continue;
    comp[ci] = cj;
    E.push({ ...p, w: W(p) });
    if (E.length === n - 1) break;
  }
  const { enter, D } = joinEntries(E, n);
  return { E, enter, D, byGap, rho: ax.map((x) => x[2]) };
}

/** Each member's core distance from the pairs: the centre distance to its k-th nearest
 *  other member, k clamped to 1..n − 1 (min_samples = k + 1, counting itself). */
function coreFromPairs(P: Pair[], n: number, coreK: number): number[] {
  const ds: number[][] = Array.from({ length: n }, () => []);
  for (const p of P) {
    ds[p.i].push(p.d);
    ds[p.j].push(p.d);
  }
  const k = Math.max(1, Math.min(n - 1, Math.round(coreK)));
  return ds.map((x) => x.sort((a, b) => a - b)[k - 1] ?? 0);
}

/** PROTOTYPE: each member's core distance (see joinTree), for the benches. */
export function coreDistances(members: BlobMember[], coreK: number): number[] {
  return coreFromPairs(
    joinTree(members, 0, "typical", "plain", coreK).byGap,
    members.length,
    coreK
  );
}

/**
 * PROTOTYPE: where each tree edge enters, in each measure of `join` (ReachMeasure): it is
 * kept for any join ≥ its entry ("pieces": any join < it). Every entry is a function of the
 * whole tree, computed once, so an edge's entry never moves when others are cut, and the set
 * of kept edges only grows with join. An edge of the touching floor (g ≤ 0) enters at −∞ in
 * every relative measure (in "px" at its gap, ≤ 0, so from join 0 up).
 *
 * The relative measures rank by w, which (for "plain" and "mutual") scales with the chart: a
 * chart resized by s moves the members' centres by s and keeps their sizes and the padding,
 * so d (and every core distance) scales by s and g does not. The floor is the one place they
 * depend on scale, on purpose: a chart shrunk until its members' paddings touch becomes one
 * piece by contact.
 *
 *  - "share": the n tree edges ranked by w; edge k (from 0) enters at (k + 1)/n, so join 1
 *    keeps all and 0 none past the floor. Floor edges hold their ranks, so the ranks do not
 *    change when a resize makes them touch or part.
 *  - "typical": t = w / D, D the median w of all the tree's edges (touching ones too, at
 *    their own w). The median, so a few long edges (the gaps between clusters) do not set
 *    the scale. All edges, not only those past the floor: MST clustering takes its scale
 *    from the whole tree (Zahn 1971; Grygorash, Zhou and Jorgensen 2006: mean and spread of
 *    every MST edge), and it is the steadier one when members are left out: as a sample
 *    thins, edges leave the floor, so a median over the free edges alone changes which
 *    edges it counts as well as their lengths (joinsens: typical × reach keeps one
 *    cluster per set in 12 of 12 subsamples on penguins and ChartAccent with all edges,
 *    10 of 12 with the free ones). REACH_PROTOTYPE.typical = "free" is the other.
 *  - "local" (Zahn 1971, "inconsistent edges"): for each side of the edge, the mean w of the
 *    tree edges within depth 2 of that endpoint, not crossing the edge. t = w / L with L the
 *    larger of the two side means (one side when the other has none; D when neither has).
 *    The larger: an edge is cut only where it is long next to BOTH sides (Zahn's rule).
 *  - "pieces": join = k pieces kept: the free edges longest first, the r-th (from 0) enters
 *    at r + 2 (kept for k < r + 2), so k cuts the k − 1 longest. Whole k is exact; between
 *    two, the floor.
 */
function joinEntries(
  E: TreeEdge[],
  n: number
): { enter: Record<ReachMeasure, number>[]; D: number } {
  const median = (xs: number[]) => {
    const s = xs.slice().sort((a, b) => a - b);
    return s.length
      ? s.length % 2
        ? s[s.length >> 1]
        : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
      : NaN;
  };
  const free = E.filter((e) => e.g > 0).map((e) => e.w);
  const Dall = median(E.map((e) => e.w));
  const D0 = REACH_PROTOTYPE.typical === "all" ? Dall : median(free);
  const D = Number.isFinite(D0) && D0 > 0 ? D0 : Dall > 0 ? Dall : 1;
  const rank = new Map(
    E.map((_, k) => k)
      .sort((a, b) => E[a].w - E[b].w || a - b)
      .map((k, r) => [k, r])
  );
  const longest = new Map(
    E.map((_, k) => k)
      .filter((k) => E[k].g > 0)
      .sort((a, b) => E[b].w - E[a].w || b - a)
      .map((k, r) => [k, r + 2])
  );
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  E.forEach((e, k) => {
    adj[e.i].push([e.j, k]);
    adj[e.j].push([e.i, k]);
  });
  // the mean w within depth REACH_DEPTH of `from`, not crossing edge `skip`
  const sideMean = (from: number, skip: number): number => {
    let sum = 0,
      cnt = 0;
    const walk = (u: number, du: number, via: number) => {
      if (du === REACH_DEPTH) return;
      for (const [v, k] of adj[u]) {
        if (k === skip || k === via) continue;
        sum += E[k].w;
        cnt++;
        walk(v, du + 1, k);
      }
    };
    walk(from, 0, -1);
    return cnt ? sum / cnt : NaN;
  };
  const enter = E.map((e, k) => {
    if (e.g <= 0)
      return {
        px: e.g,
        share: -Infinity,
        typical: -Infinity,
        local: -Infinity,
        pieces: Infinity,
      };
    const mi = sideMean(e.i, k),
      mj = sideMean(e.j, k);
    const L = Number.isNaN(mi)
      ? Number.isNaN(mj)
        ? D
        : mj
      : Number.isNaN(mj)
        ? mi
        : Math.max(mi, mj);
    return {
      px: e.g,
      share: (rank.get(k)! + 1) / E.length,
      typical: e.w / D,
      local: e.w / L,
      pieces: longest.get(k)!,
    };
  });
  return { enter, D };
}

/** PROTOTYPE: whether a tree edge entering at t is kept at `join`. */
const keptAt = (measure: ReachMeasure, t: number, join: number) =>
  measure === "pieces" ? t > join : t <= join;

/** PROTOTYPE (join): choices compared by the benches.
 *  - typical: what "typical"'s unit D is the median of: all the tree's edges ("all",
 *    default) or those whose padded members do not touch ("free").
 *  - links: the links a piece is drawn with. "tree" (default): the join tree's edges inside
 *    the piece. "gap": the gap spanning tree of the piece's own members (the closing's merge
 *    order, as "px" draws), so the join tree picks the pieces and the gap tree draws them;
 *    at join ∞ that is the earlier blob exactly. Same in "px", whose tree is the gap tree. */
export const REACH_PROTOTYPE: {
  typical: "free" | "all";
  links: "tree" | "gap";
} = { typical: "all", links: "tree" };

/**
 * The pieces and links for `join` (PROTOTYPE). The join tree (joinTree, cached per member
 * set, padding, measure and distance) cut where its edges have not entered (joinEntries):
 * the kept edges' components are the pieces. Each piece is drawn with links (see
 * REACH_PROTOTYPE.links), each a tapered tube between the two members' cores whose padded
 * half-width at each end is neck · (ρ + pad), ρ that member's core radius (as nearLinks
 * with `neck`); members that overlap need no link. join = ∞ keeps the whole tree in every
 * measure (pieces: join 1).
 *
 * `pieceKeys[p]`: what piece p's links and fill depend on (its members; the tree and neck
 * are the caller's), for the per-piece cache.
 */
export function joinLinks(
  members: BlobMember[],
  pad: number,
  join: number,
  neck: number,
  measure: ReachMeasure = "px",
  distance: ReachDistance = "plain",
  coreK: number = REACH_CORE_K
): {
  links: BlobMember[];
  /** each link's piece, and each piece's member indices */
  linkPiece: number[];
  pieces: number[][];
  pieceKeys: string[];
  tree: JoinEdge[];
  /** "typical"'s unit, in the tree's distance */
  typical: number;
} {
  const n = members.length;
  const T = memo(
    key(
      "joinTree",
      members,
      pad,
      measure === "px" ? "px" : distance,
      distance === "mutual" && measure !== "px" ? coreK : 0,
      REACH_PROTOTYPE.typical
    ),
    () => joinTree(members, pad, measure, distance, coreK)
  );
  const kc = Array.from({ length: n }, (_, i) => i);
  const kfind = (i: number): number =>
    kc[i] === i ? i : (kc[i] = kfind(kc[i]));
  const tree: JoinEdge[] = T.E.map((e, k) => {
    const kept = e.g <= 0 || keptAt(measure, T.enter[k][measure], join);
    if (kept) kc[kfind(e.i)] = kfind(e.j);
    return {
      gap: e.g,
      kept,
      a: e.a,
      b: e.b,
      overlap: e.overlap,
      enter: T.enter[k],
      i: e.i,
      j: e.j,
      w: e.w,
      floor: e.g <= 0,
    };
  });
  const ids = new Map<number, number>();
  const pieces: number[][] = [];
  for (let i = 0; i < n; i++) {
    const r = kfind(i);
    if (!ids.has(r)) {
      ids.set(r, pieces.length);
      pieces.push([]);
    }
    pieces[ids.get(r)!].push(i);
  }
  // the links: the kept tree edges, or each piece's own gap tree
  const drawn: TreeEdge[] = [];
  if (REACH_PROTOTYPE.links === "gap" && measure !== "px") {
    const c = Array.from({ length: n }, (_, i) => i);
    const f = (i: number): number => (c[i] === i ? i : (c[i] = f(c[i])));
    let left = n - pieces.length;
    for (const p of T.byGap) {
      if (left === 0) break;
      if (kfind(p.i) !== kfind(p.j)) continue;
      const [a, b] = [f(p.i), f(p.j)];
      if (a === b) continue;
      c[a] = b;
      left--;
      drawn.push(p);
    }
  } else T.E.forEach((e, k) => tree[k].kept && drawn.push(e));
  const links: BlobMember[] = [];
  const linkPiece: number[] = [];
  for (const e of drawn) {
    if (e.overlap) continue;
    links.push({
      kind: "segment",
      a: e.a,
      b: e.b,
      w: 2 * (neck * (T.rho[e.i] + pad) - pad),
      w2: 2 * (neck * (T.rho[e.j] + pad) - pad),
    });
    linkPiece.push(ids.get(kfind(e.i))!);
  }
  return {
    links,
    linkPiece,
    pieces,
    pieceKeys: pieces.map((p) => p.join(",")),
    tree,
    typical: T.D,
  };
}

/** A member's core axis (two points, equal for a disc) and radius. */
function coreAxis(m: BlobMember): [Pt, Pt, number] {
  if (m.kind === "disc") return [[m.cx, m.cy], [m.cx, m.cy], m.r];
  if (m.kind === "segment") return [m.a, m.b, Math.max(m.w, m.w2 ?? m.w) / 2];
  return m.w >= m.h
    ? [
        [m.x + m.h / 2, m.y + m.h / 2],
        [m.x + m.w - m.h / 2, m.y + m.h / 2],
        m.h / 2,
      ]
    : [
        [m.x + m.w / 2, m.y + m.w / 2],
        [m.x + m.w / 2, m.y + m.h - m.w / 2],
        m.w / 2,
      ];
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

/** Whether p is inside the region (nonzero over all rings). */
function pointInRingAny(rings: Pt[][], p: Pt): boolean {
  let w = 0;
  for (const r of rings)
    if (pointInRing(p, r)) w += signedArea2(r) > 0 ? 1 : -1;
  return w > 0;
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

const key = (...xs: unknown[]) => JSON.stringify(xs);

/** The box of rings. */
const boxOfRings = (rings: Pt[][]): [number, number, number, number] => {
  let [xa, ya, xb, yb] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const [x, y] of r) {
      xa = Math.min(xa, x);
      xb = Math.max(xb, x);
      ya = Math.min(ya, y);
      yb = Math.max(yb, y);
    }
  return [xa, ya, xb, yb];
};

/**
 * The outline. Blob (`connected`, the default): the members split into
 * pieces by `join` (joinLinks); each piece is filled on its own (its own
 * spine, padded hull and convexity, `fillOne`); with more than one piece,
 * each fill is kept out of the ground nearer the other pieces
 * (separate.ts), so pieces never merge by filling; then each piece is cut
 * from the keep-outs and smoothed on its own. One piece (join = ∞, or every
 * gap under join) is the earlier blob exactly. `connected: false` is the
 * arcs shape: the exact closing at `radius`, its links from the closing's
 * own reach (nearLinks), one region.
 */
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
  UNIFIED_STATS.msFiltration = 0;
  UNIFIED_STATS.msCached = 0;
  UNIFIED_STATS.msSeparate = 0;
  UNIFIED_STATS.msGrid = 0;
  UNIFIED_STATS.lidActive = 0;
  const filt = UNIFIED_PROTOTYPE.search === "filtration";
  if (!connected) {
    const tLinks = performance.now();
    const f = fillOne(members, [], false, o, pad, holes, K, filt);
    const tClose = performance.now();
    const F = K.length
      ? cutField(
          closingRings(f.all, pad, pad, false),
          boxOfRings(f.rings),
          [],
          0,
          K
        )
      : null;
    const rings = finish(f, o, pad, F);
    Object.assign(UNIFIED_STATS, {
      radius: f.r,
      iterations: f.iterations,
      ms: performance.now() - t0,
      links: f.links.length,
      linkMembers: f.links,
      pieces: 1,
      joinTree: [],
      msLinks: tLinks - t0,
      msClose: tClose - tLinks,
      msSmooth: performance.now() - tClose,
    });
    return rings;
  }
  // the pieces and their links (links bend around the keep-outs)
  const neck = o.neck ?? 1;
  const measure = o.reachMeasure ?? "px";
  // "pieces" counts down: its default, every link, is one piece
  const join = Math.max(0, o.reach ?? (measure === "pieces" ? 1 : Infinity));
  const distance = o.reachDistance ?? "plain";
  const coreK = o.reachCore ?? REACH_CORE_K;
  const J = joinLinks(members, pad, join, neck, measure, distance, coreK);
  // PROTOTYPE: the per-piece cache. A piece's links, fill and outline depend on its members
  // (and, through the tree its links come from, the measure and distance), the padding, neck
  // and keep-outs; its separation on the pieces near it; its outline on the convexity
  // options. A join change recomputes only the pieces whose member set changed (and the
  // separation of the pieces near them); a convexity change reuses every spine, filtration,
  // blend table and separation.
  const ctx = intern(
    key(
      members,
      pad,
      neck,
      measure === "px" ? "px" : [distance, distance === "mutual" ? coreK : 0],
      REACH_PROTOTYPE
    )
  );
  // the keep-outs: a piece's spine depends on them only where a link bends
  // around one, so the fill's caches are keyed by the spine itself
  const kid = K.length ? intern(key(K)) : -1;
  const parts = J.pieces.map((idx, p) => {
    const pm = idx.map((i) => members[i]);
    const pk0 = key("piece", ctx, J.pieceKeys[p]);
    const spineOf = () =>
      routeAround(
        J.links.filter((_, l) => J.linkPiece[l] === p),
        K,
        pad
      );
    const spine = filt ? memo(key("spine", pk0, kid), spineOf) : spineOf();
    const pk = K.length ? key(pk0, intern(JSON.stringify(spine))) : pk0;
    return { pm, spine, pk };
  });
  const tLinks = performance.now();
  // more than one piece: each fill kept out of the ground nearer the others; the key of
  // each piece's forbidden region (its own and its neighbours' pieces)
  const c = o.convexity ?? 0.5;
  const beyondOne = o.radius === undefined && c > 1;
  const sep = pad; // PROTOTYPE: the least gap kept between two pieces
  let forbidden: (() => CutField | null)[] = parts.map(() => () => null);
  let fKeys = parts.map(() => "");
  if (parts.length > 1 || K.length) {
    const spines = parts.map(({ pm, spine, pk }) =>
      memo(key("filledSpine", pk, pad), () =>
        closingRings([...pm, ...spine], pad, pad, false)
      )
    );
    // the box each piece's fill stays in: its padded hull, or its oval
    // above convexity 1
    const boxes = parts.map(({ pm, spine, pk }) =>
      memo(key("fillBox", pk, beyondOne), () =>
        boxOfRings([
          beyondOne
            ? beyondHull(
                paddedHull([...pm, ...spine], pad),
                [...pm, ...spine],
                pad,
                2,
                o.beyond
              )
            : paddedHull([...pm, ...spine], pad),
        ])
      )
    );
    const sb = parts.map(({ pk }, p) =>
      memo(key("spineBox", pk), () => spineBox(spines[p]))
    );
    const near = parts.map((_, p) => nearPieces(p, sb, boxes[p], sep));
    fKeys = parts.map(({ pk }, p) =>
      key(
        "forbidden",
        pk,
        beyondOne,
        sep,
        near[p].map((q) => parts[q].pk),
        kid,
        SEPARATE
      )
    );
    forbidden = parts.map((_, p) => () => {
      const ts = performance.now();
      const F = cutField(
        spines[p],
        boxes[p],
        near[p].map((q) => spines[q]),
        sep,
        K
      );
      UNIFIED_STATS.msSeparate! += performance.now() - ts;
      return F;
    });
  }
  // each piece's outline: filled, kept out of the others' ground, cut from the keep-outs
  // and smoothed
  // (smooth: undefined is the default blur and null none; JSON would spell
  // both null)
  const optKey = key(
    o.convexity,
    o.radius,
    o.means,
    o.seal,
    o.beyond,
    o.smooth === undefined ? "blur" : o.smooth,
    holes,
    UNIFIED_PROTOTYPE
  );
  let msFill = 0,
    msFinish = 0;
  const outs = parts.map(({ pm, spine, pk }, p) => {
    const make = () => {
      const t1 = performance.now();
      const f = fillOne(pm, spine, true, o, pad, holes, K, filt, pk);
      const F =
        parts.length > 1 || K.length
          ? filt
            ? memo(fKeys[p], forbidden[p])
            : forbidden[p]()
          : null;
      const t2 = performance.now();
      const rings = finish(f, o, pad, F);
      msFill += t2 - t1;
      msFinish += performance.now() - t2;
      return { rings, r: f.r, iterations: f.iterations };
    };
    return filt
      ? memo(key("outline", pk, fKeys[p], optKey), make, false)
      : make();
  });
  const rings = outs.flatMap((f) => f.rings);
  const radii = outs.map((f) => f.r);
  const fin = radii.filter((r) => Number.isFinite(r));
  Object.assign(UNIFIED_STATS, {
    radius:
      outs.length === 1
        ? radii[0]
        : fin.length
          ? Math.max(...fin)
          : radii.some((r) => Number.isNaN(r))
            ? NaN
            : Infinity,
    radii,
    iterations: outs.reduce((s, f) => s + f.iterations, 0),
    ms: performance.now() - t0,
    links: J.links.length,
    linkMembers: parts.flatMap((p) => p.spine),
    pieces: outs.length,
    joinTree: J.tree,
    joinTypical: J.typical,
    msLinks: tLinks - t0,
    msClose: msFill,
    msSmooth: msFinish,
  });
  return rings;
}

type Fill = {
  rings: Pt[][];
  all: BlobMember[];
  links: BlobMember[];
  r: number;
  iterations: number;
  /** above convexity 1: the padded hull and the oval it blends toward
   *  (finish draws the blend from the smoothed hull) */
  beyond?: { Hc: Pt[]; E: Pt[]; s: number };
};

/** One piece's fill before the keep-out cut and the smoothing: its members,
 *  its links (`spine`, when connected) and the convexity. */
function fillOne(
  members: BlobMember[],
  spine: BlobMember[],
  connected: boolean,
  o: UnifiedOptions,
  pad: number,
  holes: boolean,
  K: Disc[],
  filt: boolean,
  /** the cache key of (members, spine): the caller's piece key, or their JSON */
  pk?: string
): Fill {
  const id = pk ?? key(members, spine);
  const linksAt = (r: number) =>
    connected ? spine : routeAround(nearLinks(members, pad, r), K, pad);
  const closeAt = (r: number) => {
    const links = linksAt(r);
    const all = [...members, ...links];
    return { all, rings: closingRings(all, pad, r, holes), links };
  };
  let iterations = 0;
  let r: number;
  let res: {
    all: BlobMember[];
    rings: Pt[][];
    links: BlobMember[];
    beyond?: Fill["beyond"];
  };
  const means: Means = o.means ?? "area";
  const sealMode: Seal = o.seal ?? "jump";
  UNIFIED_STATS.means = means;
  UNIFIED_STATS.seal = means === "blend" ? undefined : sealMode;
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
      memo(key("spineRes", id, pad, holes), () => closeAt(rMin));
    // the filled spine, for telling the members' own holes from lakes
    const filledSpine = () =>
      memo(key("filledSpine", id, pad), () =>
        closingRings([...members, ...linksAt(rMin)], pad, rMin, false)
      );
    const filtOf = (hm: boolean | "lake") =>
      memo(key("filtration", id, pad, hm, h), () => {
        const F = buildFiltration(fm, pad, rMin, hm, h);
        UNIFIED_STATS.msFiltration = F.ms;
        return F;
      });
    const grid = () => memo(key("grid", id, pad), () => gridFor([hullOf()]));
    // the bays that seal (the filtration's big jumps), for the lid
    const sealsOf = () =>
      memo(key("seals", id, pad, holes, h), () => {
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
      UNIFIED_STATS.lidActive! += lid.active;
      return { ...ex, rings: lid.rings };
    };
    if (c > 1) {
      r = Infinity;
      const all = [...members, ...spine];
      const ends = memo(key("beyondEnds", id, pad, o.beyond ?? null), () =>
        beyondEnds(hullOf(), all, pad, o.beyond)
      );
      res = {
        all,
        rings: [beyondHull(hullOf(), all, pad, c, o.beyond)],
        links: spine,
        ...(ends ? { beyond: { ...ends, s: Math.min(1, c - 1) } } : {}),
      };
    } else if (c >= 1) {
      r = Infinity;
      res = hullRes();
    } else if (c <= 0) {
      r = rMin;
      res = spineRes();
    } else if (means === "blend") {
      r = NaN;
      if (UNIFIED_PROTOTYPE.blend === "grid") {
        const sp = spineRes();
        const B = memo(key("blend", id, pad, holes), () =>
          buildBlend(sp.rings, hullOf())
        );
        const tg = performance.now();
        res = { ...sp, rings: blendRings(B, c, holes) };
        UNIFIED_STATS.msGrid! += performance.now() - tg;
      } else {
        // the mesh wants the spine's arcs to 0.05 px (the closing's own
        // sampling is 0.2 px)
        const draft = !!UNIFIED_PROTOTYPE.draft;
        const MB = memo(key("meshBlend", id, pad, holes, draft), () =>
          buildMeshBlend(
            withArcsTolerance(draft ? 0.2 : 0.05, () =>
              closingRings([...members, ...linksAt(rMin)], pad, rMin, holes)
            ),
            draft ? MESH_DRAFT : MESH_BLEND
          )
        );
        UNIFIED_STATS.meshBlend = MB.stats;
        const tg = performance.now();
        // (the mesh holds its own spine: no closing at the default
        // tolerance is needed here)
        const links = linksAt(rMin);
        res = {
          all: [...members, ...links],
          links,
          rings: meshBlendRings(MB, c, holes),
        };
        UNIFIED_STATS.msGrid! += performance.now() - tg;
      }
      iterations = 0;
    } else if (means === "radius") {
      const s = memo(key("scale", id, pad), () => radiusScale(hullOf()));
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
    const F = memo(key("filtration", id, pad, holes, h), () => {
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
        rings: [beyondHull(hullOf(), [...members, ...spine], pad, c, o.beyond)],
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
        rings: [beyondHull(hull, [...members, ...spine], pad, c, o.beyond)],
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
    return filt ? memo(key("hull", id, pad), f) : f();
  }
  function hullRes() {
    return {
      all: [...members, ...spine],
      rings: [hullOf()],
      links: spine,
    };
  }
  return { ...res, r, iterations };
}

/**
 * A piece's fill smoothed, then cut once by its field `F` (separate.ts: the
 * other pieces' ground and the keep-outs, never the piece's own spine). The
 * cut comes after the smoothing, so the smoothing's outward offset (which
 * holds every padded member again) never pushes the outline back across
 * it, and a clipped side is the same curve at every convexity. The corners
 * the cut leaves (where the outline meets a clipped side or a keep-out, and
 * between two keep-outs) are rounded inward only (roundCut), so the
 * rounding never crosses F either.
 *
 * Above convexity 1 the outline is (2 − c)·S ⊕ (c − 1)·oval, S the convex
 * hull of the smoothed padded hull (the outline at convexity 1): no blur of
 * its own, so convexity 2 is Shape.oval() exactly, the curvature jumps of
 * the hull's sides never come back, and the area grows with c (a Minkowski
 * blend of nested convex sets grows toward the larger).
 */
function finish(
  f: Fill,
  o: UnifiedOptions,
  pad: number,
  F: CutField | null
): Pt[][] {
  let rings = f.rings;
  UNIFIED_STATS.areaGot = ringsArea(rings);
  const keep = keepIns(f.all, pad);
  const spec: SmoothSpec | null =
    o.smooth === undefined ? { kind: "blur", sigma: 6 } : o.smooth;
  if (spec !== null && f.beyond) {
    const { Hc, E, s } = f.beyond;
    rings = [minkowski(smoothHull(Hc, keep, spec), 1 - s, E, s)];
  } else if (spec !== null) rings = smoothOutline(rings, keep, spec);
  if (F) {
    const c = cutRings(F, rings);
    UNIFIED_STATS.areaCut = ringsArea(c.rings);
    rings = roundCut(c.rings, c.cut, keep, SEPARATE.round);
  }
  return rings;
}

/** PROTOTYPE: the convex hull of the smoothed padded hull, per hull ring
 *  (the memoized hull: one object per piece) and smoothing. */
const SMOOTH_HULL = new WeakMap<Pt[], Map<string, Pt[]>>();
function smoothHull(
  Hc: Pt[],
  keep: ReturnType<typeof keepIns>,
  spec: SmoothSpec
): Pt[] {
  let m = SMOOTH_HULL.get(Hc);
  if (!m) SMOOTH_HULL.set(Hc, (m = new Map()));
  const k = JSON.stringify(spec);
  let S = m.get(k);
  if (!S) {
    S = convexHull(smoothOutline([Hc], keep, spec).flat());
    m.set(k, S);
  }
  return S;
}
