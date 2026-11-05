// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * The curved `enclose` outlines, built on the exact closing of `arcs.ts`:
 * pure geometry, no GoFish nodes.
 *
 *   enclose({ shape, padding, avoiding, clearance }, members)
 *   Shape.blob({ convexity, connection, neck, holes, separate })
 *   Shape.fillet({ radius, neck, holes })    (radius defaults to padding, neck to 0.5)
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
 *     (pieceLinks), bent around the keep-outs (routeAround).
 *  3. Each piece is filled on its own (its spine, padded hull and the
 *     per-bay blend of `convexity`, blend.ts; above 1 the hull blends
 *     toward the oval, beyond.ts). `separate` (default false): the pieces may
 *     overlap, and a piece wholly inside another is dropped; true: the
 *     set's other pieces are its keep-outs, as avoided nodes are (below).
 *  4. Smoothing: a Gaussian along arclength, then the least uniform outward
 *     offset that holds every padded member and link again (smooth.ts).
 *
 * Fillet: the exact closing, by a disc of `radius`, of the padded members and
 * their links: two pieces of the padded union nearer than 2 · radius are
 * joined by a link along the padded-gap spanning tree, `neck` times the
 * padded members' width, as the blob's (filletLinks; neck 0 draws none).
 * Its components are the pieces, and each piece is closed again on its own
 * members (filletPieces): the closing makes a horn with a cusp at its tip
 * where two padded members are near enough for their discs to overlap
 * (padded gap under 2 · radius) but too far apart to join (a gap g between
 * padded discs of radius a joins only when 2·a·radius ≥ a·g + g²/4), and a
 * piece closed without the other has none. No smoothing.
 *
 * Every outline, these and the box and the oval (`cutOutline`), is then cut
 * by the keep-outs (`avoiding`, each grown by `clearance`), and a separate
 * blob piece also by the set's other pieces (their padded members and links
 * grown by the padding and the clearance, so two outlines stay `clearance`
 * apart): one final cut that never enters the padded members (separate.ts,
 * cutRings), its corners rounded inward (smooth.ts, roundCut).
 */
import { signedArea2, pointInRing, segDist, cross } from "../../geometry/plane";
import {
  boxGrid,
  boxOf,
  ccw,
  convexHull,
  type Box,
  type Disc,
  type Member,
  type Pt,
} from "./prims";
import { closingRings } from "./arcs";
import { buildBlend, blendRings } from "./blend";
import { keepIns, roundCut, smoothOutline } from "./smooth";
import { beyondEnds, minkowski } from "./beyond";
import {
  cutField,
  cutRings,
  keepRegion,
  reaches,
  reaching,
  SEPARATE,
  type CutField,
} from "./separate";
import { Frontend } from "gofish-ir";
import type { BlobShape, FilletShape } from "../../../families/shape";

/** enclose's own options, which every outline reads: px between the members
 *  and the outline, and the nodes it stays out of, each grown by `clearance`
 *  (default: the padding). */
export type AvoidOptions = {
  padding: number;
  avoiding?: Member[];
  clearance?: number;
};

/** The options of {@link encloseOutline}: a `Shape.blob` (or its presets
 *  spine and hull) or a `Shape.fillet`, with enclose's own. */
export type OutlineOptions = (BlobShape | FilletShape) & AvoidOptions;

/** The `Shape` family's defaults, as gofish-ir's STRATEGIES declares them. */
const { blob: BLOB, fillet: FILLET } = Frontend.STRATEGIES.Shape.kinds;
const BLOB_DEFAULT = {
  convexity: BLOB.params.convexity.default as number,
  connection: BLOB.params.connection.default as number,
  neck: BLOB.params.neck.default as number,
  holes: BLOB.params.holes.default as boolean,
  separate: BLOB.params.separate.default as boolean,
};
const FILLET_DEFAULT = {
  neck: FILLET.params.neck.default as number,
  holes: FILLET.params.holes.default as boolean,
};

/** A fillet's closing radius: its own, or the padding (its declared default),
 *  so an inside corner is as round as the padding makes an outside one. */
const filletRadius = (shape: FilletShape, pad: number) =>
  Math.max(0, shape.radius ?? pad);

/** The core distance's k in the join tree's mutual reachability: the center
 *  distance to the k-th nearest other member (HDBSCAN's min_samples = 5,
 *  which counts the member itself). */
const CORE_K = 4;

// ── members as a core (point, segment or box) plus a radius ─────────────────

type Core =
  | { k: "seg"; a: Pt; b: Pt; rho: number }
  | { k: "box"; x0: number; y0: number; x1: number; y1: number };

const coreOf = (m: Member): Core =>
  m.kind === "disc"
    ? { k: "seg", a: [m.cx, m.cy], b: [m.cx, m.cy], rho: m.r }
    : m.kind === "segment"
      ? { k: "seg", a: m.a, b: m.b, rho: Math.max(m.w, m.w2 ?? m.w) / 2 }
      : { k: "box", x0: m.x, y0: m.y, x1: m.x + m.w, y1: m.y + m.h };

const edgesOf = (c: Core): [Pt, Pt][] =>
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
  const d1 = cross(p, q, r),
    d2 = cross(p, q, s),
    d3 = cross(r, s, p),
    d4 = cross(r, s, q);
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
  for (const [p, q] of edgesOf(A))
    for (const [r, s] of edgesOf(B)) {
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

// ── connection: which members are one piece ─────────────────────────────────
//
// `connection` is discrete by design: a tree link is either cut or kept, and a kept one is
// drawn at its full neck width. The outline is a function of the set of kept links alone, so
// it changes only where connection crosses a link's entry, and the pieces only ever merge as
// connection grows.

/** A member pair: its padded gap, center distance, tree weight and link axis. */
type Pair = {
  i: number;
  j: number;
  /** padded gap, px: the members' gap less twice the padding */
  g: number;
  /** center distance: between the members' core axes, px */
  d: number;
  /** the join tree's distance, the mutual reachability (set by joinTree, its
   *  only reader) */
  w: number;
  /** whether the members themselves overlap (their gap unpadded ≤ 0) */
  overlap: boolean;
  a: Pt;
  b: Pt;
};

/**
 * A member set's pairs at a padding, each worked out only when asked for, and once: its gap (nearest),
 * its core axes' nearest points and their distance. A grid over the members' boxes (each
 * box holds the member's shape and its core axis, so two boxes' gap is at most both the
 * members' gap and their center distance) visits the members within a box gap r of one.
 * Every search below widens r until no pair past it can matter, so the trees are exactly
 * those over all n² pairs, without working out most of them.
 */
type PairTable = {
  n: number;
  /** the pair (i, j), i < j: one object per pair */
  pair(i: number, j: number): Pair;
  /** calls f on every member whose box may be within r of member i's (a superset, in no
   *  set order; not reentrant) */
  near(i: number, r: number, f: (j: number) => void): void;
  /** a box gap no two members exceed: past it, every member is near */
  reach: number;
  /** a first search radius: about the spacing of the members along their spread */
  step: number;
  /** each member's core radius */
  rho: number[];
};

function pairTable(members: Member[], pad: number): PairTable {
  const n = members.length;
  const prims = members.map(coreOf);
  const ax = members.map(coreAxis);
  const bb = prims.map((c) =>
    c.k === "box"
      ? [c.x0, c.y0, c.x1, c.y1]
      : [
          Math.min(c.a[0], c.b[0]) - c.rho,
          Math.min(c.a[1], c.b[1]) - c.rho,
          Math.max(c.a[0], c.b[0]) + c.rho,
          Math.max(c.a[1], c.b[1]) + c.rho,
        ]
  );
  const grid = boxGrid(bb);
  let [X0, Y0, X1, Y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of bb) {
    X0 = Math.min(X0, b[0]);
    Y0 = Math.min(Y0, b[1]);
    X1 = Math.max(X1, b[2]);
    Y1 = Math.max(Y1, b[3]);
  }
  const [W, H] = [X1 - X0, Y1 - Y0];
  const cache = new Map<number, Pair>();
  return {
    n,
    pair(i, j) {
      if (i > j) [i, j] = [j, i];
      const k = i * n + j;
      let p = cache.get(k);
      if (!p) {
        const g = nearest(prims[i], prims[j])[2];
        const [x, y] = segSeg(ax[i][0], ax[i][1], ax[j][0], ax[j][1]);
        p = {
          i,
          j,
          g: g - 2 * pad,
          d: Math.hypot(x[0] - y[0], x[1] - y[1]),
          w: 0,
          overlap: g <= 0,
          a: x,
          b: y,
        };
        cache.set(k, p);
      }
      return p;
    },
    near(i, r, f) {
      const b = bb[i];
      grid.each(b[0] - r, b[1] - r, b[2] + r, b[3] + r, f);
    },
    reach: Math.hypot(W, H) + 1,
    step: Math.max(Math.max(W, H) / n, 1e-6),
    rho: ax.map((x) => x[2]),
  };
}

/**
 * The minimum spanning forest of each group's members (the complete graph on the members
 * with one `group` value; a negative group is left out), under the strict order `less`, by
 * Borůvka: each round, every component takes its least pair to another component of its
 * group, until none has one. `edge(i, j)`: the pair as an edge, or null where it is none.
 * `reach(e)`: a box gap past which no pair comes before e; `cap`: a box gap past which no
 * pair is an edge. Returned in `less` order, so the forest and its order are Kruskal's over
 * all pairs.
 *
 * A member's search widens (doubling from T.step) until it passes its own least edge's
 * reach, or its component's best edge's (then nothing it has not seen comes first). A
 * member's candidates only shrink as components merge, so its least edge only grows: each
 * member keeps a bound (an edge its least does not come before), and one whose bound does
 * not come before its component's best is skipped. The members are visited by bound, the
 * least first, so a component's best is found early and most members are skipped.
 */
function spanningForest(
  T: PairTable,
  group: ArrayLike<number>,
  edge: (i: number, j: number) => Pair | null,
  less: (p: Pair, q: Pair) => boolean,
  reach: (e: Pair) => number,
  cap = Infinity
): Pair[] {
  const { n } = T;
  const c = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (c[i] === i ? i : (c[i] = find(c[i])));
  const order = (p: Pair, q: Pair) => (less(p, q) ? -1 : less(q, p) ? 1 : 0);
  // each group's component count, so a group in one piece is not searched again
  const left = new Map<number, number>();
  for (let i = 0; i < n; i++)
    if (group[i] >= 0) left.set(group[i], (left.get(group[i]) ?? 0) + 1);
  // bound[i]: an edge member i's least edge does not come before; exact[i]: it is that
  // least edge (it stays so while its ends are in two components); none[i]: i has no
  // edge, and never will
  const bound: (Pair | undefined)[] = new Array(n);
  const exact = new Uint8Array(n);
  const none = new Uint8Array(n);
  const end = Math.min(cap, T.reach);
  const out: Pair[] = [];
  let todo = Array.from({ length: n }, (_, i) => i).filter(
    (i) => group[i] >= 0
  );
  while (todo.length) {
    todo = todo.filter((i) => !none[i] && left.get(group[i])! > 1);
    todo.sort((i, j) => {
      const [p, q] = [bound[i], bound[j]];
      return p && q ? order(p, q) : p ? 1 : q ? -1 : 0;
    });
    const best = new Map<number, Pair>();
    const offer = (ci: number, e: Pair) => {
      const b = best.get(ci);
      if (!b || less(e, b)) best.set(ci, e);
    };
    for (const i of todo) {
      const gi = group[i];
      const ci = find(i);
      const o = bound[i];
      if (o && exact[i] && find(o.i) !== find(o.j)) {
        offer(ci, o);
        continue;
      }
      const b0 = best.get(ci);
      if (o && b0 && !less(o, b0)) continue;
      let mine: Pair | null = null;
      for (let r = T.step; ; r *= 2) {
        T.near(i, r, (j) => {
          if (j === i || group[j] !== gi || find(j) === ci) return;
          const e = edge(i, j);
          if (e && (!mine || less(e, mine))) mine = e;
        });
        const m = mine as Pair | null;
        if (m) offer(ci, m);
        if (r >= end || (m && r >= reach(m))) {
          // the search saw every pair that could come first: m is i's least
          if (m) [bound[i], exact[i]] = [m, 1];
          else none[i] = 1;
          break;
        }
        const b = best.get(ci);
        if (b && r >= reach(b)) {
          // nothing i has not seen comes before b, nor did anything it saw
          if (!o || less(o, b)) [bound[i], exact[i]] = [b, 0];
          break;
        }
      }
    }
    if (!best.size) break;
    for (const e of best.values()) {
      const [a, b] = [find(e.i), find(e.j)];
      if (a === b) continue;
      c[a] = b;
      out.push(e);
      left.set(group[e.i], left.get(group[e.i])! - 1);
    }
  }
  return out.sort(order);
}
/** The join tree of a member set: its edges in Kruskal order (touching first, then the
 *  strongest). */
type JoinTree = {
  E: Pair[];
  /** the edges that do not touch, the strongest first (E's order) */
  free: number[];
};

const byIndex = (p: Pair, q: Pair) => p.i - q.i || p.j - q.j;

/**
 * The join tree. HDBSCAN's: the minimum spanning tree over ALL member pairs, by
 * Kruskal, in mutual reachability (Campello, Moulavi and Sander 2013; McInnes, Healy and
 * Astels, the hdbscan library), w = max(core(a), core(b), d), d the center distance (between
 * the members' core axes: the centers, for dots) and core(m) the center distance from m to its
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
 * center distance, then by index: among the edges that merge at one distance the tree takes the
 * nearest pair.
 *
 * It does not look at all n² pairs (spanningForest): a pair's box gap is at most its gap and
 * its center distance, so a pair past a box gap of max(2 · pad, w) comes after an edge of
 * weight w, and one past g + 2 · pad after a touching edge of padded gap g.
 */
function joinTree(T: PairTable, pad: number): JoinTree {
  const core = coreDistances(T, CORE_K);
  const joinLess = (p: Pair, q: Pair) => {
    const fp = p.g <= 0,
      fq = q.g <= 0;
    if (fp !== fq) return fp;
    const o = fp ? p.g - q.g : p.w - q.w || p.d - q.d;
    return (o || byIndex(p, q)) < 0;
  };
  const E = spanningForest(
    T,
    new Array(T.n).fill(0),
    (i, j) => {
      const p = T.pair(i, j);
      p.w = Math.max(core[p.i], core[p.j], p.d);
      return p;
    },
    joinLess,
    (e) => (e.g <= 0 ? e.g + 2 * pad : Math.max(2 * pad, e.w))
  );
  const free = E.map((_, k) => k).filter((k) => E[k].g > 0);
  return { E, free };
}

/**
 * The padded-gap spanning forest of each group's members (`group[i]`: member i's), in
 * Kruskal's order over the pairs by padded gap, ties by index (the order in which the exact
 * closing merges them as its radius grows); `below`: only pairs whose padded gap is under it.
 * A pair past a box gap of g + 2 · pad comes after an edge of padded gap g (spanningForest).
 */
function gapForest(
  T: PairTable,
  pad: number,
  group: ArrayLike<number>,
  below = Infinity
): Pair[] {
  return spanningForest(
    T,
    group,
    (i, j) => {
      const p = T.pair(i, j);
      return p.g < below ? p : null;
    },
    (p, q) => (p.g - q.g || byIndex(p, q)) < 0,
    (e) => e.g + 2 * pad,
    below + 2 * pad
  );
}

/** Each member's core distance: the center distance to its k-th nearest other member, k
 *  clamped to 1..n − 1 (0 for a lone member). The search widens until k members are
 *  within it by center distance; a center distance is at least the box gap, so none
 *  nearer is missed. */
function coreDistances(T: PairTable, coreK: number): number[] {
  const k = Math.max(1, Math.min(T.n - 1, Math.round(coreK)));
  // the k least center distances seen, least first (m of them)
  const least = new Float64Array(k);
  let m = 0;
  const add = (d: number) => {
    if (m === k && d >= least[k - 1]) return;
    let q = m < k ? m++ : k - 1;
    for (; q > 0 && least[q - 1] > d; q--) least[q] = least[q - 1];
    least[q] = d;
  };
  return Array.from({ length: T.n }, (_, i) => {
    for (let r = T.step; ; r *= 2) {
      m = 0;
      let within = 0;
      T.near(i, r, (j) => {
        if (j === i) return;
        const d = T.pair(i, j).d;
        add(d);
        if (d <= r) within++;
      });
      if (within >= k || r >= T.reach) return m === k ? least[k - 1] : 0;
    }
  });
}

/**
 * How many of the n free links (those whose padded members do not touch) connection keeps,
 * the strongest first: round(connection · n), so 0 keeps none, 1 keeps all, and every count k
 * holds for an equal stretch of connection, 1/n wide, centered on k/n (half that at the ends).
 * Rounding rather than flooring: c = k/n then gives k however it is spelled (⌊0.3 · 3⌋ is 0 in
 * floating point, round(0.3 · 3) is 1), and the slider's tick for k sits in the middle of its
 * step. Link k (from 0, strongest first) enters at (k + 0.5) / n.
 */
const keptLinks = (connection: number, n: number) =>
  Math.round(Math.max(0, Math.min(1, connection)) * n);

/** Whether connection keeps every free link of a join tree on n members, whatever their
 *  count (at most n − 1, the tree's links): then the members are one piece, and the join
 *  tree need not be found. Always at connection 1, the default. */
const keepsAll = (connection: number, n: number) => {
  for (let k = 1; k < n; k++) if (keptLinks(connection, k) < k) return false;
  return true;
};

/**
 * The pieces and links for `connection`. The join tree (joinTree) keeps its touching links and the keptLinks strongest free ones; the
 * kept links' components are the pieces (one, with no join tree found, when connection keeps
 * every link: keepsAll). Each piece is drawn with the padded-gap spanning tree
 * of its own members (Kruskal over the pairs by padded gap, the order in which the exact
 * closing merges them as its radius grows), each link a tapered tube between the two members'
 * cores whose padded half-width at each end is neck · (ρ + pad), ρ that member's core radius;
 * members that overlap need no link. At connection 1 the one piece's links are the whole
 * set's gap tree. One pair table (pairTable) serves the join tree, the gap trees and the
 * links' widths.
 */
export function pieceLinks(
  members: Member[],
  pad: number,
  connection: number,
  neck: number
): {
  links: Member[];
  /** each link's piece, and each piece's member indices */
  linkPiece: number[];
  pieces: number[][];
} {
  const n = members.length;
  const T = pairTable(members, pad);
  const kc = Array.from({ length: n }, (_, i) => i);
  const kfind = (i: number): number =>
    kc[i] === i ? i : (kc[i] = kfind(kc[i]));
  if (keepsAll(connection, n)) {
    // every link is kept, however many are free: one piece, and no join tree
    for (let i = 1; i < n; i++) kc[i] = 0;
  } else {
    const J = joinTree(T, pad);
    const keep = keptLinks(connection, J.free.length);
    const rank = new Map(J.free.map((k, r) => [k, r]));
    J.E.forEach((e, k) => {
      const r = rank.get(k);
      if (r === undefined || r < keep) kc[kfind(e.i)] = kfind(e.j);
    });
  }
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
  const piece = Array.from({ length: n }, (_, i) => ids.get(kfind(i))!);
  const links: Member[] = [];
  const linkPiece: number[] = [];
  for (const p of gapForest(T, pad, piece)) {
    if (p.overlap) continue;
    links.push(linkOf(p, T.rho, pad, neck));
    linkPiece.push(piece[p.i]);
  }
  return { links, linkPiece, pieces };
}

/** The link along pair p: a tapered tube between the two members' cores whose padded
 *  half-width at each end is neck · (ρ + pad), ρ that member's core radius. */
const linkOf = (p: Pair, rho: number[], pad: number, neck: number): Member => ({
  kind: "segment",
  a: p.a,
  b: p.b,
  w: 2 * (neck * (rho[p.i] + pad) - pad),
  w2: 2 * (neck * (rho[p.j] + pad) - pad),
});

/** A member's core axis (two points, equal for a disc) and radius. */
function coreAxis(m: Member): [Pt, Pt, number] {
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

// ── hull ──────────────────────────────────────────────────────────────

/** The padded members' boundary points, about every 0.5 px. */
function paddedSamples(members: Member[], pad: number): Pt[] {
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
function paddedHull(members: Member[], pad: number): Pt[] {
  const h = convexHull(paddedSamples(members, pad));
  return ccw(h);
}

// ── keep-outs ───────────────────────────────────────────────────────────────

/** Keep-out discs: each avoided member grown by clearance. A segment is
 *  discs along it, every 2 px; a box is its circumscribed disc (declared:
 *  a long box keeps out more than itself, #1247). */
function keepOuts(avoiding: Member[], clearance: number): Disc[] {
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
 * +y, on a tie): one disc at a time, at most four levels deep.
 */
function routeAround(links: Member[], K: Disc[], pad: number): Member[] {
  if (K.length === 0) return links;
  // the discs that may reach a link: a disc whose center is within R + e of a link meets the
  // link's box grown by e
  const grid = boxGrid(
    K.map(({ c, R }) => [c[0] - R, c[1] - R, c[0] + R, c[1] + R])
  );
  return routeLinks(links, K, grid, pad, 0);
}
function routeLinks(
  links: Member[],
  K: Disc[],
  grid: ReturnType<typeof boxGrid>,
  pad: number,
  depth: number
): Member[] {
  if (depth > 3) return links;
  const out: Member[] = [];
  for (const l of links) {
    if (l.kind !== "segment") {
      out.push(l);
      continue;
    }
    const [a, b] = [l.a, l.b];
    let hit: Disc | undefined;
    let hd = Infinity;
    const e = Math.max(0, pad + Math.max(l.w, l.w2 ?? l.w) / 2);
    // in index order, so a tie goes to the first
    for (const q of grid.query(
      Math.min(a[0], b[0]) - e,
      Math.min(a[1], b[1]) - e,
      Math.max(a[0], b[0]) + e,
      Math.max(a[1], b[1]) + e
    )) {
      const k = K[q];
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
    const segs: Member[] = [];
    for (let i = 0; i + 1 < pts.length; i++)
      segs.push({
        kind: "segment",
        a: pts[i],
        b: pts[i + 1],
        w: wAt(i),
        w2: wAt(i + 1),
      });
    out.push(...routeLinks(segs, K, grid, pad, depth + 1));
  }
  return out;
}

// ── the outline ─────────────────────────────────────────────────────────────

/** The outline: see the file's head. No members, no outline. */
export function encloseOutline(members: Member[], o: OutlineOptions): Pt[][] {
  if (members.length === 0) return [];
  const pad = Math.max(0, o.padding);
  const clearance = Math.max(0, o.clearance ?? pad);
  const K = keepOuts(o.avoiding ?? [], clearance);
  if (o.kind === "blob") return blobOutline(members, o, pad, clearance, K);
  const neck = Math.max(0, Math.min(1, o.neck ?? FILLET_DEFAULT.neck));
  const keep = keepOutRegion(K);
  return filletPieces(
    members,
    pad,
    filletRadius(o, pad),
    o.holes ?? FILLET_DEFAULT.holes,
    neck
  ).flatMap(({ pm, rings }) => avoidCut(rings, pm, pad, keep));
}

/**
 * Any outline (the box's, the oval's) cut by the keep-outs: `avoiding`, each
 * grown by `clearance` (default: the padding), as a blob's or a fillet's is.
 * `rings` itself (the same array) when no keep-out reaches it.
 */
export function cutOutline(
  rings: Pt[][],
  members: Member[],
  o: AvoidOptions
): Pt[][] {
  const pad = Math.max(0, o.padding);
  const K = keepOuts(o.avoiding ?? [], Math.max(0, o.clearance ?? pad));
  if (!members.length) return rings;
  return avoidCut(rings, members, pad, keepOutRegion(K));
}

/** For an outline's box, the rings of keep-out discs K's region (keepRegion) that reach it
 *  (separate.ts, reaching). The region is closed once, and only when an outline comes within
 *  the cut's reach of the discs: it lies within them grown by SEPARATE.open (a closing lies
 *  within the dilation by its disc), so an outline farther than that from their box is not
 *  cut. */
type KeepOutRegion = (box: Box) => Pt[][];
function keepOutRegion(K: Disc[]): KeepOutRegion {
  if (!K.length) return () => [];
  const g = SEPARATE.open + 1;
  const bound: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { c, R } of K) {
    bound[0] = Math.min(bound[0], c[0] - R - g);
    bound[1] = Math.min(bound[1], c[1] - R - g);
    bound[2] = Math.max(bound[2], c[0] + R + g);
    bound[3] = Math.max(bound[3], c[1] + R + g);
  }
  let region: Pt[][] | undefined;
  return (box) =>
    reaches(bound, box)
      ? reaching((region ??= keepRegion(K, SEPARATE.open)), box)
      : [];
}

/** A shape's rings (a blob piece, a fillet piece, the box) cut by the keep-outs' region:
 *  never into the padded members (a link is cut like any other ground), the cut's corners
 *  rounded inward (cutAndRound), and what the cut fences off from every member dropped.
 *  `rings` itself when no keep-out reaches them. */
function avoidCut(
  rings: Pt[][],
  pm: Member[],
  pad: number,
  keepOut: KeepOutRegion
): Pt[][] {
  const box = boxOf(rings);
  const keep = keepOut(box);
  if (!keep.length) return rings;
  const F = cutField(closingRings(pm, pad, 0, false), box, keep);
  const cut = cutAndRound(rings, pm, pad, F);
  // the ground the keep-outs fence off from every member (a link's or a fill's sliver
  // between keep-outs) is not the enclosure: an outer ring that holds no member is dropped,
  // and the holes inside it
  const outer = cut.filter((r) => signedArea2(r) > 0);
  const kept = outer.filter((r) => pm.some((m) => pointInRing(insideOf(m), r)));
  if (kept.length === outer.length) return cut;
  return cut.filter((r) =>
    signedArea2(r) > 0
      ? kept.includes(r)
      : kept.some((o) => pointInRing(r[0], o))
  );
}

/** A point inside member m's padded shape (its center, or a segment's end). */
const insideOf = (m: Member): Pt =>
  m.kind === "disc"
    ? [m.cx, m.cy]
    : m.kind === "segment"
      ? m.a
      : [m.x + m.w / 2, m.y + m.h / 2];

/**
 * The fillet's links: the pieces are the padded members' union's components (members
 * whose padding touches are one piece), and two pieces whose padded gap is under 2r are joined
 * by a link along the padded-gap spanning tree (Kruskal over the member pairs by padded gap,
 * stopping at 2r), each a tapered tube between the two members' cores whose padded half-width
 * at each end is neck · (ρ + pad), as the blob's links are (pieceLinks). neck 0: no links.
 *
 * Why 2r. Grown by r, two padded members overlap exactly when their padded gap is under 2r:
 * the disc cannot pass between them. Between flat sides the closing then fills the gap; between
 * curved members it joins them only below a smaller gap (2·a·r = a·g + g²/4 for padded discs of
 * radius a), and in between it has a horn on each member (filletPieces). A link across every
 * such gap leaves the closing none to make a horn in, and over 2r it makes none.
 */
function filletLinks(
  members: Member[],
  pad: number,
  r: number,
  neck: number
): Member[] {
  if (!(neck > 0) || !(r > 0)) return [];
  const T = pairTable(members, pad);
  return (
    gapForest(T, pad, new Array(members.length).fill(0), 2 * r)
      // padded members that touch are one piece already (a blob links them: pieceLinks)
      .filter((p) => p.g > 0)
      .map((p) => linkOf(p, T.rho, pad, neck))
  );
}

/**
 * The fillet: the exact closing (arcs.ts), by a disc of radius r, of the members and their
 * links (filletLinks) grown by pad, one piece per component, each piece closed again on its
 * own members and links alone. `pm`: a piece's members (its links are cut by the keep-outs
 * like any other ground).
 *
 * Why the second closing. The exact closing is right (within 0.04 px of a raster closing of
 * the padded union), and it has cusps of its own: two padded
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
 * closing has a horn there; with `holes`, a hole's mouth is such a gap.
 */
function filletPieces(
  members: Member[],
  pad: number,
  r: number,
  holes: boolean,
  neck: number
): { pm: Member[]; rings: Pt[][] }[] {
  const isLink = new Set<Member>(filletLinks(members, pad, r, neck));
  const out: { pm: Member[]; rings: Pt[][] }[] = [];
  const todo: Member[][] = [[...members, ...isLink]];
  while (todo.length) {
    const all = todo.pop()!;
    const filled = closingRings(all, pad, r, false);
    const outer = filled.filter((g) => signedArea2(g) > 0);
    const groups = outer.map(() => [] as Member[]);
    if (outer.length > 1)
      for (const m of all) {
        const p = insideOf(m);
        const k = outer.findIndex((g) => pointInRing(p, g));
        groups[Math.max(0, k)].push(m);
      }
    const split = groups.filter((g) => g.some((m) => !isLink.has(m)));
    if (split.length > 1) {
      todo.push(...split);
      continue;
    }
    out.push({
      pm: all.filter((m) => !isLink.has(m)),
      rings: holes ? closingRings(all, pad, r, true) : filled,
    });
  }
  return out;
}

/** The blob: pieces by connection, each filled and smoothed (smoothFill), then cut by its
 *  keep-outs as every shape is (avoidCut): the avoided members and, with `separate: true`,
 *  the set's other pieces. Without `separate` (the default) a piece that lies wholly inside
 *  another is dropped (contained). */
function blobOutline(
  members: Member[],
  o: BlobShape,
  pad: number,
  clearance: number,
  K: Disc[]
): Pt[][] {
  const holes = o.holes ?? BLOB_DEFAULT.holes;
  const J = pieceLinks(
    members,
    pad,
    o.connection ?? BLOB_DEFAULT.connection,
    o.neck ?? BLOB_DEFAULT.neck
  );
  // each piece's members and spine: its links, bent around the keep-outs (so the final cut
  // does not sever the piece there)
  const parts = J.pieces.map((idx, p) => ({
    pm: idx.map((i) => members[i]),
    spine: routeAround(
      J.links.filter((_, l) => J.linkPiece[l] === p),
      K,
      pad
    ),
  }));
  // each piece's outline: filled and smoothed on its own, then cut by its keep-outs
  const convexity = o.convexity ?? BLOB_DEFAULT.convexity;
  const outs = parts.map(({ pm, spine }) =>
    smoothFill(fillOne(pm, spine, pad, convexity, holes), pad)
  );
  // each piece's keep-outs: the avoided members, and with `separate: true` the set's other
  // pieces as keep-outs too (their padded members and links grown by padding + clearance, so
  // the two outlines stay `clearance` apart), those that can reach its outline's box (the
  // closing by SEPARATE.open reaches 2 · open past a disc)
  const separate = o.separate ?? BLOB_DEFAULT.separate;
  const others =
    parts.length > 1 && separate
      ? parts.map(({ pm, spine }) =>
          keepOuts([...pm, ...spine], pad + clearance)
        )
      : null;
  const keepK = keepOutRegion(K);
  const keepOf = (p: number, rings: Pt[][]): KeepOutRegion => {
    if (!others) return keepK;
    const [x0, y0, x1, y1] = boxOf(rings);
    const m = 2 * SEPARATE.open + 1;
    const near = others.flatMap((D, q) =>
      q === p
        ? []
        : D.filter(
            ({ c, R }) =>
              c[0] + R >= x0 - m &&
              c[0] - R <= x1 + m &&
              c[1] + R >= y0 - m &&
              c[1] - R <= y1 + m
          )
    );
    return near.length ? keepOutRegion([...K, ...near]) : keepK;
  };
  const cut = outs.map((rings, p) =>
    avoidCut(rings, parts[p].pm, pad, keepOf(p, rings))
  );
  const byPiece = !separate && cut.length > 1 ? contained(cut) : cut;
  return byPiece.flat();
}

/** A blob's pieces with every piece that lies wholly inside another dropped: the other
 *  already covers it, so the union is unchanged. Two pieces that cover each other exactly
 *  keep the first. Containment is transitive, so testing each piece against every other is
 *  enough. Pieces that only partly overlap are kept as they are. */
function contained(pieces: Pt[][][]): Pt[][][] {
  const boxes = pieces.map(boxOf);
  const within = (p: number, q: number) => {
    const [a, b] = [boxes[p], boxes[q]];
    return (
      a[0] >= b[0] &&
      a[1] >= b[1] &&
      a[2] <= b[2] &&
      a[3] <= b[3] &&
      regionInRegion(pieces[p], pieces[q])
    );
  };
  return pieces.filter(
    (_, p) =>
      !pieces.some(
        (_, q) => q !== p && within(p, q) && (q < p || !within(q, p))
      )
  );
}

/** Whether region A (rings, even-odd, so holes count) lies inside region B: every vertex of
 *  A is inside B, no edge of A crosses an edge of B, and no vertex of B is inside A (else a
 *  hole of B, or a part of B's boundary, lies within A). Exact: points on a boundary are a
 *  measure-zero case these floating outlines do not hit, so no tolerance. */
function regionInRegion(A: Pt[][], B: Pt[][]): boolean {
  const inside = (p: Pt, R: Pt[][]) =>
    R.reduce((w, r) => w !== pointInRing(p, r), false);
  if (!A.every((r) => r.every((p) => inside(p, B)))) return false;
  if (B.some((r) => r.some((p) => inside(p, A)))) return false;
  // B's edges that meet A's box, on a grid; each edge of A is tested against those its box
  // meets (two edges whose boxes are apart cannot cross)
  const [ax0, ay0, ax1, ay1] = boxOf(A);
  const E: [Pt, Pt][] = [];
  for (const s of B)
    for (let k = 0, l = s.length - 1; k < s.length; l = k++) {
      const [c, d] = [s[l], s[k]];
      if (
        Math.max(c[0], d[0]) < ax0 ||
        Math.min(c[0], d[0]) > ax1 ||
        Math.max(c[1], d[1]) < ay0 ||
        Math.min(c[1], d[1]) > ay1
      )
        continue;
      E.push([c, d]);
    }
  const grid = boxGrid(E.map(edgeBox));
  let crosses = false;
  for (const r of A)
    for (let i = 0, j = r.length - 1; i < r.length && !crosses; j = i++) {
      const [a, b] = [r[j], r[i]];
      const [x0, y0, x1, y1] = edgeBox([a, b]);
      grid.each(x0, y0, x1, y1, (k) => {
        const [c, d] = E[k];
        if (
          cross(a, b, c) * cross(a, b, d) < 0 &&
          cross(c, d, a) * cross(c, d, b) < 0
        )
          crosses = true;
      });
    }
  return !crosses;
}

const edgeBox = ([a, b]: [Pt, Pt]) => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[0], b[0]),
  Math.max(a[1], b[1]),
];

/** One blob piece's fill, before the smoothing and the keep-out cut. */
type Fill = {
  rings: Pt[][];
  /** the piece's members and links, which the smoothing keeps inside */
  all: Member[];
  /** above convexity 1: the padded hull and the oval it blends toward
   *  (smoothFill draws the blend from the smoothed hull; `rings` is empty) */
  beyond?: { Hc: Pt[]; E: Pt[]; s: number };
};

/** One blob piece's fill before the keep-out cut and the smoothing: its members, its links
 *  (`spine`) and the convexity. 0: the spine (the members and links closed at r = padding,
 *  so every concave corner is an arc of at least the padding, as every convex one is); 1 the
 *  padded hull; between, the per-bay blend (blend.ts); above 1, the hull toward the oval
 *  (beyond.ts). */
function fillOne(
  members: Member[],
  spine: Member[],
  pad: number,
  convexity: number,
  holes: boolean
): Fill {
  const all = [...members, ...spine];
  const c = Math.max(0, Math.min(2, convexity));
  if (c > 1) {
    const ends = beyondEnds(paddedHull(all, pad), all, pad);
    return { all, rings: [], beyond: { ...ends, s: c - 1 } };
  }
  if (c >= 1) return { all, rings: [paddedHull(all, pad)] };
  if (c <= 0) return { all, rings: closingRings(all, pad, pad, holes) };
  // the blend wants the spine's arcs to 0.05 px (the closing's own sampling is 0.2 px)
  const MB = buildBlend(closingRings(all, pad, pad, holes, 0.05));
  return { all, rings: blendRings(MB, c, holes) };
}

/**
 * A fill smoothed (smooth.ts), before any keep-out cut: the cut comes after the smoothing
 * (avoidCut), so the smoothing's outward offset (which holds every padded member again)
 * never pushes the outline back across it.
 *
 * Above convexity 1 the outline is (2 − c)·S ⊕ (c − 1)·oval, S the convex
 * hull of the smoothed padded hull (the outline at convexity 1): no blur of
 * its own, so convexity 2 is Shape.oval() exactly, the curvature jumps of
 * the hull's sides never come back, and the area grows with c (a Minkowski
 * blend of nested convex sets grows toward the larger).
 */
function smoothFill(f: Fill, pad: number): Pt[][] {
  const keep = keepIns(f.all, pad);
  if (!f.beyond) return smoothOutline(f.rings, keep);
  const { Hc, E, s } = f.beyond;
  const S = convexHull(smoothOutline([Hc], keep).flat());
  return [minkowski(S, 1 - s, E, s)];
}

/**
 * Rings cut once by their field `F` (separate.ts: the keep-outs, never the shape's own
 * padded members `all`). The corners the cut leaves (where the outline meets a keep-out, and
 * between two keep-outs) are rounded inward only (roundCut), so the rounding never crosses F.
 */
function cutAndRound(
  rings: Pt[][],
  all: Member[],
  pad: number,
  F: CutField
): Pt[][] {
  const c = cutRings(F, rings);
  return roundCut(c.rings, c.cut, keepIns(all, pad), SEPARATE.round);
}
