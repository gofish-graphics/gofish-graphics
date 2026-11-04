/**
 * PROTOTYPE (scratch, not for merge): the unified `enclose` outline, built on
 * the exact closing of `arcs.ts`:
 *
 *   enclose({ shape, padding, avoiding, clearance }, members)
 *   Shape.blob({ convexity, connection, neck, holes })
 *   Shape.fillet({ radius, holes })          (radius defaults to padding)
 *   Shape.box()                               (the padded bounding box)
 *
 * Blob:
 *  1. Pieces. The members' join tree is HDBSCAN's: the minimum spanning tree
 *     of every pair in mutual reachability (core distance to the 4th nearest
 *     other member), with the pairs whose padding touches taken first
 *     (joinTree). `connection` keeps that share of its links that do not
 *     touch, the strongest first; touching links are always kept. The kept
 *     links split the members into pieces: 1 (default) is one piece, 0 joins
 *     only touching members. Discrete: the pieces change only where
 *     connection crosses a link's entry.
 *  2. Links. Inside each piece, the links are drawn along the padded-gap
 *     spanning tree of that piece's own members (the closing's merge order),
 *     each a tapered tube at `neck` times the padded members' width
 *     (pieceLinks). At connection 1 this is the earlier blob exactly.
 *  3. Each piece is filled on its own (its spine, padded hull and the
 *     per-bay blend of `convexity`, meshBlend.ts; above 1 the hull blends
 *     toward the oval, beyond.ts) and kept a padding apart from the other
 *     pieces (separate.ts).
 *  4. The approved smoothing: Gaussian along arclength, then the least
 *     uniform outward offset that holds every padded member and link again.
 *
 * Fillet: the exact closing, by a disc of `radius`, of the padded members.
 * Its components are the pieces, and each piece is closed again on its own
 * members (filletPieces): the closing makes a horn with a cusp at its tip
 * where two padded members are near enough for their discs to overlap
 * (padded gap under 2 · radius) but too far apart to join (a gap g between
 * padded discs of radius a joins only when 2·a·radius ≥ a·g + g²/4), and a
 * piece closed without the other has none. No smoothing.
 *
 * Box: the padded members' bounding box.
 *
 * Every shape is then cut by the keep-outs (`avoiding`, each grown by
 * `clearance`), an option of `enclose` next to `padding`: one final cut
 * that never enters the padded members (separate.ts, cutRings), its corners
 * rounded inward (arcsSmooth.ts, roundCut).
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

/** PROTOTYPE: `draft`: a coarser blend mesh (MESH_DRAFT) and spine (0.2 px
 *  arcs), for the playground while a slider is dragged; the exact one when
 *  it is let go. */
export const UNIFIED_PROTOTYPE: { draft?: boolean } = {};

/** PROTOTYPE: a small cache of per-member-set work (spine, hull, blend mesh),
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

/** What the outline is: `Shape.blob` (and its presets spine, hull and oval:
 *  convexity 0, 1 and 2), `Shape.fillet`, or `Shape.box`. */
export type UnifiedShape = "blob" | "fillet" | "box";

export type UnifiedOptions = {
  /** enclose's own: px between the members and the outline. */
  padding: number;
  /** Default "blob". */
  shape?: UnifiedShape;
  /** Blob: 0 is the spine, 1 the padded hull, 2 the oval; between 0 and 1
   *  every pocket of hull − spine fills that share of its area (the per-bay
   *  blend), between 1 and 2 the hull blends toward the oval. Default 0.5. */
  convexity?: number;
  /** Blob: the share of the join tree's links (those that do not touch) that
   *  are kept, the strongest first: 1 (default) is one piece, 0 joins only
   *  members whose padding touches. */
  connection?: number;
  /** Blob: the links' width as a share of the padded members they join;
   *  1 (default) is no neck. */
  neck?: number;
  /** Fillet: the closing disc's radius, px. Default: the padding, so an
   *  inside corner is as round as the padding makes an outside one. */
  radius?: number;
  /** Blob and fillet: keep a gap the outline closes around as a hole. */
  holes?: boolean;
  /** enclose's own: nodes the outline stays out of, each grown by
   *  `clearance` (default 4 px). */
  avoiding?: BlobMember[];
  clearance?: number;
  /** PROTOTYPE (blob): how convexity in (1, 2] rounds the hull (beyond.ts).
   *  Default "ellipse". */
  beyond?: Beyond;
  /** PROTOTYPE (blob): null, no smoothing. Default: the approved blur,
   *  sigma 6. */
  smooth?: SmoothSpec | null;
};

/** The default clearance around an avoided node, px. */
export const CLEARANCE = 4;

/** The core distance's k in the join tree's mutual reachability: the centre
 *  distance to the k-th nearest other member (HDBSCAN's min_samples = 5,
 *  which counts the member itself). */
export const CORE_K = 4;

/** Stats from the last call, for the playground and the scratch scripts. */
export const UNIFIED_STATS: {
  /** fillet: the radius; blob: NaN between convexity 0 and 1 (the blend has
   *  none), the padding at 0, ∞ at and above 1 */
  radius?: number;
  ms?: number;
  links?: number;
  areaGot?: number;
  /** the area after the cut, before its corners are rounded */
  areaCut?: number;
  /** the links the outline used, and the time of each stage in ms */
  linkMembers?: BlobMember[];
  msLinks?: number;
  msClose?: number;
  msSmooth?: number;
  /** the time this call spent building what it cached */
  msCached?: number;
  /** the per-bay blend mesh's size and build times */
  meshBlend?: Record<string, number>;
  /** how many pieces, each piece's radius, the join tree's edges (kept or
   *  cut), and the time spent keeping the pieces apart (0 when cached) */
  pieces?: number;
  radii?: number[];
  joinTree?: JoinEdge[];
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

// ── connection: which members are one piece ─────────────────────────────────
//
// PROTOTYPE. `connection` is discrete by design: a tree link is either cut or kept, and a
// kept one is drawn at its full neck width. The outline is a function of the set of kept links
// alone, so it changes only where connection crosses a link's entry (a tick under the
// playground's slider), and the pieces only ever merge as connection grows.

/** PROTOTYPE: one edge of the join tree, for the playground's links view and barcode. */
export type JoinEdge = {
  /** the padded gap in px (≤ 0: the padded members touch or overlap) */
  gap: number;
  /** kept at this connection (its members are one piece through it) */
  kept: boolean;
  /** the edge's axis (between the members' cores) */
  a: Pt;
  b: Pt;
  /** whether the members themselves overlap (no link is needed) */
  overlap: boolean;
  /** the connection from which this edge is kept (for any connection ≥ it); −∞: always */
  enter: number;
  /** the two members it joins */
  i: number;
  j: number;
  /** its mutual reachability */
  w: number;
  /** the padded members touch or overlap: kept at every connection */
  floor: boolean;
};

/** A member pair: its padded gap, centre distance, tree weight and link axis. */
type Pair = {
  i: number;
  j: number;
  /** padded gap, px */
  g: number;
  /** centre distance: between the members' core axes, px */
  d: number;
  /** the tree's distance, the mutual reachability (JoinEdge.w) */
  w: number;
  overlap: boolean;
  a: Pt;
  b: Pt;
};

/** The join tree of a member set: its edges in Kruskal order (touching first, then the
 *  strongest), and every pair by padded gap (the order the links are drawn in). */
type JoinTree = {
  E: Pair[];
  /** the edges that do not touch, the strongest first (E's order) */
  free: number[];
  byGap: Pair[];
  /** each member's core radius (its links' widths) */
  rho: number[];
};

/**
 * PROTOTYPE: the join tree. HDBSCAN's: the minimum spanning tree over ALL member pairs, by
 * Kruskal, in mutual reachability (Campello, Moulavi and Sander 2013; McInnes, Healy and
 * Astels, the hdbscan library), w = max(core(a), core(b), d), d the centre distance (between
 * the members' core axes: the centres, for dots) and core(m) the centre distance from m to its
 * k-th nearest OTHER member, k = CORE_K = 4 (hdbscan's min_samples = 5, which counts the point
 * itself). HDBSCAN's condensed tree and its choice of clusters by stability are left out:
 * connection cuts the tree's weakest links, and raising it only ever merges pieces.
 *
 * The touching floor: members whose padding touches or overlaps (g ≤ 0) are one piece at every
 * connection: the padded members' own union. Kruskal takes those pairs first (by gap), which is
 * the MST of the graph with the touching pairs' weight set to 0: the touching graph's components
 * are contracted, and the rest of the tree is the MST between them. Its links past the floor
 * are the ones connection counts.
 *
 * Ties in w (every pair nearer than both cores has w = the larger core) are broken by the
 * centre distance, then by index: among the edges that merge at one distance the tree takes the
 * nearest pair.
 */
function joinTree(members: BlobMember[], pad: number): JoinTree {
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
  const core = coreFromPairs(P0, n, CORE_K);
  const P: Pair[] = P0.map((p) => ({
    ...p,
    g: p.g - 2 * pad,
    w: Math.max(core[p.i], core[p.j], p.d),
  }));
  const byGap = P.slice().sort((p, q) => p.g - q.g);
  const order = P.slice().sort((p, q) => {
    const fp = p.g <= 0,
      fq = q.g <= 0;
    if (fp !== fq) return fp ? -1 : 1;
    if (fp) return p.g - q.g;
    return p.w - q.w || p.d - q.d;
  });
  const comp = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number =>
    comp[i] === i ? i : (comp[i] = find(comp[i]));
  const E: Pair[] = [];
  for (const p of order) {
    const [ci, cj] = [find(p.i), find(p.j)];
    if (ci === cj) continue;
    comp[ci] = cj;
    E.push(p);
    if (E.length === n - 1) break;
  }
  const free = E.map((_, k) => k).filter((k) => E[k].g > 0);
  return { E, free, byGap, rho: ax.map((x) => x[2]) };
}

/** Each member's core distance from the pairs: the centre distance to its k-th nearest
 *  other member, k clamped to 1..n − 1. */
function coreFromPairs(P: Pair[], n: number, coreK: number): number[] {
  const ds: number[][] = Array.from({ length: n }, () => []);
  for (const p of P) {
    ds[p.i].push(p.d);
    ds[p.j].push(p.d);
  }
  const k = Math.max(1, Math.min(n - 1, Math.round(coreK)));
  return ds.map((x) => x.sort((a, b) => a - b)[k - 1] ?? 0);
}

/**
 * How many of the n free links (those whose padded members do not touch) connection keeps,
 * the strongest first: round(connection · n), so 0 keeps none, 1 keeps all, and every count k
 * holds for an equal stretch of connection, 1/n wide, centred on k/n (half that at the ends).
 * Rounding rather than flooring: c = k/n then gives k however it is spelled (⌊0.3 · 3⌋ is 0 in
 * floating point, round(0.3 · 3) is 1), and the slider's tick for k sits in the middle of its
 * step. Link k (from 0, strongest first) enters at (k + 0.5) / n.
 */
export const keptLinks = (connection: number, n: number) =>
  Math.round(Math.max(0, Math.min(1, connection)) * n);

/**
 * The pieces and links for `connection` (PROTOTYPE). The join tree (joinTree, cached per
 * member set and padding) keeps its touching links and the keptLinks strongest free ones; the
 * kept links' components are the pieces. Each piece is drawn with the padded-gap spanning tree
 * of its own members (Kruskal over the pairs by padded gap, the order in which the exact
 * closing merges them as its radius grows), each link a tapered tube between the two members'
 * cores whose padded half-width at each end is neck · (ρ + pad), ρ that member's core radius;
 * members that overlap need no link. At connection 1 the one piece's links are the whole
 * set's gap tree, the earlier blob exactly.
 *
 * `pieceKeys[p]`: what piece p's links and fill depend on (its members), for the per-piece
 * cache.
 */
export function pieceLinks(
  members: BlobMember[],
  pad: number,
  connection: number,
  neck: number
): {
  links: BlobMember[];
  /** each link's piece, and each piece's member indices */
  linkPiece: number[];
  pieces: number[][];
  pieceKeys: string[];
  tree: JoinEdge[];
} {
  const n = members.length;
  const T = memo(key("joinTree", members, pad), () => joinTree(members, pad));
  const nFree = T.free.length;
  const keep = keptLinks(connection, nFree);
  const rank = new Map(T.free.map((k, r) => [k, r]));
  const kc = Array.from({ length: n }, (_, i) => i);
  const kfind = (i: number): number =>
    kc[i] === i ? i : (kc[i] = kfind(kc[i]));
  const tree: JoinEdge[] = T.E.map((e, k) => {
    const r = rank.get(k);
    const kept = r === undefined || r < keep;
    if (kept) kc[kfind(e.i)] = kfind(e.j);
    return {
      gap: e.g,
      kept,
      a: e.a,
      b: e.b,
      overlap: e.overlap,
      enter: r === undefined ? -Infinity : (r + 0.5) / nFree,
      i: e.i,
      j: e.j,
      w: e.w,
      floor: r === undefined,
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
  // each piece's own gap tree
  const c = Array.from({ length: n }, (_, i) => i);
  const f = (i: number): number => (c[i] === i ? i : (c[i] = f(c[i])));
  let left = n - pieces.length;
  const links: BlobMember[] = [];
  const linkPiece: number[] = [];
  for (const p of T.byGap) {
    if (left === 0) break;
    if (kfind(p.i) !== kfind(p.j)) continue;
    const [a, b] = [f(p.i), f(p.j)];
    if (a === b) continue;
    c[a] = b;
    left--;
    if (p.overlap) continue;
    links.push({
      kind: "segment",
      a: p.a,
      b: p.b,
      w: 2 * (neck * (T.rho[p.i] + pad) - pad),
      w2: 2 * (neck * (T.rho[p.j] + pad) - pad),
    });
    linkPiece.push(ids.get(kfind(p.i))!);
  }
  return {
    links,
    linkPiece,
    pieces,
    pieceKeys: pieces.map((p) => p.join(",")),
    tree,
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

/** The outline: see the file's head. */
export function unifiedOutline(
  members: BlobMember[],
  o: UnifiedOptions
): Pt[][] {
  if (members.length === 0) return [];
  const t0 = performance.now();
  const pad = Math.max(0, o.padding);
  const K = keepOuts(o.avoiding ?? [], o.clearance ?? CLEARANCE);
  UNIFIED_STATS.msCached = 0;
  UNIFIED_STATS.msSeparate = 0;
  const shape = o.shape ?? "blob";
  if (shape === "blob") return blobOutline(members, o, pad, K, t0);
  const tClose = performance.now();
  const parts =
    shape === "box"
      ? [{ pm: members, rings: [boxRing(members, pad)] }]
      : filletPieces(members, pad, Math.max(0, o.radius ?? pad), !!o.holes);
  const tCut = performance.now();
  const rings = parts.flatMap(({ pm, rings }) =>
    K.length ? avoidCut(rings, pm, pad, K) : rings
  );
  Object.assign(UNIFIED_STATS, {
    radius: shape === "box" ? Infinity : Math.max(0, o.radius ?? pad),
    radii: undefined,
    ms: performance.now() - t0,
    links: 0,
    linkMembers: [],
    pieces: parts.length,
    joinTree: [],
    msLinks: 0,
    msClose: tCut - tClose,
    msSmooth: performance.now() - tCut,
  });
  return rings;
}

/** A shape's rings cut by the keep-outs, as finish cuts a blob piece: never into the padded
 *  members, the cut's corners rounded inward. */
function avoidCut(
  rings: Pt[][],
  pm: BlobMember[],
  pad: number,
  K: Disc[]
): Pt[][] {
  const F = cutField(
    closingRings(pm, pad, 0, false),
    boxOfRings(rings),
    [],
    0,
    K
  );
  return finish(
    { rings, all: pm, links: [], r: NaN, iterations: 0 },
    { padding: pad, smooth: null },
    pad,
    F
  );
}

/** The padded members' bounding box, as a ring winding as the closing's do, sampled about
 *  every 2 px. */
function boxRing(members: BlobMember[], pad: number): Pt[] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const grow = (x: number, y: number, R: number) => {
    x0 = Math.min(x0, x - R);
    y0 = Math.min(y0, y - R);
    x1 = Math.max(x1, x + R);
    y1 = Math.max(y1, y + R);
  };
  for (const m of members)
    if (m.kind === "disc") grow(m.cx, m.cy, m.r + pad);
    else if (m.kind === "segment") {
      grow(m.a[0], m.a[1], Math.max(0, m.w / 2 + pad));
      grow(m.b[0], m.b[1], Math.max(0, (m.w2 ?? m.w) / 2 + pad));
    } else {
      grow(m.x, m.y, pad);
      grow(m.x + m.w, m.y + m.h, pad);
    }
  const corners: Pt[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const out: Pt[] = [];
  corners.forEach((a, k) => {
    const b = corners[(k + 1) % 4];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
    for (let i = 0; i < n; i++)
      out.push([
        a[0] + ((b[0] - a[0]) * i) / n,
        a[1] + ((b[1] - a[1]) * i) / n,
      ]);
  });
  return out;
}

/** A point inside member m's padded shape (its centre, or a segment's end). */
const insideOf = (m: BlobMember): Pt =>
  m.kind === "disc"
    ? [m.cx, m.cy]
    : m.kind === "segment"
      ? m.a
      : [m.x + m.w / 2, m.y + m.h / 2];

/**
 * The fillet: the exact closing (arcs.ts) of the members grown by pad, by a disc of radius r,
 * one piece per component, each piece closed again on its own members alone.
 *
 * Why the second closing. The exact closing is right (scratch-bumps/fillet/pair.ts: within
 * 0.04 px of a raster closing of the padded union), and it has cusps of its own: two padded
 * discs of radius a whose padded gap g is under 2r but over the gap they join at (2·a·r =
 * a·g + g²/4) are two pieces, and the two r-discs that touch both from either side overlap
 * across the gap. Between those two discs and each member is a horn of the closing, a
 * curvilinear triangle whose tip is a cusp. (Between flat members the two gaps are the same,
 * 2r, and there is no horn.) A piece closed without the other member has no horn, and its
 * concave arcs are the closing's own wherever it is joined. The components only split: a
 * piece's own closing is inside the whole closing, so it never joins two components, and
 * when it splits one (a bridge that held only because another piece's member blocked the
 * disc) its parts are closed again, until none splits.
 *
 * Declared: (1) two members join at the gap their closing joins them at, not at 2r (the same
 * only between flat sides); exactly there the closing pinches to a point, and there the
 * outline steps from two pieces to one (the fillets between them appear at once, where the
 * whole closing grows them as horns first). (2) A piece can still meet itself across a gap
 * with open ground on both sides (a ring of members with a second, narrow opening), and the
 * closing has a horn there; with `holes`, a hole's mouth is such a gap. None on the
 * playground's datasets.
 */
function filletPieces(
  members: BlobMember[],
  pad: number,
  r: number,
  holes: boolean
): { pm: BlobMember[]; rings: Pt[][] }[] {
  return memo(key("fillet", intern(key(members)), pad, r, holes), () => {
    const out: { pm: BlobMember[]; rings: Pt[][] }[] = [];
    const todo: BlobMember[][] = [members];
    while (todo.length) {
      const pm = todo.pop()!;
      const filled = closingRings(pm, pad, r, false);
      const outer = filled.filter((g) => signedArea2(g) > 0);
      const groups = outer.map(() => [] as BlobMember[]);
      if (outer.length > 1)
        for (const m of pm) {
          const p = insideOf(m);
          const k = outer.findIndex((g) => pointInRing(p, g));
          groups[Math.max(0, k)].push(m);
        }
      const split = groups.filter((g) => g.length);
      if (split.length > 1) {
        todo.push(...split);
        continue;
      }
      out.push({ pm, rings: holes ? closingRings(pm, pad, r, true) : filled });
    }
    return out;
  });
}

/** The blob: pieces by connection, each filled, kept apart from the others, cut by the
 *  keep-outs and smoothed (finish). */
function blobOutline(
  members: BlobMember[],
  o: UnifiedOptions,
  pad: number,
  K: Disc[],
  t0: number
): Pt[][] {
  const holes = o.holes ?? false;
  const neck = o.neck ?? 1;
  const J = pieceLinks(members, pad, o.connection ?? 1, neck);
  // PROTOTYPE: the per-piece cache. A piece's links, fill and outline depend on its members,
  // the padding, neck and keep-outs; its separation on the pieces near it; its outline on the
  // convexity options. A connection change recomputes only the pieces whose member set
  // changed (and the separation of the pieces near them); a convexity change reuses every
  // spine, blend table and separation.
  const ctx = intern(key(members, pad, neck));
  // the keep-outs: a piece's spine depends on them only where a link bends
  // around one, so the fill's caches are keyed by the spine itself
  const kid = K.length ? intern(key(K)) : -1;
  const parts = J.pieces.map((idx, p) => {
    const pm = idx.map((i) => members[i]);
    const pk0 = key("piece", ctx, J.pieceKeys[p]);
    const spine = memo(key("spine", pk0, kid), () =>
      routeAround(
        J.links.filter((_, l) => J.linkPiece[l] === p),
        K,
        pad
      )
    );
    const pk = K.length ? key(pk0, intern(JSON.stringify(spine))) : pk0;
    return { pm, spine, pk };
  });
  const tLinks = performance.now();
  // more than one piece: each fill kept out of the ground nearer the others; the key of
  // each piece's forbidden region (its own and its neighbours' pieces)
  const c = o.convexity ?? 0.5;
  const beyondOne = c > 1;
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
    o.beyond,
    o.smooth === undefined ? "blur" : o.smooth,
    holes,
    UNIFIED_PROTOTYPE
  );
  let msFill = 0,
    msFinish = 0;
  const outs = parts.map(({ pm, spine, pk }, p) =>
    memo(
      key("outline", pk, fKeys[p], optKey),
      () => {
        const t1 = performance.now();
        const f = fillOne(pm, spine, o, pad, holes, pk);
        const F =
          parts.length > 1 || K.length ? memo(fKeys[p], forbidden[p]) : null;
        const t2 = performance.now();
        const rings = finish(f, o, pad, F);
        msFill += t2 - t1;
        msFinish += performance.now() - t2;
        return { rings, r: f.r };
      },
      false
    )
  );
  const rings = outs.flatMap((f) => f.rings);
  const radii = outs.map((f) => f.r);
  Object.assign(UNIFIED_STATS, {
    radius: radii[0],
    radii,
    ms: performance.now() - t0,
    links: J.links.length,
    linkMembers: parts.flatMap((p) => p.spine),
    pieces: outs.length,
    joinTree: J.tree,
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

/** One blob piece's fill before the keep-out cut and the smoothing: its members, its links
 *  (`spine`) and the convexity. 0: the spine (the members and links closed at r = padding,
 *  so every concave corner is an arc of at least the padding, as every convex one is); 1 the
 *  padded hull; between, the per-bay blend (meshBlend.ts); above 1, the hull toward the oval
 *  (beyond.ts). `pk`: the cache key of (members, spine). */
function fillOne(
  members: BlobMember[],
  spine: BlobMember[],
  o: UnifiedOptions,
  pad: number,
  holes: boolean,
  pk: string
): Fill {
  const all = [...members, ...spine];
  const c = Math.max(0, Math.min(2, o.convexity ?? 0.5));
  const rMin = pad;
  const hullOf = () => memo(key("hull", pk, pad), () => paddedHull(all, pad));
  const base = { all, links: spine, iterations: 0 };
  if (c > 1) {
    const ends = memo(key("beyondEnds", pk, pad, o.beyond ?? null), () =>
      beyondEnds(hullOf(), all, pad, o.beyond)
    );
    return {
      ...base,
      r: Infinity,
      rings: [beyondHull(hullOf(), all, pad, c, o.beyond)],
      ...(ends ? { beyond: { ...ends, s: Math.min(1, c - 1) } } : {}),
    };
  }
  if (c >= 1) return { ...base, r: Infinity, rings: [hullOf()] };
  if (c <= 0)
    return {
      ...base,
      r: rMin,
      rings: memo(key("spineRes", pk, pad, holes), () =>
        closingRings(all, pad, rMin, holes)
      ),
    };
  // the mesh wants the spine's arcs to 0.05 px (the closing's own sampling is 0.2 px)
  const draft = !!UNIFIED_PROTOTYPE.draft;
  const MB = memo(key("meshBlend", pk, pad, holes, draft), () =>
    buildMeshBlend(
      withArcsTolerance(draft ? 0.2 : 0.05, () =>
        closingRings(all, pad, rMin, holes)
      ),
      draft ? MESH_DRAFT : MESH_BLEND
    )
  );
  UNIFIED_STATS.meshBlend = MB.stats;
  return { ...base, r: NaN, rings: meshBlendRings(MB, c, holes) };
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
