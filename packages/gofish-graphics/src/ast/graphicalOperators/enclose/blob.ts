// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * The outline of `Shape.blob()`: pure geometry, no GoFish nodes.
 *
 * `blobOutline(members, opts)` returns the closed loops of the region that
 * holds `members`, in the members' own pixel frame. The outer loops run one
 * way and the holes the other, so the loops drawn as one path with the
 * nonzero fill rule fill the region and leave the holes open.
 *
 * The construction, for one set:
 *  1. Skeleton: the Delaunay triangles of the members' sites, filled smallest
 *     circumradius first until they hold `convexity` of the hull's area, plus
 *     the minimum spanning tree over the members, routed around the avoided
 *     nodes, so the set stays in one piece.
 *  2. Pieces: each member grown by `padding`, each link as a tube, the filled
 *     triangles. Their union minus each avoided node's keep-out zone (the node
 *     grown by `clearance`) is the region.
 *  3. Exact outline: every piece and zone has a closed-form signed distance,
 *     so the region's outline is traced exactly. With `holes: false` every
 *     hole is filled and the keep-out zones it held are cut back out.
 *  4. Neck: the outline is pulled in between members by (1 - neck) times the
 *     region's half-width there; a member's bulge never moves.
 *  5. Rounding: a Gaussian of width roundness / 2 along the outline, with each
 *     point on a circle first moved out by the factor smoothing pulls that
 *     circle in, so circles and straight sides stay exact and only corners
 *     round. The pieces and holes never change.
 *
 * Ported from the prototype of PR #1152 (`smoothBlob`); the design and its
 * history are in the PR's `proposals/background-hull/`, in git history.
 */
import { Delaunay } from "d3-delaunay";
import { ringExtent } from "../../geometry/box";
import { pointInRing, signedArea2 } from "../../geometry/plane";

/** A point in pixels. */
export type Pt = [number, number];
/** One member of a blob, or one avoided node: a disc (a circle node), a box
 *  (any other node, by its bounding box), or a segment (one straight piece
 *  of a drawn line, `w` its stroke width). An ellipse node that is not a
 *  circle is the disc of its larger radius that also carries its semi-axes
 *  (`axes`): the blob reads the disc, and the oval samples the ellipse. */
export type BlobMember =
  | { kind: "disc"; cx: number; cy: number; r: number; axes?: [number, number] }
  | { kind: "box"; x: number; y: number; w: number; h: number }
  | { kind: "segment"; a: Pt; b: Pt; w: number };
type Member = BlobMember;

/** A box's or a segment's outline grown by `pad`, sampled as points (a disc's
 *  keep-out polygon is `discPoly`). */
const samples = (m: Exclude<Member, { kind: "disc" }>, pad: number): Pt[] => {
  const out: Pt[] = [];
  if (m.kind === "segment") {
    // a segment's outline grown by pad is a capsule: the convex hull of the
    // circles around its two ends
    const R = m.w / 2 + pad;
    for (const [cx, cy] of [m.a, m.b])
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * 2 * Math.PI;
        out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
      }
    return out;
  }
  const corners: [number, number, number][] = [
    [m.x + m.w, m.y + m.h, 0],
    [m.x, m.y + m.h, Math.PI / 2],
    [m.x, m.y, Math.PI],
    [m.x + m.w, m.y, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      out.push([cx + pad * Math.cos(a), cy + pad * Math.sin(a)]);
    }
  return out;
};

const cross = (o: Pt, a: Pt, b: Pt) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Andrew's monotone chain. */
export const convexHull = (pts: Pt[]): Pt[] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0
    )
      lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0
    )
      upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
};

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const segIntersect = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => {
  const d1 = cross(p3, p4, p1),
    d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3),
    d4 = cross(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
};
type Poly = Pt[];
const centerOf = (m: Member): Pt =>
  m.kind === "disc"
    ? [m.cx, m.cy]
    : m.kind === "segment"
      ? [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2]
      : [m.x + m.w / 2, m.y + m.h / 2];
export const discPoly = (c: Pt, R: number, n = 28): Poly =>
  Array.from(
    { length: n },
    (_, i) =>
      [
        c[0] + R * Math.cos((2 * Math.PI * i) / n),
        c[1] + R * Math.sin((2 * Math.PI * i) / n),
      ] as Pt
  );
const bboxOf = (poly: Poly) => {
  const { minX, minY, maxX, maxY } = ringExtent(poly);
  return [minX, minY, maxX, maxY];
};
/** A polygon's bounding box and winding sign, computed once per polygon. */
const polyInfoMemo = new WeakMap<Poly, { bb: number[]; sg: number }>();
const polyInfo = (poly: Poly) => {
  let v = polyInfoMemo.get(poly);
  if (!v)
    polyInfoMemo.set(
      poly,
      (v = { bb: bboxOf(poly), sg: signedArea2(poly) > 0 ? 1 : -1 })
    );
  return v;
};
/** Is p inside polygon `poly`? The same as pointInRing, with a bounding-box test first. */
const inPolyFast = (p: Pt, poly: Poly) => {
  const { bb } = polyInfo(poly);
  return (
    p[0] >= bb[0] - 1e-6 &&
    p[0] <= bb[2] + 1e-6 &&
    p[1] >= bb[1] - 1e-6 &&
    p[1] <= bb[3] + 1e-6 &&
    pointInRing(p, poly)
  );
};
/** Does segment ab pass through the interior of convex polygon `poly`? (Cyrus–Beck clipping) */
const segHitsPoly = (
  a: Pt,
  b: Pt,
  poly: Poly,
  { bb, sg: sgn } = polyInfo(poly)
) => {
  if (
    Math.max(a[0], b[0]) < bb[0] ||
    Math.min(a[0], b[0]) > bb[2] ||
    Math.max(a[1], b[1]) < bb[1] ||
    Math.min(a[1], b[1]) > bb[3]
  )
    return false;
  let t0 = 0,
    t1 = 1;
  const d: Pt = [b[0] - a[0], b[1] - a[1]];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    // inside means sgn * cross(p, q, x) > 0
    const num = sgn * cross(p, q, a);
    const den = sgn * ((q[0] - p[0]) * d[1] - (q[1] - p[1]) * d[0]);
    if (Math.abs(den) < 1e-12) {
      if (num <= 1e-9) return false;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t1 - t0 <= 1e-6) return false;
  }
  return (t1 - t0) * Math.hypot(d[0], d[1]) > 1e-3;
};
type Obstacle = { o: Poly; bb: number[]; sg: number };
/** A uniform grid over convex obstacles' bounding boxes, about one obstacle per cell, so a segment
 *  is tested only against the obstacles in the cells it crosses. `hits(p, q)`: does pq pass through
 *  any obstacle? `buried(v, k)`: is v more than 0.01 px inside an obstacle other than the k-th? */
const obstacleGrid = (obs: Obstacle[]) => {
  let X0 = Infinity,
    Y0 = Infinity,
    X1 = -Infinity,
    Y1 = -Infinity,
    size = 0;
  for (const { bb } of obs) {
    X0 = Math.min(X0, bb[0]);
    Y0 = Math.min(Y0, bb[1]);
    X1 = Math.max(X1, bb[2]);
    Y1 = Math.max(Y1, bb[3]);
    size += Math.max(bb[2] - bb[0], bb[3] - bb[1]);
  }
  const g = Math.max(size / obs.length, (X1 - X0) / 64, (Y1 - Y0) / 64, 1e-6);
  const nx = Math.floor((X1 - X0) / g) + 1,
    ny = Math.floor((Y1 - Y0) / g) + 1;
  const cx = (x: number) =>
    Math.max(0, Math.min(nx - 1, Math.floor((x - X0) / g)));
  const cy = (y: number) =>
    Math.max(0, Math.min(ny - 1, Math.floor((y - Y0) / g)));
  const cells: number[][] = Array.from({ length: nx * ny }, () => []);
  obs.forEach(({ bb }, k) => {
    for (let j = cy(bb[1]); j <= cy(bb[3]); j++)
      for (let i = cx(bb[0]); i <= cx(bb[2]); i++) cells[j * nx + i].push(k);
  });
  const stamp = new Int32Array(obs.length);
  let gen = 0;
  const hits = (p: Pt, q: Pt) => {
    const xa = Math.min(p[0], q[0]),
      xb = Math.max(p[0], q[0]),
      ya = Math.min(p[1], q[1]),
      yb = Math.max(p[1], q[1]);
    if (xb < X0 || xa > X1 || yb < Y0 || ya > Y1) return false;
    gen++;
    const dy = q[1] - p[1];
    for (let j = cy(ya); j <= cy(yb); j++) {
      // the segment's x-range within row j, widened by a cell on each side against rounding
      let lo = xa,
        hi = xb;
      if (dy !== 0) {
        const s0 = (Y0 + j * g - p[1]) / dy,
          s1 = (Y0 + (j + 1) * g - p[1]) / dy;
        const ta = Math.max(0, Math.min(s0, s1)),
          tb = Math.min(1, Math.max(s0, s1));
        const xA = p[0] + ta * (q[0] - p[0]),
          xB = p[0] + tb * (q[0] - p[0]);
        lo = Math.min(xA, xB);
        hi = Math.max(xA, xB);
      }
      for (
        let i = Math.max(0, cx(lo) - 1);
        i <= Math.min(nx - 1, cx(hi) + 1);
        i++
      )
        for (const k of cells[j * nx + i]) {
          if (stamp[k] === gen) continue;
          stamp[k] = gen;
          if (segHitsPoly(p, q, obs[k].o, obs[k])) return true;
        }
    }
    return false;
  };
  // each obstacle's edge lengths, measured when first needed
  const lens: number[][] = [];
  const lensOf = (j: number) =>
    (lens[j] ??= obs[j].o.map(
      (p, i, o) => dist(p, o[(i + 1) % o.length]) || 1
    ));
  const deep = (v: Pt, { o, sg }: Obstacle, L: number[]) => {
    for (let i = 0; i < o.length; i++) {
      const p = o[i],
        q = o[(i + 1) % o.length];
      if ((sg * cross(p, q, v)) / L[i] <= 0.01) return false;
    }
    return true;
  };
  const buried = (v: Pt, k: number) =>
    cells[cy(v[1]) * nx + cx(v[0])].some((j) => {
      const n = obs[j];
      return (
        j !== k &&
        v[0] > n.bb[0] &&
        v[0] < n.bb[2] &&
        v[1] > n.bb[1] &&
        v[1] < n.bb[3] &&
        deep(v, n, lensOf(j))
      );
    });
  return { hits, buried };
};
/** Shortest route from a to b around convex obstacles (visibility graph + Dijkstra),
 *  using only obstacles near the straight segment (a local search, for speed). */
const routeAround = (a: Pt, b: Pt, allObstacles: Poly[]): Pt[] | null => {
  const M = Math.max(40, dist(a, b) * 0.6);
  const near = allObstacles
    .map((o) => ({ o, ...polyInfo(o) }))
    .filter(
      ({ bb }) =>
        bb[2] > Math.min(a[0], b[0]) - M &&
        bb[0] < Math.max(a[0], b[0]) + M &&
        bb[3] > Math.min(a[1], b[1]) - M &&
        bb[1] < Math.max(a[1], b[1]) + M
    );
  if (!near.some((n) => segHitsPoly(a, b, n.o, n))) return [a, b];
  const grid = obstacleGrid(near);
  // A vertex more than 0.01 px inside another obstacle can never be on a route: every segment
  // from it runs that far through the obstacle, which counts as blocked. So it is left out.
  // Each vertex keeps its two neighbors on its obstacle: a shortest route only bends at a vertex
  // it wraps around, so it reaches a vertex only along a line that leaves both neighbors on one side.
  const pts: Pt[] = [a, b],
    nb: (Pt | null)[][] = [
      [null, null],
      [null, null],
    ];
  near.forEach(({ o }, k) =>
    o.forEach((v, i) => {
      if (grid.buried(v, k)) return;
      pts.push(v);
      nb.push([o[(i - 1 + o.length) % o.length], o[(i + 1) % o.length]]);
    })
  );
  const tangent = (u: Pt, v: number) => {
    const [p, q] = nb[v];
    if (!p || !q) return true;
    const s1 = cross(u, pts[v], p),
      s2 = cross(u, pts[v], q);
    return s1 * s2 >= 0;
  };
  // A* from a to b (the straight distance to b never overestimates), over a binary heap
  const n = pts.length,
    D = new Float64Array(n).fill(Infinity),
    prev = new Int32Array(n).fill(-1),
    done = new Uint8Array(n);
  const heap: number[] = [],
    key: number[] = [];
  const push = (v: number, f: number) => {
    let i = heap.length;
    heap.push(v);
    key.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (key[p] <= key[i]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      [key[p], key[i]] = [key[i], key[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0],
      lastV = heap.pop()!,
      lastK = key.pop()!;
    if (heap.length) {
      heap[0] = lastV;
      key[0] = lastK;
      for (let i = 0; ; ) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && key[l] < key[m]) m = l;
        if (r < heap.length && key[r] < key[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        [key[m], key[i]] = [key[i], key[m]];
        i = m;
      }
    }
    return top;
  };
  D[0] = 0;
  push(0, dist(a, b));
  while (heap.length) {
    const u = pop();
    if (done[u]) continue;
    if (u === 1) break;
    done[u] = 1;
    for (let v = 1; v < n; v++) {
      if (done[v] || !tangent(pts[u], v)) continue;
      const d = D[u] + dist(pts[u], pts[v]);
      if (d < D[v] && !grid.hits(pts[u], pts[v])) {
        D[v] = d;
        prev[v] = u;
        push(v, d + dist(pts[v], b));
      }
    }
  }
  if (D[1] === Infinity) return null;
  const path: Pt[] = [];
  for (let v = 1; v >= 0; v = prev[v]) path.unshift(pts[v]);
  return path;
};
/** Is the straight segment ab clear of every obstacle? (exactly when routeAround returns [a, b]) */
const clearOf = (a: Pt, b: Pt, obstacles: Poly[]) =>
  !obstacles.some((o) => segHitsPoly(a, b, o));
const polyLen = (p: Pt[]) =>
  p.slice(1).reduce((s, q, i) => s + dist(p[i], q), 0);
const memberRadius = (m: Member) =>
  m.kind === "disc"
    ? m.r
    : m.kind === "segment"
      ? m.w / 2
      : Math.min(m.w, m.h) / 2;
const circumR = (a: Pt, b: Pt, c: Pt) =>
  (dist(a, b) * dist(b, c) * dist(c, a)) /
  (2 * Math.abs(cross(a, b, c)) || 1e-12);
/** A uniform grid over boxes [x0, y0, x1, y1], about one box per cell. `query` lists, in index
 *  order, every box that may meet a rectangle (a superset: callers still test exactly). */
const boxGrid = (bbs: number[][]) => {
  let X0 = Infinity,
    Y0 = Infinity,
    X1 = -Infinity,
    Y1 = -Infinity,
    size = 0;
  for (const b of bbs) {
    X0 = Math.min(X0, b[0]);
    Y0 = Math.min(Y0, b[1]);
    X1 = Math.max(X1, b[2]);
    Y1 = Math.max(Y1, b[3]);
    size += Math.max(b[2] - b[0], b[3] - b[1]);
  }
  const g = Math.max(
    size / (bbs.length || 1),
    (X1 - X0) / 64,
    (Y1 - Y0) / 64,
    1e-6
  );
  const nx = bbs.length ? Math.floor((X1 - X0) / g) + 1 : 0,
    ny = bbs.length ? Math.floor((Y1 - Y0) / g) + 1 : 0;
  const cx = (x: number) =>
    Math.max(0, Math.min(nx - 1, Math.floor((x - X0) / g)));
  const cy = (y: number) =>
    Math.max(0, Math.min(ny - 1, Math.floor((y - Y0) / g)));
  const cells: number[][] = Array.from({ length: nx * ny }, () => []);
  bbs.forEach((b, k) => {
    for (let j = cy(b[1]); j <= cy(b[3]); j++)
      for (let i = cx(b[0]); i <= cx(b[2]); i++) cells[j * nx + i].push(k);
  });
  const stamp = new Int32Array(bbs.length);
  let gen = 0;
  const query = (xa: number, ya: number, xb: number, yb: number): number[] => {
    if (!bbs.length || xb < X0 || xa > X1 || yb < Y0 || ya > Y1) return [];
    gen++;
    const out: number[] = [];
    for (let j = cy(ya); j <= cy(yb); j++)
      for (let i = cx(xa); i <= cx(xb); i++)
        for (const k of cells[j * nx + i])
          if (stamp[k] !== gen) {
            stamp[k] = gen;
            out.push(k);
          }
    return out.sort((a, b) => a - b);
  };
  /** The same boxes, unordered, without building a list. */
  const each = (
    xa: number,
    ya: number,
    xb: number,
    yb: number,
    fn: (k: number) => void
  ) => {
    if (!bbs.length || xb < X0 || xa > X1 || yb < Y0 || ya > Y1) return;
    gen++;
    for (let j = cy(ya); j <= cy(yb); j++)
      for (let i = cx(xa); i <= cx(xb); i++)
        for (const k of cells[j * nx + i])
          if (stamp[k] !== gen) {
            stamp[k] = gen;
            fn(k);
          }
  };
  return { query, each };
};

type SkelOpts = {
  avoiding?: Member[];
  pad: number;
  convexity: number;
  clearance?: number;
};
type Arc = { c: Pt; r: number; a0: number; sweep: number };
type Part = { a: Pt; b: Pt } | Arc;
type Route = { route: Pt[]; parts: Part[]; len: number };
/** A route that runs straight through its points. */
const straight = (route: Pt[]): Route => ({
  route,
  parts: route.slice(1).map((q, i) => ({ a: route[i], b: q })),
  len: polyLen(route),
});
/** The key of the edge between sites i and j, either way round. */
const ek = (i: number, j: number) => (i < j ? `${i},${j}` : `${j},${i}`);
/** A link: its route, and its half-width at the route's start (h) and end (h2). A link between
 *  ends of different radii tapers from one to the other, so a link between two members is the
 *  convex hull of their bulges. It is routed at its larger half-width. */
type SkLink = { route: Pt[]; h: number; h2: number; parts?: Part[] };
/** Tighten a route found on keep-out polygons onto the circles they stand for. Each run of route
 *  vertices on one circle (an avoided node's keep-out circle grown by h, or a box corner's) becomes
 *  an arc of that circle, and the route between runs becomes the lines tangent to both: so a
 *  link that wraps an avoided node follows its clearance circle exactly. `pivotOf` names the
 *  circle a vertex lies on (radius 0: a plain corner). The result is the route as straight parts
 *  and arcs, and as a polyline through them. */
const snapRoute = (
  route: Pt[],
  pivotOf: (v: Pt) => { c: Pt; r: number }
): Route => {
  // the circles wrapped, in order, each with the side the route passes it on (+1: turning left)
  let piv: { c: Pt; r: number; s: number }[] = [];
  for (let i = 1; i < route.length - 1; i++) {
    const p = pivotOf(route[i]),
      s = Math.sign(cross(route[i - 1], route[i], route[i + 1])) || 1;
    const last = piv[piv.length - 1];
    if (
      last &&
      last.r > 0 &&
      last.c[0] === p.c[0] &&
      last.c[1] === p.c[1] &&
      last.r === p.r
    )
      continue;
    piv.push({ ...p, s });
  }
  const a = route[0],
    b = route[route.length - 1];
  /** The tangent line leaving circle (or point) 1 and reaching circle (or point) 2, each passed on its side. */
  const tangent = (
    c1: Pt,
    r1: number,
    s1: number,
    c2: Pt,
    r2: number,
    s2: number
  ): [Pt, Pt] | null => {
    // the line's left normal n has n . (c2 - c1) = s2 r2 - s1 r1; each center is s r along n from its touch point
    const dx = c2[0] - c1[0],
      dy = c2[1] - c1[1],
      L = Math.hypot(dx, dy),
      k = s2 * r2 - s1 * r1;
    if (L < 1e-9 || Math.abs(k) > L) return null;
    const ux = dx / L,
      uy = dy / L,
      ca = k / L,
      sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    for (const sg of [1, -1]) {
      const nx = ux * ca - sg * uy * sa,
        ny = uy * ca + sg * ux * sa;
      const t1: Pt = [c1[0] - s1 * r1 * nx, c1[1] - s1 * r1 * ny],
        t2: Pt = [c2[0] - s2 * r2 * nx, c2[1] - s2 * r2 * ny];
      // travel along d (n is d turned left) must run from t1 to t2
      const ddx = ny,
        ddy = -nx;
      if ((t2[0] - t1[0]) * ddx + (t2[1] - t1[1]) * ddy > 0) return [t1, t2];
    }
    return null;
  };
  for (let attempt = 0; attempt <= route.length; attempt++) {
    const parts: Part[] = [];
    const ends: [Pt, Pt][] = [];
    let ok = true;
    const nodes = [{ c: a, r: 0, s: 1 }, ...piv, { c: b, r: 0, s: 1 }];
    for (let i = 0; i + 1 < nodes.length; i++) {
      const t = tangent(
        nodes[i].c,
        nodes[i].r,
        nodes[i].s,
        nodes[i + 1].c,
        nodes[i + 1].r,
        nodes[i + 1].s
      );
      if (!t) {
        ok = false;
        break;
      }
      ends.push(t);
    }
    if (!ok) return straight(route);
    // the arc on each circle, from where the route arrives to where it leaves, turning the route's way
    let drop = -1;
    const arcs: (Arc | null)[] = piv.map((p, i) => {
      if (p.r === 0) return null;
      const A = ends[i][1],
        B = ends[i + 1][0];
      const a0 = Math.atan2(A[1] - p.c[1], A[0] - p.c[0]),
        a1 = Math.atan2(B[1] - p.c[1], B[0] - p.c[0]);
      let sweep = p.s > 0 ? a1 - a0 : a0 - a1;
      sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      // a route wraps a circle by less than a half turn; more means it never touches it
      if (sweep > Math.PI && drop < 0) drop = i;
      return { c: p.c, r: p.r, a0, sweep: p.s * sweep };
    });
    if (drop >= 0) {
      piv = piv.filter((_, i) => i !== drop);
      continue;
    }
    const out: Pt[] = [a];
    for (let i = 0; i < ends.length; i++) {
      const [t1, t2] = ends[i];
      if (dist(out[out.length - 1], t1) > 1e-9) out.push(t1);
      parts.push({ a: t1, b: t2 });
      out.push(t2);
      const arc = arcs[i];
      if (arc && Math.abs(arc.sweep) > 1e-9) {
        parts.push(arc);
        const n = Math.max(1, Math.ceil(Math.abs(arc.sweep) / (Math.PI / 32)));
        for (let k = 1; k <= n; k++) {
          const t = arc.a0 + (arc.sweep * k) / n;
          out.push([
            arc.c[0] + arc.r * Math.cos(t),
            arc.c[1] + arc.r * Math.sin(t),
          ]);
        }
      }
    }
    return { route: out, parts, len: polyLen(out) };
  }
  return straight(route);
};
type Skeleton = { R: number[]; links: SkLink[]; faces: Pt[][] };
/** A member's sites, the points the triangles are built on: a node's center, a segment's two ends. */
const sitesOf = (m: Member): Pt[] =>
  m.kind === "segment" ? [m.a, m.b] : [centerOf(m)];
const nearestOnSeg = (p: Pt, a: Pt, b: Pt): Pt => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = dx * dx + dy * dy || 1;
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)
  );
  return [a[0] + t * dx, a[1] + t * dy];
};
/** The closest points of two members' geometries (a node is its center, a segment is the whole segment). */
const closestPair = (m1: Member, m2: Member): [Pt, Pt] => {
  if (m1.kind !== "segment" && m2.kind !== "segment")
    return [centerOf(m1), centerOf(m2)];
  if (m2.kind === "segment" && m1.kind !== "segment") {
    const c = centerOf(m1);
    return [c, nearestOnSeg(c, m2.a, m2.b)];
  }
  if (m1.kind === "segment" && m2.kind !== "segment") {
    const c = centerOf(m2);
    return [nearestOnSeg(c, m1.a, m1.b), c];
  }
  const s1 = m1 as Extract<Member, { kind: "segment" }>,
    s2 = m2 as Extract<Member, { kind: "segment" }>;
  if (segIntersect(s1.a, s1.b, s2.a, s2.b)) {
    const d =
      cross(s2.a, s2.b, s1.a) /
      (cross(s2.a, s2.b, s1.a) - cross(s2.a, s2.b, s1.b));
    const x: Pt = [
      s1.a[0] + d * (s1.b[0] - s1.a[0]),
      s1.a[1] + d * (s1.b[1] - s1.a[1]),
    ];
    return [x, x];
  }
  const opts: [Pt, Pt][] = [
    [s1.a, nearestOnSeg(s1.a, s2.a, s2.b)],
    [s1.b, nearestOnSeg(s1.b, s2.a, s2.b)],
    [nearestOnSeg(s2.a, s1.a, s1.b), s2.a],
    [nearestOnSeg(s2.b, s1.a, s1.b), s2.b],
  ];
  return opts.reduce((x, y) => (dist(x[0], x[1]) <= dist(y[0], y[1]) ? x : y));
};
/** The members' sites (merged where two members share one) and their Delaunay triangles and edges. Depends on the members alone. */
const sitesOfMembers = (members: Member[]) => {
  const P: Pt[] = [],
    owner: number[][] = [];
  // sites within half a pixel are one site: the earliest such site, found in a hash of
  // half-pixel cells (any site within 0.5 of q is in q's cell or one of its 8 neighbors)
  // (cells by column, then row: numeric keys, any sign or size)
  const bucket = new Map<number, Map<number, number[]>>();
  const cellOf = (v: number) => Math.floor(v / 0.5);
  members.forEach((mm, k) =>
    sitesOf(mm).forEach((q) => {
      const cx = cellOf(q[0]),
        cy = cellOf(q[1]);
      let i = -1;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const s of bucket.get(cx + dx)?.get(cy + dy) ?? [])
            if ((i < 0 || s < i) && dist(P[s], q) < 0.5) i = s;
      if (i < 0) {
        let column = bucket.get(cx);
        if (column === undefined) bucket.set(cx, (column = new Map()));
        let cell = column.get(cy);
        if (cell === undefined) column.set(cy, (cell = []));
        cell.push(P.length);
        i = P.length;
        P.push(q);
        owner.push([]);
      }
      owner[i].push(k);
    })
  );
  const n = P.length;
  const tri: [number, number, number][] = [],
    cand = new Map<string, [number, number]>();
  if (n >= 3) {
    const d = Delaunay.from(P);
    for (let k = 0; k < d.triangles.length; k += 3) {
      const [i, j, l] = [
        d.triangles[k],
        d.triangles[k + 1],
        d.triangles[k + 2],
      ];
      if (Math.abs(cross(P[i], P[j], P[l])) < 1e-9) continue;
      tri.push([i, j, l]);
      for (const [u, v] of [
        [i, j],
        [j, l],
        [l, i],
      ])
        cand.set(ek(u, v), [Math.min(u, v), Math.max(u, v)]);
    }
  }
  if (tri.length === 0)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) cand.set(ek(i, j), [i, j]);
  // where each member's geometry is (a node's center, a line's box), to find the members holding a point
  const memberGrid = boxGrid(
    members.map((mm) =>
      mm.kind === "segment"
        ? [
            Math.min(mm.a[0], mm.b[0]),
            Math.min(mm.a[1], mm.b[1]),
            Math.max(mm.a[0], mm.b[0]),
            Math.max(mm.a[1], mm.b[1]),
          ]
        : [...centerOf(mm), ...centerOf(mm)]
    )
  );
  return { P, owner, tri, cand, memberGrid };
};
/** The avoided nodes indexed by where their keep-out zones are, with each node's keep-out
 *  polygon for a tube half-width h built when first asked for (a circle as a 32-gon around it). */
const avoidIndex = (others: Member[], clearance: number, zones: Prim[]) => {
  const keep = (mm: Member) => memberRadius(mm) + clearance;
  const grid = boxGrid(zones.map((z) => z.bb));
  const polys = new Map<string, Poly>();
  return {
    near: (p: Pt, q: Pt, m: number) =>
      grid.query(
        Math.min(p[0], q[0]) - m,
        Math.min(p[1], q[1]) - m,
        Math.max(p[0], q[0]) + m,
        Math.max(p[1], q[1]) + m
      ),
    poly: (k: number, h: number): Poly => {
      const key = `${k},${h}`,
        mm = others[k];
      let poly = polys.get(key);
      if (!poly)
        polys.set(
          key,
          (poly =
            mm.kind === "disc"
              ? discPoly(
                  [mm.cx, mm.cy - 0.01],
                  (keep(mm) + h) / Math.cos(Math.PI / 32),
                  32
                )
              : convexHull(samples(mm, clearance + h)))
        );
      return poly;
    },
    center: others.map(centerOf),
    radius: others.map((mm) => (mm.kind === "disc" ? keep(mm) : 0)),
  };
};
/** Step 1: the filled Delaunay triangles of the members' sites plus the routed spanning tree over members.
 *  Each member is its own geometry: a segment member is already a link between its ends, and a
 *  spanning-tree link runs between the closest points of two members' geometries. Every link is
 *  chosen and routed at its full width (the bulge at its ends), so `neck`, which only thins the
 *  drawn tubes (step 2), never changes which links there are or where they run. */
/** `zones` are the avoided nodes grown by the clearance, one per avoided node. */
const skeleton = (members: Member[], o: SkelOpts, zones: Prim[]): Skeleton => {
  const clearance = o.clearance ?? 4,
    others = o.avoiding ?? [];
  const Rm = members.map((m) => memberRadius(m) + o.pad),
    nm = members.length;
  const { P, owner, tri, cand, memberGrid } = sitesOfMembers(members);
  const R = owner.map((ks) => Math.max(...ks.map((k) => Rm[k])));
  const c = Math.max(0, Math.min(1, o.convexity));
  // convexity c fills the smallest gaps first until they hold c of the hull's area: the triangles
  // in order of circumradius, each counted when the midpoint of its area is within c (triangles
  // with the same circumradius count together). 0 fills none, 1 fills every triangle.
  const gap = tri.map(([i, j, l]) => circumR(P[i], P[j], P[l]));
  const area = tri.map(([i, j, l]) => Math.abs(cross(P[i], P[j], P[l])) / 2);
  const order = tri.map((_, k) => k).sort((x, y) => gap[x] - gap[y]);
  const total = area.reduce((s, a) => s + a, 0),
    filled = new Set<number>();
  for (let k = 0, sum = 0; k < order.length; ) {
    let e = k,
      a = 0;
    while (e < order.length && gap[order[e]] <= gap[order[k]] * (1 + 1e-9))
      a += area[order[e++]];
    if (c < 1 && sum + a / 2 >= c * total) break;
    for (; k < e; k++) filled.add(order[k]);
    sum += a;
  }
  const faces: Pt[][] = [],
    faceEdges = new Set<string>();
  tri.forEach(([i, j, l], k) => {
    // A face is filled whatever it holds: an avoided node inside it becomes a hole, cut
    // later as exactly its clearance zone (step 2). Only links route around avoided nodes.
    if (!filled.has(k)) return;
    faces.push([P[i], P[j], P[l]]);
    [ek(i, j), ek(j, l), ek(l, i)].forEach((e) => faceEdges.add(e));
  });
  const avoid = avoidIndex(others, clearance, zones);
  /** The keep-out polygons (each avoided node grown by the tube half-width h) whose boxes come
   *  within mg of the box around p and q, holding neither p nor q, in the avoided nodes' order. */
  const obstaclesNear = (p: Pt, q: Pt, h: number, mg: number) => {
    const out: Poly[] = [];
    for (const k of avoid.near(p, q, 1.02 * h + mg + 1)) {
      // a node grown into a circle cannot reach a segment farther than its circumscribed radius
      if (
        mg === 0 &&
        avoid.radius[k] > 0 &&
        segD(avoid.center[k][0], avoid.center[k][1], p[0], p[1], q[0], q[1]) >
          (avoid.radius[k] + h) / Math.cos(Math.PI / 32) + 0.02
      )
        continue;
      const poly = avoid.poly(k, h);
      if (!inPolyFast(p, poly) && !inPolyFast(q, poly)) out.push(poly);
    }
    return out;
  };
  const routes = new Map<string, Route | null>();
  const routeFor = (p: Pt, q: Pt, h: number) => {
    const key = `${p[0]},${p[1]},${q[0]},${q[1]},${h}`;
    let r = routes.get(key);
    if (r === undefined) {
      // most links are not blocked at all: check that first, against the nodes along the link only
      const poly = clearOf(p, q, obstaclesNear(p, q, h, 0))
        ? [p, q]
        : routeAround(
            p,
            q,
            obstaclesNear(p, q, h, Math.max(40, dist(p, q) * 0.6))
          );
      r = !poly
        ? null
        : poly.length === 2
          ? straight(poly)
          : snapRoute(poly, (v) => pivotOf(v, h));
      routes.set(key, r);
    }
    return r;
  };
  const clear = (p: Pt, q: Pt, h: number) =>
    clearOf(p, q, obstaclesNear(p, q, h, 0));
  /** The circle a keep-out polygon's vertex v stands for: an avoided node's keep-out circle grown
   *  by h (its polygon is the 32-gon around it), or a box corner's; else v itself, a plain corner. */
  const pivotOf = (v: Pt, h: number): { c: Pt; r: number } => {
    for (const k of avoid.near(v, v, 1.02 * h + 1)) {
      const mm = others[k];
      if (mm.kind === "disc") {
        const R = memberRadius(mm) + clearance + h;
        if (
          Math.abs(
            Math.hypot(v[0] - mm.cx, v[1] - mm.cy + 0.01) -
              R / Math.cos(Math.PI / 32)
          ) < 1e-6
        )
          return { c: [mm.cx, mm.cy], r: R };
      } else if (mm.kind === "box")
        for (const c of [
          [mm.x, mm.y],
          [mm.x + mm.w, mm.y],
          [mm.x, mm.y + mm.h],
          [mm.x + mm.w, mm.y + mm.h],
        ] as Pt[])
          if (Math.abs(dist(v, c) - (clearance + h)) < 1e-6)
            return { c, r: clearance + h };
    }
    return { c: v, r: 0 };
  };
  const links: SkLink[] = [];
  // spanning-tree candidates, between members: a face edge as drawn, else the routed closest-point link
  const mk = (a: number, b: number) => (a < b ? a * nm + b : b * nm + a);
  const routed = new Map<
    number,
    { a: number; b: number; route: Pt[]; len: number; h: number; h2: number }
  >();
  // the bulge where a link attaches: the widest member whose geometry holds that point
  const onMember = (mm: Member, p: Pt) =>
    dist(
      p,
      mm.kind === "segment" ? nearestOnSeg(p, mm.a, mm.b) : centerOf(mm)
    ) < 0.5;
  const radiusAt = (p: Pt) =>
    Math.max(
      0,
      ...memberGrid
        .query(p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1)
        .map((k) => (onMember(members[k], p) ? Rm[k] : 0))
    );
  for (const [key, [i, j]] of cand) {
    // an edge between a segment member's two ends is that member: it adds no link (the member is
    // its own link, at its own width), and its ends' members touch through it (step below)
    if (
      !faceEdges.has(key) ||
      owner[i].some(
        (k) => members[k].kind === "segment" && owner[j].includes(k)
      )
    )
      continue;
    links.push({ route: [P[i], P[j]], h: R[i], h2: R[j] });
    // the edge carries the spanning tree only when no hole will be cut across it
    if (clear(P[i], P[j], Math.max(R[i], R[j])))
      for (const a of owner[i])
        for (const b of owner[j])
          if (a !== b && !routed.has(mk(a, b)))
            routed.set(mk(a, b), {
              a,
              b,
              route: [P[i], P[j]],
              len: dist(P[i], P[j]),
              h: R[i],
              h2: R[j],
            });
  }
  const pairs = new Set<number>();
  for (const [i, j] of cand.values())
    for (const a of owner[i])
      for (const b of owner[j]) if (a !== b) pairs.add(mk(a, b));
  owner.forEach((ks) =>
    ks.forEach((a) =>
      ks.forEach((b) => {
        if (a !== b) pairs.add(mk(a, b));
      })
    )
  );
  // A segment member is a candidate with every other member too, since its closest point to
  // another member may lie anywhere along it. Those pairs join the queue by distance, a band at
  // a time (below), and each keeps the place in the order it would have had in a list of all of
  // them: after the pairs above, by the first segment member of the pair, then the other member.
  const segs: number[] = [];
  members.forEach((mm, a) => {
    if (mm.kind === "segment") segs.push(a);
  });
  // A pair's link is routed only when the spanning tree reaches it: until then its straight
  // length stands in, a lower bound on the routed length (lazy Kruskal; ties keep their order).
  type Link = {
    a: number;
    b: number;
    len: number;
    order: number;
    route?: Pt[];
    parts?: Part[];
    h: number;
    h2: number;
    ends?: [Pt, Pt];
  };
  const queue: Link[] = [...routed.values()].map((e, order) => ({
    ...e,
    order,
  }));
  const linkOf = (key: number, order: number, pq?: [Pt, Pt]): Link => {
    const a = Math.floor(key / nm),
      b = key % nm,
      [p, q] = pq ?? closestPair(members[a], members[b]);
    // members that touch join at no cost, with no link drawn
    return dist(p, q) < 0.5
      ? { a, b, route: [p, q], len: 0, order, h: 0, h2: 0 }
      : {
          a,
          b,
          len: dist(p, q),
          order,
          ends: [p, q],
          h: radiusAt(p),
          h2: radiusAt(q),
        };
  };
  for (const key of pairs)
    if (!routed.has(key)) queue.push(linkOf(key, queue.length));
  const byLen = (x: Link, y: Link) => x.len - y.len || x.order - y.order;
  const before = (x: Link, y: Link) => byLen(x, y) < 0;
  queue.sort(byLen);
  /** The segment members' remaining pairs whose queued length is in (lo, hi], found through
   *  the member grid; each pair once, from its first segment member. A pair already in one
   *  piece is left out: pieces only merge, so the tree would skip it anyway. */
  const segOrder = queue.length;
  // each pair's closest points, measured once across the bands until its link is queued (then
  // dropped, so the map holds only the pairs still longer than the band)
  const measured = new Map<number, [Pt, Pt]>();
  const segPairs = (lo: number, hi: number): Link[] => {
    const out: Link[] = [];
    for (const a of segs) {
      const mm = members[a] as Extract<Member, { kind: "segment" }>;
      for (const b of memberGrid.query(
        Math.min(mm.a[0], mm.b[0]) - hi,
        Math.min(mm.a[1], mm.b[1]) - hi,
        Math.max(mm.a[0], mm.b[0]) + hi,
        Math.max(mm.a[1], mm.b[1]) + hi
      )) {
        if (b === a || (b < a && members[b].kind === "segment")) continue;
        const key = mk(a, b);
        if (pairs.has(key) || routed.has(key) || f2(a) === f2(b)) continue;
        let pq = measured.get(key);
        if (pq === undefined) {
          pq = closestPair(members[Math.min(a, b)], members[Math.max(a, b)]);
          measured.set(key, pq);
        }
        const d = dist(pq[0], pq[1]),
          len = d < 0.5 ? 0 : d;
        if (len <= hi) measured.delete(key);
        if (len > lo && len <= hi)
          out.push(linkOf(key, segOrder + a * nm + b, pq));
      }
    }
    return out;
  };
  // the members' extent: no two members are farther apart than its diagonal
  // (Infinity with no sites)
  const ext = ringExtent(P);
  const reach = Math.hypot(ext.maxX - ext.minX, ext.maxY - ext.minY) + 1;
  // the spanning tree over routed links keeps the set in one piece (members that touch join for free)
  const r2 = members.map((_, k) => k);
  const f2 = (k: number): number => (r2[k] === k ? k : (r2[k] = f2(r2[k])));
  let pieces = nm,
    band = -1,
    head = 0;
  for (;;) {
    // every pair no longer than `band` is queued, so the queue is in order up to there; past it,
    // while the set is in more than one piece, queue the next band of segment pairs
    if (
      segs.length > 0 &&
      band < reach &&
      pieces > 1 &&
      (head >= queue.length || queue[head].len > band)
    ) {
      // the touching pairs first, which join each line into one piece, then doubling bands
      const next = band < 0 ? 0 : band === 0 ? 16 : band * 2;
      const more = segPairs(band, next);
      band = next;
      if (more.length) {
        // merge the sorted band into the sorted rest of the queue (byLen is a total
        // order, since each order is unique, so this is the sorted sequence)
        more.sort(byLen);
        const rest = queue.slice(head);
        queue.length = 0;
        head = 0;
        let i = 0,
          j = 0;
        while (i < rest.length || j < more.length)
          queue.push(
            j >= more.length || (i < rest.length && before(rest[i], more[j]))
              ? rest[i++]
              : more[j++]
          );
      }
      continue;
    }
    if (head >= queue.length) break;
    const e = queue[head++];
    if (f2(e.a) === f2(e.b)) continue;
    if (e.ends) {
      const r = routeFor(e.ends[0], e.ends[1], Math.max(e.h, e.h2));
      if (!r) continue;
      const done: Link = {
        a: e.a,
        b: e.b,
        route: r.route,
        parts: r.parts,
        len: r.len,
        order: e.order,
        h: e.h,
        h2: e.h2,
      };
      let at = head;
      while (at < queue.length && before(queue[at], done)) at++;
      queue.splice(at, 0, done);
      continue;
    }
    r2[f2(e.a)] = f2(e.b);
    pieces--;
    if (e.len > 0)
      links.push({
        route: e.route!,
        h: e.h,
        h2: e.h2,
        ...(e.parts && e.parts.length > 1 ? { parts: e.parts } : {}),
      });
  }
  return { R: Rm, links, faces };
};

// ── step 2: the region, exactly ─────────────────────────────────────────────
// The region is the union of the pieces minus the keep-out zones. Every piece and zone is one of
// a few primitives with an exact signed distance (negative inside): a disc, a capsule (a segment
// grown by r), a tapered capsule (the convex hull of two discs), a box (a rectangle grown by r), a
// triangle, or a tube bent along an arc. Its outline is traced exactly, and
// each traced point records the circle it lies on (its center and radius), or none on a straight side.
type Prim = {
  k: 0 | 1 | 2 | 3 | 4 | 5;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  r: number;
  bb: number[];
  bulge?: boolean;
};
const discPrim = (x: number, y: number, r: number): Prim => ({
  k: 0,
  x1: x,
  y1: y,
  x2: 0,
  y2: 0,
  x3: 0,
  y3: 0,
  r,
  bb: [x - r, y - r, x + r, y + r],
});
const capsulePrim = (a: Pt, b: Pt, r: number): Prim => ({
  k: 1,
  x1: a[0],
  y1: a[1],
  x2: b[0],
  y2: b[1],
  x3: 0,
  y3: 0,
  r,
  bb: [
    Math.min(a[0], b[0]) - r,
    Math.min(a[1], b[1]) - r,
    Math.max(a[0], b[0]) + r,
    Math.max(a[1], b[1]) + r,
  ],
});
/** A tapered capsule: the convex hull of the disc of radius ra around a and the disc of radius rb
 *  around b (x3 holds rb, r holds ra). With equal radii it is exactly the capsule. */
const taperPrim = (a: Pt, b: Pt, ra: number, rb: number): Prim =>
  ra === rb
    ? capsulePrim(a, b, ra)
    : {
        k: 5,
        x1: a[0],
        y1: a[1],
        x2: b[0],
        y2: b[1],
        x3: rb,
        y3: 0,
        r: ra,
        bb: [
          Math.min(a[0] - ra, b[0] - rb),
          Math.min(a[1] - ra, b[1] - rb),
          Math.max(a[0] + ra, b[0] + rb),
          Math.max(a[1] + ra, b[1] + rb),
        ],
      };
/** Signed distance to a tapered capsule from a (radius ra) to b (radius rb): the convex hull of
 *  the two discs, in closed form (Quilez's uneven capsule). With `arc`, fills ARC: the end circle
 *  the nearest point lies on, or for a point on a straight side, a center along the side's
 *  outward normal (radius 0), and ARC[4] with the tube's radius there. */
const taperD = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ra: number,
  rb: number,
  x: number,
  y: number,
  arc: boolean
) => {
  const ex = bx - ax,
    ey = by - ay,
    h = ex * ex + ey * ey,
    b = ra - rb;
  if (h <= b * b) {
    // one disc holds the other: the hull is the larger disc
    const [cx, cy, r] = ra >= rb ? [ax, ay, ra] : [bx, by, rb];
    if (arc) {
      ARC[0] = cx;
      ARC[1] = cy;
      ARC[2] = r;
      ARC[4] = r;
    }
    return Math.hypot(x - cx, y - cy) - r;
  }
  const px = x - ax,
    py = y - ay;
  const qx0 = (px * ey - py * ex) / h,
    qy = (px * ex + py * ey) / h;
  const qx = Math.abs(qx0);
  const cx = Math.sqrt(h - b * b);
  const k = cx * qy - b * qx,
    m = cx * qx + b * qy,
    n = qx * qx + qy * qy;
  if (k < 0) {
    if (arc) {
      ARC[0] = ax;
      ARC[1] = ay;
      ARC[2] = ra;
      ARC[4] = ra;
    }
    return Math.sqrt(h * n) - ra;
  }
  if (k > cx) {
    if (arc) {
      ARC[0] = bx;
      ARC[1] = by;
      ARC[2] = rb;
      ARC[4] = rb;
    }
    return Math.sqrt(h * (n + 1 - 2 * qy)) - rb;
  }
  if (arc) {
    // the side's outward normal: (cx · the perpendicular on p's side + b · the axis) / |b - a|
    const sg = qx0 < 0 ? -1 : 1;
    const nx = (cx * sg * ey + b * ex) / h,
      ny = (-cx * sg * ex + b * ey) / h;
    const s = m > 1e-6 ? m : 1;
    ARC[0] = x - nx * s;
    ARC[1] = y - ny * s;
    ARC[2] = 0;
    ARC[4] = ra + (rb - ra) * (k / cx);
  }
  return m - ra;
};
const boxPrim = (
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): Prim => ({
  k: 2,
  x1: x,
  y1: y,
  x2: x + w,
  y2: y + h,
  x3: 0,
  y3: 0,
  r,
  bb: [x - r, y - r, x + w + r, y + h + r],
});
/** An arc of radius r around c, from angle a0 turning by sweep (signed), grown by h: a bent tube with round ends. */
const arcPrim = (
  c: Pt,
  r: number,
  a0: number,
  sweep: number,
  h: number
): Prim => ({
  k: 4,
  x1: c[0],
  y1: c[1],
  x2: a0,
  y2: sweep,
  x3: r,
  y3: 0,
  r: h,
  bb: [c[0] - r - h, c[1] - r - h, c[0] + r + h, c[1] + r + h],
});
/** Signed distance to an arc tube (packed fields); with `arc`, the circle its nearest edge lies on. */
const arcD = (
  cx: number,
  cy: number,
  a0: number,
  sweep: number,
  rr: number,
  h: number,
  x: number,
  y: number,
  arc: boolean
) => {
  const dx = x - cx,
    dy = y - cy,
    rho = Math.sqrt(dx * dx + dy * dy);
  let rel =
    (sweep >= 0 ? Math.atan2(dy, dx) - a0 : a0 - Math.atan2(dy, dx)) %
    (2 * Math.PI);
  if (rel < 0) rel += 2 * Math.PI;
  if (rel <= Math.abs(sweep)) {
    if (arc) {
      ARC[0] = cx;
      ARC[1] = cy;
      ARC[2] = rho >= rr ? rr + h : rr - h;
    }
    return Math.abs(rho - rr) - h;
  }
  const e0x = cx + rr * Math.cos(a0),
    e0y = cy + rr * Math.sin(a0),
    e1x = cx + rr * Math.cos(a0 + sweep),
    e1y = cy + rr * Math.sin(a0 + sweep);
  const d0 = Math.hypot(x - e0x, y - e0y),
    d1 = Math.hypot(x - e1x, y - e1y);
  if (arc) {
    ARC[0] = d0 < d1 ? e0x : e1x;
    ARC[1] = d0 < d1 ? e0y : e1y;
    ARC[2] = h;
  }
  return Math.min(d0, d1) - h;
};
const triPrim = (q: Pt[]): Prim => {
  // counterclockwise, so that "inside" is left of every edge
  const [a, b, c] = cross(q[0], q[1], q[2]) > 0 ? q : [q[0], q[2], q[1]];
  return {
    k: 3,
    x1: a[0],
    y1: a[1],
    x2: b[0],
    y2: b[1],
    x3: c[0],
    y3: c[1],
    r: 0,
    bb: bboxOf(q),
  };
};
/** A member, or an avoided node, grown by r, as a primitive. */
const grownPrim = (m: Member, r: number): Prim =>
  m.kind === "disc"
    ? discPrim(m.cx, m.cy, m.r + r)
    : m.kind === "segment"
      ? capsulePrim(m.a, m.b, m.w / 2 + r)
      : boxPrim(m.x, m.y, m.w, m.h, r);
/** The circle that the nearest point of the last primitive measured lies on: center, radius (0: a
 *  straight side, and then the nearest point of its core), and 1 when that is a keep-out zone's edge;
 *  then (outline points only) the half-width of the piece it lies on, and 1 when that is a member's bulge. */
const ARC = new Float64Array(6);
const segD = (
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) => {
  const ex = bx - ax,
    ey = by - ay,
    L = ex * ex + ey * ey;
  const t =
    L > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L)) : 0;
  const dx = x - ax - t * ex,
    dy = y - ay - t * ey;
  return Math.sqrt(dx * dx + dy * dy);
};
/** Signed distance from (x, y) to a primitive; with `arc`, also fills ARC. */
const primD = (p: Prim, x: number, y: number, arc: boolean): number => {
  if (p.k === 0) {
    if (arc) {
      ARC[0] = p.x1;
      ARC[1] = p.y1;
      ARC[2] = p.r;
    }
    const dx = x - p.x1,
      dy = y - p.y1;
    return Math.sqrt(dx * dx + dy * dy) - p.r;
  }
  if (p.k === 1) {
    const ex = p.x2 - p.x1,
      ey = p.y2 - p.y1,
      L = ex * ex + ey * ey;
    const t = L > 0 ? ((x - p.x1) * ex + (y - p.y1) * ey) / L : 0,
      u = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = p.x1 + u * ex,
      qy = p.y1 + u * ey;
    // a capsule's ends are half circles around the segment's ends; its sides are straight
    if (arc) {
      ARC[0] = qx;
      ARC[1] = qy;
      ARC[2] = u === t && L > 0 ? 0 : p.r;
    }
    const dx = x - qx,
      dy = y - qy;
    return Math.sqrt(dx * dx + dy * dy) - p.r;
  }
  if (p.k === 2) {
    const qx = x < p.x1 ? p.x1 : x > p.x2 ? p.x2 : x,
      qy = y < p.y1 ? p.y1 : y > p.y2 ? p.y2 : y;
    if (qx === x && qy === y) {
      if (arc) ARC[2] = 0;
      return -Math.min(x - p.x1, p.x2 - x, y - p.y1, p.y2 - y) - p.r;
    }
    // a box's corners are quarter circles around the rectangle's corners
    if (arc) {
      ARC[0] = qx;
      ARC[1] = qy;
      ARC[2] = qx !== x && qy !== y ? p.r : 0;
    }
    const dx = x - qx,
      dy = y - qy;
    return Math.sqrt(dx * dx + dy * dy) - p.r;
  }
  if (p.k === 4) return arcD(p.x1, p.y1, p.x2, p.y2, p.x3, p.r, x, y, arc);
  if (p.k === 5) return taperD(p.x1, p.y1, p.x2, p.y2, p.r, p.x3, x, y, arc);
  if (arc) ARC[2] = 0;
  const d = Math.min(
    segD(x, y, p.x1, p.y1, p.x2, p.y2),
    segD(x, y, p.x2, p.y2, p.x3, p.y3),
    segD(x, y, p.x3, p.y3, p.x1, p.y1)
  );
  const inside =
    (p.x2 - p.x1) * (y - p.y1) - (p.y2 - p.y1) * (x - p.x1) >= 0 &&
    (p.x3 - p.x2) * (y - p.y2) - (p.y3 - p.y2) * (x - p.x2) >= 0 &&
    (p.x1 - p.x3) * (y - p.y3) - (p.y1 - p.y3) * (x - p.x3) >= 0;
  return inside ? -d : d;
};
/** The primitives packed 8 numbers each (kind, x1, y1, x2, y2, x3, y3, r), for the hot loops. */
const pack = (ps: Prim[]) => {
  const F = new Float64Array(8 * ps.length);
  ps.forEach((p, i) =>
    F.set([p.k, p.x1, p.y1, p.x2, p.y2, p.x3, p.y3, p.r], 8 * i)
  );
  return F;
};
/** primD on a packed primitive i, the distance alone. */
const primV = (F: Float64Array, i: number, x: number, y: number): number => {
  const o = 8 * i,
    k = F[o],
    x1 = F[o + 1],
    y1 = F[o + 2],
    r = F[o + 7];
  if (k === 0) {
    const dx = x - x1,
      dy = y - y1;
    return Math.sqrt(dx * dx + dy * dy) - r;
  }
  const x2 = F[o + 3],
    y2 = F[o + 4];
  if (k === 1) {
    const ex = x2 - x1,
      ey = y2 - y1,
      L = ex * ex + ey * ey;
    let t = L > 0 ? ((x - x1) * ex + (y - y1) * ey) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - x1 - t * ex,
      dy = y - y1 - t * ey;
    return Math.sqrt(dx * dx + dy * dy) - r;
  }
  if (k === 2) {
    const qx = x < x1 ? x1 : x > x2 ? x2 : x,
      qy = y < y1 ? y1 : y > y2 ? y2 : y;
    if (qx === x && qy === y)
      return -Math.min(x - x1, x2 - x, y - y1, y2 - y) - r;
    const dx = x - qx,
      dy = y - qy;
    return Math.sqrt(dx * dx + dy * dy) - r;
  }
  if (k === 4) return arcD(x1, y1, x2, y2, F[o + 5], r, x, y, false);
  if (k === 5) return taperD(x1, y1, x2, y2, r, F[o + 5], x, y, false);
  const x3 = F[o + 5],
    y3 = F[o + 6];
  const d = Math.min(
    segD(x, y, x1, y1, x2, y2),
    segD(x, y, x2, y2, x3, y3),
    segD(x, y, x3, y3, x1, y1)
  );
  const inside =
    (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) >= 0 &&
    (x3 - x2) * (y - y2) - (y3 - y2) * (x - x2) >= 0 &&
    (x1 - x3) * (y - y3) - (y1 - y3) * (x - x3) >= 0;
  return inside ? -d : d;
};
/** primV with the disc and capsule cases first and small enough to inline. */
const primFast = (F: Float64Array, i: number, x: number, y: number): number => {
  const o = 8 * i,
    k = F[o];
  if (k === 0) {
    const dx = x - F[o + 1],
      dy = y - F[o + 2];
    return Math.sqrt(dx * dx + dy * dy) - F[o + 7];
  }
  if (k === 1) {
    const x1 = F[o + 1],
      y1 = F[o + 2],
      ex = F[o + 3] - x1,
      ey = F[o + 4] - y1,
      L = ex * ex + ey * ey;
    let t = L > 0 ? ((x - x1) * ex + (y - y1) * ey) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - x1 - t * ex,
      dy = y - y1 - t * ey;
    return Math.sqrt(dx * dx + dy * dy) - F[o + 7];
  }
  return primV(F, i, x, y);
};
const FAR = 1e9;
/** The region's signed distance at (x, y): the union of the pieces minus the union of the zones,
 *  max(min pieces, -min zones), over candidate lists held in the arena A (pieces from po, pn of
 *  them, or none and the zones alone decide when pn < 0; zones from zo, zn of them). */
const regionD = (
  PF: Float64Array,
  ZF: Float64Array,
  A: Int32Array,
  po: number,
  pn: number,
  zo: number,
  zn: number,
  x: number,
  y: number
) => {
  let U = pn < 0 ? -FAR : FAR,
    Z = FAR;
  for (let i = po; i < po + pn; i++) {
    const d = primFast(PF, A[i], x, y);
    if (d < U) U = d;
  }
  for (let i = zo; i < zo + zn; i++) {
    const d = primFast(ZF, A[i], x, y);
    if (d < Z) Z = d;
  }
  return U > -Z ? U : -Z;
};
/** The same, also filling ARC with the circle the nearest outline point lies on. */
const regionArc = (
  pieces: Prim[],
  zones: Prim[],
  A: Int32Array,
  po: number,
  pn: number,
  zo: number,
  zn: number,
  x: number,
  y: number
) => {
  let U = pn < 0 ? -FAR : FAR,
    Z = FAR,
    bu = -1,
    bz = -1;
  // on a tie (a link's round end on its member's bulge) the point is the bulge's
  for (let i = po; i < po + pn; i++) {
    const d = primD(pieces[A[i]], x, y, false);
    if (
      d < U ||
      (d < U + 1e-9 && pieces[A[i]].bulge && !(bu >= 0 && pieces[bu].bulge))
    ) {
      U = d;
      bu = A[i];
    }
  }
  for (let i = zo; i < zo + zn; i++) {
    const d = primD(zones[A[i]], x, y, false);
    if (d < Z) {
      Z = d;
      bz = A[i];
    }
  }
  ARC[2] = 0;
  ARC[4] = bu >= 0 ? pieces[bu].r : 0;
  ARC[5] = bu >= 0 && pieces[bu].bulge ? 1 : 0;
  // a point on a zone's edge (as on a link wrapped around that zone) is the zone's: ARC is its circle or side
  ARC[3] = bz >= 0 && Math.abs(Z) < 0.05 ? 1 : 0; // (a resampled point sits on a chord, within 0.05 px of the circle)
  if (!ARC[3] && U > -Z) {
    // (a tapered link's primD writes its local half-width into ARC[4])
    if (bu >= 0) primD(pieces[bu], x, y, true);
    return U;
  }
  if (bz >= 0) primD(zones[bz], x, y, true);
  return -Z;
};
/** A traced loop: its points, the circle each lies on (4 numbers each, as ARC), and for each point
 *  the half-width of the piece it lies on (hw) and what it lies on (kind: 0 a link, 1 a keep-out
 *  zone's edge, 2 a member's bulge). */
type Loop = {
  pts: Pt[];
  arcs: Float64Array;
  hw?: Float64Array;
  kind?: Uint8Array;
};
type Region = {
  loops: Loop[];
  radii: number[];
  zones: Prim[];
  zoneGrid: ReturnType<typeof boxGrid>;
};
/** Marching squares: for each corner pattern (top-left 8, top-right 4, bottom-right 2,
 *  bottom-left 1 inside), the cell's segments as pairs of its edges (top 0, right 1, bottom 2, left 3). */
const SEGS: number[][] = [
  [],
  [2, 3],
  [1, 2],
  [1, 3],
  [0, 1],
  [0, 3, 2, 1],
  [0, 2],
  [0, 3],
  [3, 0],
  [2, 0],
  [3, 2, 1, 0],
  [1, 0],
  [3, 1],
  [2, 1],
  [3, 2],
  [],
];
/** Trace the region's outline exactly. A quadtree over a grid of `res` px finds the cells the
 *  outline crosses, keeping at each level only the primitives that can be nearest there (the
 *  distances are 1-Lipschitz, so a cell whose center is farther from the outline than its
 *  half-diagonal is wholly inside or outside). Marching squares joins the crossed cells into
 *  loops, each crossing is found exactly on its grid edge, and each loop is resampled every
 *  `ds` px with the circle each point lies on. */
/** Grids reused from one trace to the next (allocating and clearing them each time costs more than
 *  the trace): a grid entry counts only when its stamp is the current trace's. */
const scratch = {
  gen: 0,
  size: 0,
  V: new Float64Array(0),
  vStamp: new Int32Array(0),
  cellOf: new Int32Array(0),
  cStamp: new Int32Array(0),
  next: new Int32Array(0),
  nStamp: new Int32Array(0),
  seen: new Int32Array(0),
};
/** The most grid cells the scratch keeps between traces (about 4M cells,
 *  a few hundred MB of typed arrays at most). */
const SCRATCH_CAP = 4_000_000;
const releaseScratch = () =>
  Object.assign(scratch, {
    size: 0,
    V: new Float64Array(0),
    vStamp: new Int32Array(0),
    cellOf: new Int32Array(0),
    cStamp: new Int32Array(0),
    next: new Int32Array(0),
    nStamp: new Int32Array(0),
    seen: new Int32Array(0),
  });
const traceRegion = (
  pieces: Prim[],
  zones: Prim[],
  res: number,
  ds: number
): Region => {
  const bb = pieces.reduce(
    (r, p) => [
      Math.min(r[0], p.bb[0]),
      Math.min(r[1], p.bb[1]),
      Math.max(r[2], p.bb[2]),
      Math.max(r[3], p.bb[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
  const x0 = Math.floor(bb[0] / res - 2) * res,
    y0 = Math.floor(bb[1] / res - 2) * res;
  const W = Math.ceil((bb[2] - x0) / res) + 3,
    H = Math.ceil((bb[3] - y0) / res) + 3;
  // V: the distance at the grid points of the blocks near the outline (NaN elsewhere, never read).
  // cellOf: for each cell in such a block, 1 + its block's number; a block keeps its candidate lists.
  if (scratch.size < W * H) {
    const n = 2 * W * H;
    Object.assign(scratch, {
      size: n,
      V: new Float64Array(n),
      vStamp: new Int32Array(n),
      cellOf: new Int32Array(n),
      cStamp: new Int32Array(n),
      next: new Int32Array(2 * n),
      nStamp: new Int32Array(2 * n),
      seen: new Int32Array(2 * n),
    });
  }
  const gen = ++scratch.gen,
    { V, vStamp, cellOf: cellRaw, cStamp, next, nStamp, seen } = scratch;
  const leaves: number[] = [],
    blocks: number[] = [];
  const cellOf = (c: number) => (cStamp[c] === gen ? cellRaw[c] : 0);
  const pd = new Float64Array(pieces.length),
    zd = new Float64Array(zones.length),
    PF = pack(pieces),
    ZF = pack(zones);
  // every candidate list lives in one growing arena, as an offset and a length
  let A = new Int32Array(1 << 16),
    top = 0;
  const reserve = (n: number) => {
    if (top + n > A.length) {
      const B = new Int32Array(Math.max(2 * A.length, top + n));
      B.set(A);
      A = B;
    }
  };
  /** Copy the entries of A[o, o + n) whose value in d is at most lim to the top of the arena. */
  const keepWithin = (o: number, n: number, d: Float64Array, lim: number) => {
    reserve(n);
    const start = top;
    for (let i = o; i < o + n; i++) if (d[A[i]] <= lim) A[top++] = A[i];
    return start;
  };
  const node = (
    i0: number,
    j0: number,
    n: number,
    po: number,
    pn: number,
    zo: number,
    zn: number
  ) => {
    if (i0 >= W - 1 || j0 >= H - 1) return;
    const cx = x0 + (i0 + n / 2) * res,
      cy = y0 + (j0 + n / 2) * res,
      r = (n * res) / Math.SQRT2;
    let U = pn < 0 ? -FAR : FAR,
      Z = FAR,
      i = po;
    // pieces first: a cell outside them all is outside the region whatever the zones; one deep
    // inside a piece is settled by the zones alone
    for (; i < po + pn; i++) {
      const d = (pd[A[i]] = primFast(PF, A[i], cx, cy));
      if (d < U) U = d;
      if (U < -r) break;
    }
    if (U > r) return;
    for (let j = zo; j < zo + zn; j++) {
      const d = (zd[A[j]] = primFast(ZF, A[j], cx, cy));
      if (d < Z) Z = d;
    }
    if (U < -r && Z > r) return; // deep inside a piece, clear of every zone
    for (i++; i < po + pn; i++) {
      const d = (pd[A[i]] = primFast(PF, A[i], cx, cy));
      if (d < U) U = d;
    }
    const D = U > -Z ? U : -Z;
    if (Math.abs(D) > r) return; // wholly inside or outside
    // keep what can be nearest somewhere in the cell (each distance moves at most r from the center)
    const mark = top;
    let qo = po,
      qn = pn,
      wo = zo,
      wn = 0;
    if (-Z - r > U + r)
      qn = -1; // the zones alone decide here
    else if (pn >= 0) {
      qo = keepWithin(po, pn, pd, U + 2 * r);
      qn = top - qo;
    }
    if (!(U - r > -Z + r)) {
      wo = keepWithin(zo, zn, zd, Z + 2 * r);
      wn = top - wo;
    } // else the pieces alone decide
    if (n <= 2) {
      // a block of n x n cells near the outline: every grid point is measured exactly (its lists stay in the arena)
      blocks.push(qo, qn, wo, wn);
      const b = blocks.length / 4;
      for (let dj = 0; dj <= n; dj++)
        for (let di = 0; di <= n; di++) {
          if (i0 + di >= W || j0 + dj >= H) continue;
          const v = (j0 + dj) * W + i0 + di;
          if (vStamp[v] !== gen) {
            vStamp[v] = gen;
            V[v] = regionD(
              PF,
              ZF,
              A,
              qo,
              qn,
              wo,
              wn,
              x0 + (i0 + di) * res,
              y0 + (j0 + dj) * res
            );
          }
          if (di < n && dj < n && i0 + di < W - 1 && j0 + dj < H - 1) {
            cellRaw[v] = b;
            cStamp[v] = gen;
            leaves.push(v);
          }
        }
      return;
    }
    const h = n / 2,
      nb = blocks.length;
    node(i0, j0, h, qo, qn, wo, wn);
    node(i0 + h, j0, h, qo, qn, wo, wn);
    node(i0, j0 + h, h, qo, qn, wo, wn);
    node(i0 + h, j0 + h, h, qo, qn, wo, wn);
    if (blocks.length === nb) top = mark; // no block below keeps these lists
  };
  // The quadtree starts from tiles of 16 cells, each with the primitives whose boxes come within
  // a tile's diagonal of it: any other is at least that far from every point of the tile, so it
  // can neither be nearest where the outline is nor change a tile's inside-or-outside verdict.
  const T = 16,
    tw = T * res,
    reach = tw * Math.SQRT2,
    TX = Math.ceil((W - 1) / T),
    TY = Math.ceil((H - 1) / T);
  const lists = (prims: Prim[]) => {
    const out: number[][] = Array.from({ length: TX * TY }, () => []);
    prims.forEach((p, k) => {
      const i0 = Math.max(0, Math.floor((p.bb[0] - reach - x0) / tw)),
        i1 = Math.min(TX - 1, Math.floor((p.bb[2] + reach - x0) / tw));
      const j0 = Math.max(0, Math.floor((p.bb[1] - reach - y0) / tw)),
        j1 = Math.min(TY - 1, Math.floor((p.bb[3] + reach - y0) / tw));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) out[j * TX + i].push(k);
    });
    return out;
  };
  const tp = lists(pieces),
    tz = lists(zones);
  for (let t = 0; t < TX * TY; t++) {
    const mark = top,
      nb = blocks.length;
    reserve(tp[t].length + tz[t].length);
    const po = top;
    for (const k of tp[t]) A[top++] = k;
    const zo = top;
    for (const k of tz[t]) A[top++] = k;
    node(
      (t % TX) * T,
      Math.floor(t / TX) * T,
      T,
      po,
      tp[t].length,
      zo,
      tz[t].length
    );
    if (blocks.length === nb) top = mark; // no block keeps this tile's lists
  }

  // marching squares on -V (inside >= 0); an edge is 2 (j W + i) for the horizontal edge from
  // (i, j), plus 1 for the vertical one
  const order: number[] = [];
  const nextOf = (e: number) => (nStamp[e] === gen ? next[e] : -1);
  for (const k of leaves) {
    const c =
        (V[k] <= 0 ? 8 : 0) +
        (V[k + 1] <= 0 ? 4 : 0) +
        (V[k + W + 1] <= 0 ? 2 : 0) +
        (V[k + W] <= 0 ? 1 : 0),
      sg = SEGS[c];
    for (let q = 0; q < sg.length; q += 2) {
      const ea =
        sg[q] === 0
          ? 2 * k
          : sg[q] === 1
            ? 2 * (k + 1) + 1
            : sg[q] === 2
              ? 2 * (k + W)
              : 2 * k + 1;
      const eb =
        sg[q + 1] === 0
          ? 2 * k
          : sg[q + 1] === 1
            ? 2 * (k + 1) + 1
            : sg[q + 1] === 2
              ? 2 * (k + W)
              : 2 * k + 1;
      if (nStamp[ea] !== gen) {
        order.push(ea);
        nStamp[ea] = gen;
      }
      next[ea] = eb;
    }
  }
  const cellAt = (e: number) => {
    const v = e >> 1;
    return cellOf(v) ? v : e & 1 ? v - 1 : v - W;
  };
  /** The exact crossing on edge e (regula falsi on the region's distance, from a cell that knows its primitives). */
  const crossing = (e: number): Pt => {
    const v = e >> 1,
      i = v % W,
      j = (v - i) / W,
      vert = e & 1,
      b = 4 * (cellOf(cellAt(e)) - 1);
    const ax = x0 + i * res,
      ay = y0 + j * res,
      bx = ax + (vert ? 0 : res),
      by = ay + (vert ? res : 0);
    let lo = 0,
      hi = 1,
      flo = V[v],
      fhi = V[vert ? v + W : v + 1],
      side = 0,
      t = 0;
    for (let it = 0; it < 30; it++) {
      t = (lo * fhi - hi * flo) / (fhi - flo);
      const f = regionD(
        PF,
        ZF,
        A,
        blocks[b],
        blocks[b + 1],
        blocks[b + 2],
        blocks[b + 3],
        ax + t * (bx - ax),
        ay + t * (by - ay)
      );
      if (Math.abs(f) < 1e-4) break; // a ten-thousandth of a pixel
      if (f > 0 === flo > 0) {
        lo = t;
        flo = f;
        if (side === -1) fhi /= 2;
        side = -1;
      } else {
        hi = t;
        fhi = f;
        if (side === 1) flo /= 2;
        side = 1;
      }
    }
    return [ax + t * (bx - ax), ay + t * (by - ay)];
  };
  const loops: Loop[] = [],
    radii = new Set<number>();
  for (const s0 of order) {
    if (seen[s0] === gen) continue;
    const raw: Pt[] = [],
      cells: number[] = [];
    for (let cur = s0; cur >= 0 && seen[cur] !== gen; cur = nextOf(cur)) {
      seen[cur] = gen;
      raw.push(crossing(cur));
      cells.push(cellAt(cur));
    }
    if (raw.length <= 8) continue;
    // resample every ds px along the traced loop, and look up the circle each point lies on
    const m = raw.length,
      cum = new Float64Array(m + 1);
    for (let q = 1; q <= m; q++)
      cum[q] = cum[q - 1] + dist(raw[q - 1], raw[q % m]);
    const L = cum[m],
      N = Math.max(8, Math.round(L / ds)),
      pts: Pt[] = [],
      arcs = new Float64Array(4 * N),
      hw = new Float64Array(N),
      kind = new Uint8Array(N);
    let k = 0;
    for (let q = 0; q < N; q++) {
      const t = (q / N) * L;
      while (cum[k + 1] < t) k++;
      const u = (t - cum[k]) / (cum[k + 1] - cum[k] || 1),
        a = raw[k],
        b = raw[(k + 1) % m];
      const p: Pt = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])];
      const bl = 4 * (cellOf(cells[u < 0.5 ? k : (k + 1) % m]) - 1);
      regionArc(
        pieces,
        zones,
        A,
        blocks[bl],
        blocks[bl + 1],
        blocks[bl + 2],
        blocks[bl + 3],
        p[0],
        p[1]
      );
      arcs[4 * q] = ARC[0];
      arcs[4 * q + 1] = ARC[1];
      arcs[4 * q + 2] = ARC[2];
      arcs[4 * q + 3] = ARC[3];
      hw[q] = ARC[4];
      kind[q] = ARC[3] ? 1 : ARC[5] ? 2 : 0;
      if (ARC[2] > 0) radii.add(ARC[2]);
      pts.push(p);
    }
    loops.push({ pts, arcs, hw, kind });
  }
  // One huge enclosure must not pin its grids: past the cap they are let go,
  // and the next trace allocates what it needs.
  if (scratch.size > SCRATCH_CAP) releaseScratch();
  return {
    loops,
    radii: [...radii],
    zones,
    zoneGrid: boxGrid(zones.map((z) => z.bb)),
  };
};

// ── step 3: rounding ────────────────────────────────────────────────────────
/** Normalized Gaussian weights for a width of s samples. */
const gaussWeights = (s: number) => {
  const J = Math.ceil(4 * s),
    w = new Float64Array(2 * J + 1);
  let z = 0;
  for (let j = -J; j <= J; j++)
    z += w[j + J] = Math.exp(-(j * j) / (2 * s * s));
  for (let j = 0; j < w.length; j++) w[j] /= z;
  return w;
};
/** Round one closed loop: a Gaussian of width sigma along its arc length, with every point that
 *  lies on a circle first moved out from that circle's center by 1 / f, where f is how much the
 *  same smoothing shrinks that circle. So a circle and a straight side come out exactly where
 *  they were, and only corners and joins (where the curvature jumps) change: they round. */
const roundLoop = (
  pts: Pt[],
  arcs: Float64Array,
  sigma: number,
  k: number
): Pt[] => {
  const N = pts.length;
  let L = 0;
  for (let i = 0; i < N; i++) L += dist(pts[i], pts[(i + 1) % N]);
  const ds = L / N,
    w = gaussWeights(sigma / ds),
    J = (w.length - 1) / 2;
  const shrink = new Map<number, number>();
  const f = (rho: number) => {
    let v = shrink.get(rho);
    if (v === undefined) {
      v = 0;
      for (let j = -J; j <= J; j++) v += w[j + J] * Math.cos((j * ds) / rho);
      shrink.set(rho, v);
    }
    return v;
  };
  const X = new Float64Array(N),
    Y = new Float64Array(N);
  // A hole cut by avoided nodes alone (every point on a zone's edge) starts k inside them, where
  // keepOut puts it back on their edges exactly. Elsewhere a zone only bounds the outline, which
  // keepOut keeps at least the clearance away.
  let hole = 1;
  for (let i = 0; i < N; i++) hole = Math.min(hole, arcs[4 * i + 3]);
  for (let i = 0; i < N; i++) {
    const cx = arcs[4 * i],
      cy = arcs[4 * i + 1],
      rho = arcs[4 * i + 2],
      onZone = hole;
    const dx = pts[i][0] - cx,
      dy = pts[i][1] - cy,
      d = Math.hypot(dx, dy) || 1;
    let s = onZone ? (d - k) / d : 1;
    if (rho > 0 && sigma > 0) s /= f(rho);
    X[i] = rho > 0 || onZone ? cx + dx * s : pts[i][0];
    Y[i] = rho > 0 || onZone ? cy + dy * s : pts[i][1];
  }
  const out: Pt[] = [];
  if (sigma <= 0) {
    for (let i = 0; i < N; i++) out.push([X[i], Y[i]]);
    return out;
  }
  // the loop is closed: pad it with J points from each end, so the sums run without wrapping
  const PX = new Float64Array(N + 2 * J),
    PY = new Float64Array(N + 2 * J);
  for (let i = 0; i < N + 2 * J; i++) {
    const q = (((i - J) % N) + N) % N;
    PX[i] = X[q];
    PY[i] = Y[q];
  }
  for (let i = 0; i < N; i++) {
    let x = 0,
      y = 0;
    for (let j = 0; j < w.length; j++) {
      x += w[j] * PX[i + j];
      y += w[j] * PY[i + j];
    }
    out.push([x, y]);
  }
  return out;
};
/** Rounding along the outline reaches corners, but not across an inlet: two sides of a narrow
 *  inlet are far apart along the outline even where they nearly touch. So before rounding, every
 *  inlet narrower than w is closed: where the outline comes back within w of itself around a
 *  pocket of the outside (it turns the other way from the loop) that is at most w wide on
 *  average and holds no keep-out zone, the pocket is replaced by the straight line across its
 *  mouth. The pocket is outside the region, so this only fills; the loop stays one loop, so the
 *  pieces and holes stay as traced. */
const closeInlets = (
  pts: Pt[],
  arcs: Float64Array,
  w: number,
  zones: Prim[],
  zoneGrid: ReturnType<typeof boxGrid>
): { pts: Pt[]; arcs: Float64Array } => {
  const N = pts.length;
  if (w <= 0 || N < 16) return { pts, arcs };
  let L = 0;
  const C = new Float64Array(N + 1); // C[k]: twice the signed area swept from point 0 to point k
  for (let k = 0; k < N; k++) {
    const p = pts[k],
      q = pts[(k + 1) % N];
    C[k + 1] = C[k] + p[0] * q[1] - q[0] * p[1];
    L += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  const ds = L / N,
    sgn = Math.sign(C[N]),
    minRun = Math.ceil((3 * w) / ds);
  // twice the signed area of the pocket from i forward to j, closed by the chord
  const area2 = (i: number, j: number) =>
    (j >= i ? C[j] - C[i] : C[N] - C[i] + C[j]) +
    pts[j][0] * pts[i][1] -
    pts[i][0] * pts[j][1];
  // points by grid cell, to find the pairs within w
  const cells = new Map<number, number[]>(),
    key = (a: number, b: number) => a * 1048576 + b;
  pts.forEach((p, k) => {
    const c = key(Math.floor(p[0] / w), Math.floor(p[1] / w));
    let l = cells.get(c);
    if (!l) cells.set(c, (l = []));
    l.push(k);
  });
  const spans: [number, number][] = []; // [start, run]: the pocket runs from start forward run steps
  pts.forEach((p, i) => {
    const a = Math.floor(p[0] / w),
      b = Math.floor(p[1] / w);
    let best = -1,
      bestRun = 0;
    for (let da = -1; da <= 1; da++)
      for (let db = -1; db <= 1; db++)
        for (const j of cells.get(key(a + da, b + db)) ?? []) {
          const run = (j - i + N) % N;
          if (
            run < minRun ||
            run > N - minRun ||
            run <= bestRun ||
            dist(p, pts[j]) >= w
          )
            continue;
          const A = area2(i, j) / 2;
          if (Math.sign(A) === sgn || Math.abs(A) > (w * run * ds) / 2)
            continue;
          best = j;
          bestRun = run;
        }
    if (best >= 0) spans.push([i, bestRun]);
  });
  // the widest pockets first; a pocket inside an accepted one is already closed, one that overlaps it is left
  spans.sort((x, y) => y[1] - x[1]);
  const taken = new Uint8Array(N),
    cut: [number, number][] = [];
  for (const [i, run] of spans) {
    let free = true;
    for (let t = 0; t <= run && free; t++) if (taken[(i + t) % N]) free = false;
    if (!free) continue;
    // a pocket that holds part of a keep-out zone stays open (closing it would cover the zone)
    const poly: Pt[] = [];
    for (let t = 0; t <= run; t++) poly.push(pts[(i + t) % N]);
    const bb = bboxOf(poly);
    let hit = false;
    zoneGrid.each(bb[0], bb[1], bb[2], bb[3], (z) => {
      if (hit) return;
      const zp = zones[z];
      if (
        primD(
          zp,
          (pts[i][0] + pts[(i + run) % N][0]) / 2,
          (pts[i][1] + pts[(i + run) % N][1]) / 2,
          false
        ) < w ||
        pointInRing([zp.x1, zp.y1], poly)
      )
        hit = true;
    });
    if (hit) continue;
    for (let t = 0; t <= run; t++) taken[(i + t) % N] = 1;
    cut.push([i, run]);
  }
  if (!cut.length) return { pts, arcs };
  // rebuild the loop: each closed pocket becomes its mouth, sampled every ds
  const start = new Int32Array(N).fill(-1);
  for (const [i, run] of cut) start[i] = run;
  const P: Pt[] = [],
    A: number[] = [];
  let k = 0;
  // begin at a point outside every pocket
  let k0 = 0;
  while (taken[k0] && start[k0] < 0) k0++;
  for (let n = 0; n < N; ) {
    k = (k0 + n) % N;
    if (start[k] >= 0) {
      const j = (k + start[k]) % N,
        a = pts[k],
        b = pts[j],
        m = Math.max(1, Math.round(dist(a, b) / ds));
      for (let t = 0; t < m; t++) {
        P.push([
          a[0] + ((b[0] - a[0]) * t) / m,
          a[1] + ((b[1] - a[1]) * t) / m,
        ]);
        A.push(
          t ? 0 : arcs[4 * k],
          t ? 0 : arcs[4 * k + 1],
          t ? 0 : arcs[4 * k + 2],
          0
        );
      }
      n += start[k];
      continue;
    }
    P.push(pts[k]);
    A.push(arcs[4 * k], arcs[4 * k + 1], arcs[4 * k + 2], arcs[4 * k + 3]);
    n++;
  }
  return { pts: P, arcs: Float64Array.from(A) };
};
/** A smooth max of t and 0 (the cubic one: exactly max(t, 0) beyond 1 either way, twice differentiable). */
const smax0 = (t: number) => {
  const h = Math.max(0, 1 - Math.abs(t));
  return Math.max(t, 0) + (h * h * h) / 6;
};
/** Rounding fills a corner a little, so near a keep-out zone it could cross into it. Each rounded
 *  point within k of a zone is moved along the nearest zone's normal from distance d to the zone's
 *  edge (negative inside) to a ramp-smoothed max(d, 0). A point on the edge or farther than
 *  k stays put, a point inside lands on the edge, and the map is twice differentiable, so the
 *  outline keeps its continuous curvature. */
const keepOut = (
  pts: Pt[],
  zones: Prim[],
  grid: ReturnType<typeof boxGrid>,
  k: number
): Pt[] => {
  if (k <= 0 || !zones.length) return pts;
  return pts.map((p) => {
    let q = p;
    // zones overlap: each step moves out of the nearest one (the deepest, if inside several), and
    // a step that lands in another zone is followed by one out of that
    for (let step = 0; step < 4; step++) {
      let best = Infinity,
        cx = 0,
        cy = 0;
      grid.each(q[0] - k, q[1] - k, q[0] + k, q[1] + k, (z) => {
        const d = primD(zones[z], q[0], q[1], true);
        if (d < best) {
          best = d;
          cx = ARC[0];
          cy = ARC[1];
        }
      });
      if (best >= k || (step > 0 && best > -1e-6)) break;
      // the zone's normal at q: away from the nearest point of its core
      const rr = Math.hypot(q[0] - cx, q[1] - cy) || 1,
        nd = k * smax0(best / k);
      q = [
        q[0] + ((nd - best) * (q[0] - cx)) / rr,
        q[1] + ((nd - best) * (q[1] - cy)) / rr,
      ];
    }
    return q;
  });
};
/** Do any two segments of these loops cross (the same loop's neighbors excepted)? With `hits`,
 *  every crossing is found and its place pushed there. */
const loopsCross = (loops: Pt[][], hits?: Pt[]) => {
  const owner: number[] = [],
    idx: number[] = [];
  let len = 0,
    X0 = Infinity,
    Y0 = Infinity,
    X1 = -Infinity,
    Y1 = -Infinity;
  loops.forEach((l, li) =>
    l.forEach((p, i) => {
      owner.push(li);
      idx.push(i);
      len += dist(p, l[(i + 1) % l.length]);
      X0 = Math.min(X0, p[0]);
      Y0 = Math.min(Y0, p[1]);
      X1 = Math.max(X1, p[0]);
      Y1 = Math.max(Y1, p[1]);
    })
  );
  const n = owner.length;
  if (!n) return false;
  // a grid of cells about two segments long, each holding a linked list of the segments it meets
  const g = Math.max(2, (2 * len) / n),
    nx = Math.floor((X1 - X0) / g) + 1,
    ny = Math.floor((Y1 - Y0) / g) + 1;
  const head = new Int32Array(nx * ny).fill(-1),
    next: number[] = [],
    seg: number[] = [];
  for (let s2 = 0; s2 < n; s2++) {
    const l = loops[owner[s2]],
      i = idx[s2],
      p = l[i],
      q = l[(i + 1) % l.length];
    for (
      let a2 = Math.floor((Math.min(p[0], q[0]) - X0) / g);
      a2 <= Math.floor((Math.max(p[0], q[0]) - X0) / g);
      a2++
    )
      for (
        let b2 = Math.floor((Math.min(p[1], q[1]) - Y0) / g);
        b2 <= Math.floor((Math.max(p[1], q[1]) - Y0) / g);
        b2++
      ) {
        const c = b2 * nx + a2;
        for (let e = head[c]; e >= 0; e = next[e]) {
          const t = seg[e],
            lt = owner[t],
            it = idx[t],
            L = loops[lt],
            m = L.length;
          if (
            lt === owner[s2] &&
            (Math.abs(it - i) <= 1 || Math.abs(it - i) === m - 1)
          )
            continue;
          if (segIntersect(p, q, L[it], L[(it + 1) % m])) {
            if (!hits) return true;
            hits.push(p);
          }
        }
        next.push(head[c]);
        seg.push(s2);
        head[c] = seg.length - 1;
      }
  }
  return hits ? hits.length > 0 : false;
};

/** Move p out of a bulge it is inside onto that bulge's edge (along the bulge's normal), and give the
 *  circle the new point lies on (radius 0: a straight side). */
const ontoBulge = (b: Prim, p: Pt): { p: Pt; c: Pt; r: number } => {
  let qx = b.x1,
    qy = b.y1,
    r = b.r;
  if (b.k === 1) {
    const ex = b.x2 - b.x1,
      ey = b.y2 - b.y1,
      L = ex * ex + ey * ey;
    const t = L > 0 ? ((p[0] - b.x1) * ex + (p[1] - b.y1) * ey) / L : 0,
      u = t < 0 ? 0 : t > 1 ? 1 : t;
    qx = b.x1 + u * ex;
    qy = b.y1 + u * ey;
    if (u === t && L > 0) r = 0; // on a straight side
  } else if (b.k === 2) {
    qx = Math.max(b.x1, Math.min(b.x2, p[0]));
    qy = Math.max(b.y1, Math.min(b.y2, p[1]));
    if (qx === p[0] && qy === p[1]) {
      // inside the rectangle itself: out through its nearest side
      const d = [p[0] - b.x1, b.x2 - p[0], p[1] - b.y1, b.y2 - p[1]],
        k = d.indexOf(Math.min(...d));
      const out: Pt =
        k === 0
          ? [b.x1 - b.r, p[1]]
          : k === 1
            ? [b.x2 + b.r, p[1]]
            : k === 2
              ? [p[0], b.y1 - b.r]
              : [p[0], b.y2 + b.r];
      return { p: out, c: out, r: 0 };
    }
    if (qx !== p[0] && qy !== p[1]) r = b.r;
    else r = 0; // a corner's quarter circle, else a side
  }
  const dx = p[0] - qx,
    dy = p[1] - qy,
    d = Math.hypot(dx, dy) || 1;
  return { p: [qx + (dx * b.r) / d, qy + (dy * b.r) / d], c: [qx, qy], r };
};
/** The point of a disc's, capsule's or box's core (its center, segment or rectangle) nearest p. */
const coreNear = (b: Prim, p: Pt): Pt | null => {
  if (b.k === 0) return [b.x1, b.y1];
  if (b.k === 1) return nearestOnSeg(p, [b.x1, b.y1], [b.x2, b.y2]);
  if (b.k === 2)
    return [
      Math.max(b.x1, Math.min(b.x2, p[0])),
      Math.max(b.y1, Math.min(b.y2, p[1])),
    ];
  return null;
};
/** Where the path from p to q first enters primitive b, as a fraction of the way (0 when p is
 *  already inside), or -1 when it never does. A disc or a capsule is exact: the first place the
 *  path meets its edge (a circle, or a capsule's end circles and straight sides). Another primitive
 *  is convex, so its signed distance along the path is convex: its least value is found by ternary
 *  search, the entry by bisection before it. */
const entryInto = (b: Prim, p: Pt, q: Pt): number => {
  const vx = q[0] - p[0],
    vy = q[1] - p[1];
  const f = (t: number) => primD(b, p[0] + t * vx, p[1] + t * vy, false);
  if (f(0) < 0) return 0;
  if (b.k === 0 || b.k === 1) {
    let best = Infinity;
    const vv = vx * vx + vy * vy;
    if (vv < 1e-18) return -1;
    const circle = (cx: number, cy: number) => {
      const fx = p[0] - cx,
        fy = p[1] - cy,
        B = fx * vx + fy * vy,
        C = fx * fx + fy * fy - b.r * b.r,
        D = B * B - vv * C;
      if (D < 0) return;
      for (const t of [(-B - Math.sqrt(D)) / vv, (-B + Math.sqrt(D)) / vv])
        if (t >= 0 && t <= 1 && t < best && Math.abs(f(t)) < 1e-6) best = t;
    };
    circle(b.x1, b.y1);
    if (b.k === 1) {
      circle(b.x2, b.y2);
      // the straight sides: the lines at distance r either side of the core
      const ex = b.x2 - b.x1,
        ey = b.y2 - b.y1,
        L = Math.hypot(ex, ey);
      if (L > 0) {
        const nx = -ey / L,
          ny = ex / L,
          s0 = (p[0] - b.x1) * nx + (p[1] - b.y1) * ny,
          sv = vx * nx + vy * ny;
        if (Math.abs(sv) > 1e-12)
          for (const side of [-b.r, b.r]) {
            const t = (side - s0) / sv;
            if (t >= 0 && t <= 1 && t < best && Math.abs(f(t)) < 1e-6) best = t;
          }
      }
    }
    return best === Infinity ? -1 : best;
  }
  let lo = 0,
    hi = 1;
  for (let it = 0; it < 40 && hi - lo > 1e-6; it++) {
    const m1 = lo + (hi - lo) / 3,
      m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2;
    else lo = m1;
  }
  const tm = (lo + hi) / 2;
  if (f(tm) >= 0) return -1;
  lo = 0;
  hi = tm;
  for (let it = 0; it < 40 && hi - lo > 1e-7; it++) {
    const m = (lo + hi) / 2;
    if (f(m) < 0) hi = m;
    else lo = m;
  }
  return hi;
};
/** Step 3, `neck`: pull the outline in. Every outline point not on a member's bulge moves inward
 *  along its own piece's normal (toward a link's spine; where two pieces meet in a corner the moved
 *  sides are carried on until they meet, so the pull never rounds a corner) by `pull` (1 - neck) times
 *  the region's half-width there: the radius of the largest disc inside the region that touches the
 *  outline at that point, capped at the link's own half-width. On a lone link that disc is the
 *  link's tube, so the tube thins to neck times its width about its middle (and a link that ran
 *  along a keep-out zone's edge moves off it: the gap only grows); on a filled triangle's boundary
 *  edge the cap holds, so the edge sinks in between its two members; where two parts of the region
 *  only touch, the disc is the narrow place between them, which thins but never closes. A hole cut
 *  by keep-out zones alone stays exactly as cut. A point that
 *  moves into a member's bulge stops on its edge (a bulge stays whole, except where a zone cuts it). Since no point moves past
 *  the middle of its disc, each loop stays one loop and no two loops meet: the pieces and holes
 *  are those of the full-width region, whatever `neck` is. */
const neckOutline = (
  region: Region,
  bulges: Prim[],
  pull: number,
  scale?: Float64Array[]
): Loop[] => {
  if (pull <= 0) return region.loops;
  const loops = region.loops;
  // every outline point in a grid of cells two link widths wide
  let cap = 0;
  for (const l of loops)
    for (let i = 0; i < l.pts.length; i++)
      if (l.kind![i] !== 2) cap = Math.max(cap, l.hw![i]);
  if (cap <= 0) return loops;
  let total = 0,
    X0 = Infinity,
    Y0 = Infinity,
    X1 = -Infinity,
    Y1 = -Infinity;
  for (const l of loops)
    for (const p of l.pts) {
      total++;
      X0 = Math.min(X0, p[0]);
      Y0 = Math.min(Y0, p[1]);
      X1 = Math.max(X1, p[0]);
      Y1 = Math.max(Y1, p[1]);
    }
  // the points sorted by cell (cells cap wide), with each cell's first index: a flat grid
  const g = cap,
    GW = Math.floor((X1 - X0) / g) + 1,
    GH = Math.floor((Y1 - Y0) / g) + 1;
  const cellOf = (x: number, y: number) =>
    Math.floor((y - Y0) / g) * GW + Math.floor((x - X0) / g);
  const start = new Int32Array(GW * GH + 1),
    PX = new Float64Array(total),
    PY = new Float64Array(total);
  for (const l of loops) for (const p of l.pts) start[cellOf(p[0], p[1]) + 1]++;
  for (let c = 0; c < GW * GH; c++) start[c + 1] += start[c];
  const fill = start.slice(0, GW * GH);
  for (const l of loops)
    for (const p of l.pts) {
      const k = fill[cellOf(p[0], p[1])]++;
      PX[k] = p[0];
      PY[k] = p[1];
    }
  // the region lies to the left of every loop when the outermost loop runs counterclockwise
  const areas = loops.map((l) => signedArea2(l.pts));
  const side =
    Math.sign(areas.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0)) ||
    1;
  const bgrid = boxGrid(bulges.map((b) => b.bb));
  return loops.map((l, li) => {
    const { pts, arcs, hw, kind } = l as Required<Loop>,
      N = pts.length;
    if (kind.every((k) => k === 1)) return l; // a hole cut by keep-out zones alone stays exactly as cut
    // the inward normal and the half-width at every point not on a bulge
    const NX = new Float64Array(N),
      NY = new Float64Array(N),
      rho = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      if (kind[i] === 2) continue;
      const p = pts[i],
        a = pts[(i - 1 + N) % N],
        b = pts[(i + 1) % N],
        tx = b[0] - a[0],
        ty = b[1] - a[1],
        tl = Math.hypot(tx, ty) || 1;
      const nx = (NX[i] = (-side * ty) / tl),
        ny = (NY[i] = (side * tx) / tl);
      // the largest disc tangent here inside the region: the smallest disc through p (tangent to the
      // outline there) and another outline point, among points no farther than 2 cap
      let r = hw[i];
      const ci = Math.floor((p[0] - X0) / g),
        cj = Math.floor((p[1] - Y0) / g);
      for (let j = Math.max(0, cj - 2); j <= Math.min(GH - 1, cj + 2); j++) {
        const c0 = j * GW + Math.max(0, ci - 2),
          c1 = j * GW + Math.min(GW - 1, ci + 2);
        for (let q = start[c0]; q < start[c1 + 1]; q++) {
          const dx = PX[q] - p[0],
            dy = PY[q] - p[1],
            dn = dx * nx + dy * ny;
          if (dn <= 1e-9) continue;
          const rq = (dx * dx + dy * dy) / (2 * dn);
          if (rq < r) r = rq;
        }
      }
      rho[i] = r;
    }
    // Each point moves along its own piece's normal (toward a link's spine, away from a keep-out
    // zone's center), so a side of a link moves exactly as that link's thinner tube would. Where
    // two pieces meet in a corner, the outline's own normal turns through the corner, and moving
    // along it would round the corner by the pull itself (a web as wide as the pull); instead the
    // two moved sides are carried on until they meet, so the corner stays a corner and only
    // `roundness` rounds it.
    const ds = dist(pts[0], pts[1]) || 1;
    const Q: Pt[] = new Array(N),
      DX = new Float64Array(N),
      DY = new Float64Array(N),
      S = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      if (kind[i] === 2) {
        Q[i] = p;
        continue;
      }
      // the half-width is measured against points 1 px apart, which makes it jitter from one point
      // to the next by a fraction of a pixel; it is averaged over the 2 points either side
      let sum = 0,
        n = 0;
      for (let j = -2; j <= 2; j++) {
        const k = (i + j + N) % N;
        if (kind[k] !== 2) {
          sum += rho[k];
          n++;
        }
      }
      const s = (S[i] = pull * (scale ? scale[li][i] : 1) * (sum / n));
      let dx = NX[i],
        dy = NY[i];
      const ux = p[0] - arcs[4 * i],
        uy = p[1] - arcs[4 * i + 1],
        ul = Math.hypot(ux, uy);
      if (ul > 1e-6) {
        const c = (ux * dx + uy * dy) / ul;
        if (Math.abs(c) > 0.5) {
          dx = (Math.sign(c) * ux) / ul;
          dy = (Math.sign(c) * uy) / ul;
        }
      }
      DX[i] = dx;
      DY[i] = dy;
      Q[i] = [p[0] + s * dx, p[1] + s * dy];
    }
    const samePiece = (i: number, j: number) => {
      const ri = arcs[4 * i + 2],
        rj = arcs[4 * j + 2];
      if (ri > 0 || rj > 0)
        return (
          ri === rj &&
          arcs[4 * i] === arcs[4 * j] &&
          arcs[4 * i + 1] === arcs[4 * j + 1]
        );
      return DX[i] * DX[j] + DY[i] * DY[j] > 0.9994; // the same straight side, within 2 degrees
    };
    /** Where the moved sides at i and j meet: each is a line (a straight side) or a circle. */
    const meet = (i: number, j: number): Pt | null => {
      const curve = (k: number) =>
        arcs[4 * k + 2] > 0
          ? {
              c: [arcs[4 * k], arcs[4 * k + 1]] as Pt,
              r: dist(Q[k], [arcs[4 * k], arcs[4 * k + 1]]),
            }
          : { p: Q[k], t: [-DY[k], DX[k]] as Pt };
      const a: any = curve(i),
        b: any = curve(j),
        xs: Pt[] = [];
      const lineCircle = (p: Pt, t: Pt, c: Pt, r: number) => {
        const fx = p[0] - c[0],
          fy = p[1] - c[1],
          B = fx * t[0] + fy * t[1],
          Cq = fx * fx + fy * fy - r * r,
          D = B * B - Cq;
        if (D < 0) return;
        for (const u of [-B - Math.sqrt(D), -B + Math.sqrt(D)])
          xs.push([p[0] + u * t[0], p[1] + u * t[1]]);
      };
      if (a.t && b.t) {
        const den = a.t[0] * b.t[1] - a.t[1] * b.t[0];
        if (Math.abs(den) < 1e-9) return null;
        const u =
          ((b.p[0] - a.p[0]) * b.t[1] - (b.p[1] - a.p[1]) * b.t[0]) / den;
        xs.push([a.p[0] + u * a.t[0], a.p[1] + u * a.t[1]]);
      } else if (a.t) lineCircle(a.p, a.t, b.c, b.r);
      else if (b.t) lineCircle(b.p, b.t, a.c, a.r);
      else {
        const dx = b.c[0] - a.c[0],
          dy = b.c[1] - a.c[1],
          d = Math.hypot(dx, dy);
        if (d < 1e-9 || d > a.r + b.r || d < Math.abs(a.r - b.r)) return null;
        const m = (d * d + a.r * a.r - b.r * b.r) / (2 * d),
          h = Math.sqrt(Math.max(0, a.r * a.r - m * m));
        const mx = a.c[0] + (m * dx) / d,
          my = a.c[1] + (m * dy) / d;
        xs.push(
          [mx - (h * dy) / d, my + (h * dx) / d],
          [mx + (h * dy) / d, my - (h * dx) / d]
        );
      }
      let best: Pt | null = null,
        bd = Infinity;
      for (const x of xs) {
        const v = dist(x, Q[i]) + dist(x, Q[j]);
        if (v < bd) {
          bd = v;
          best = x;
        }
      }
      if (!best) return null;
      // the sides are carried on forward from i and back from j, by at most a few times the pull
      const ta = [
        pts[i][0] - pts[(i - 1 + N) % N][0],
        pts[i][1] - pts[(i - 1 + N) % N][1],
      ];
      const tb = [
        pts[(j + 1) % N][0] - pts[j][0],
        pts[(j + 1) % N][1] - pts[j][1],
      ];
      if ((best[0] - Q[i][0]) * ta[0] + (best[1] - Q[i][1]) * ta[1] < 0)
        return null;
      if ((Q[j][0] - best[0]) * tb[0] + (Q[j][1] - best[1]) * tb[1] < 0)
        return null;
      const lim = 4 * Math.max(S[i], S[j]) + 2 * ds;
      return dist(best, Q[i]) <= lim && dist(best, Q[j]) <= lim ? best : null;
    };
    // the moved points, with a corner (and points every ds up to it and on from it) between two pieces
    const P: Pt[] = [],
      src: number[] = [];
    for (let i = 0; i < N; i++) {
      P.push(Q[i]);
      src.push(i);
      const j = (i + 1) % N;
      if (kind[i] === 2 || kind[j] === 2 || samePiece(i, j)) continue;
      if (dist(Q[i], Q[j]) <= dist(pts[i], pts[j]) + 1e-6) continue; // the sides cross here (untie cuts it)
      const x = meet(i, j);
      if (!x) continue;
      for (const [a, b, last] of [
        [Q[i], x, true],
        [x, Q[j], false],
      ] as [Pt, Pt, boolean][]) {
        const m = Math.max(1, Math.round(dist(a, b) / ds));
        for (let t = 1; t < m + (last ? 1 : 0); t++) {
          P.push([
            a[0] + ((b[0] - a[0]) * t) / m,
            a[1] + ((b[1] - a[1]) * t) / m,
          ]);
          src.push(-1 - i);
        }
      }
    }
    const M = P.length,
      out: Pt[] = [],
      A = new Float64Array(4 * M),
      H = new Float64Array(M),
      K = new Uint8Array(M);
    for (let e = 0; e < M; e++) {
      const i = src[e] >= 0 ? src[e] : -1 - src[e],
        p = src[e] >= 0 ? pts[i] : P[e];
      H[e] = hw[i];
      K[e] = src[e] >= 0 ? kind[i] : 0;
      if (src[e] >= 0) A.set(arcs.subarray(4 * i, 4 * i + 4), 4 * e);
      else A.set([P[e][0], P[e][1], 0, 0], 4 * e);
      if (src[e] >= 0 && kind[i] === 2) {
        out.push(p);
        continue;
      }
      let q = P[e];
      A[4 * e + 3] = 0;
      if (A[4 * e + 2] > 0)
        A[4 * e + 2] = Math.hypot(q[0] - A[4 * e], q[1] - A[4 * e + 1]);
      // A bulge stays whole: a point pulled into the bulges stops on the edge of their union, at the
      // edge point nearest where the pull took it (as the thinner tube's side meets that bulge). A
      // point pulled across a bulge's core (a node's center, a line member's line) is taken back to
      // the side it came from (mirrored through the core) first. Where bulges overlap so that no
      // edge is near, it stops where its path first entered a bulge, which is on the union's edge.
      const o0 = pts[i];
      let cross = Infinity,
        ck = -1,
        deepest = 0,
        inside = -1;
      const near = bgrid.query(
        Math.min(o0[0], q[0]),
        Math.min(o0[1], q[1]),
        Math.max(o0[0], q[0]),
        Math.max(o0[1], q[1])
      );
      for (const k of near) {
        const d = primD(bulges[k], q[0], q[1], false);
        if (d < deepest) {
          deepest = d;
          inside = k;
        }
        const c = coreNear(bulges[k], q);
        if (
          !c ||
          (o0[0] - c[0]) * (q[0] - c[0]) + (o0[1] - c[1]) * (q[1] - c[1]) >= 0
        )
          continue;
        const t = entryInto(bulges[k], o0, q);
        if (t >= 0 && t < cross) {
          cross = t;
          ck = k;
        }
      }
      /** where the path first entered a bulge (on the union's edge) */
      const entry = () => {
        let first = Infinity,
          fk = -1;
        for (const k of near) {
          const t = entryInto(bulges[k], o0, q);
          if (t >= 0 && t < first) {
            first = t;
            fk = k;
          }
        }
        return fk < 0
          ? null
          : ontoBulge(bulges[fk], [
              o0[0] + first * (q[0] - o0[0]),
              o0[1] + first * (q[1] - o0[1]),
            ]);
      };
      if (ck >= 0 || inside >= 0) {
        let e2: { p: Pt; c: Pt; r: number };
        if (ck >= 0) {
          const c = coreNear(bulges[ck], q)!;
          e2 = ontoBulge(bulges[ck], [2 * c[0] - q[0], 2 * c[1] - q[1]]);
        } else e2 = ontoBulge(bulges[inside], q);
        for (let it = 0; it < 4; it++) {
          let dd = -1e-6,
            kk = -1;
          for (const k of bgrid.query(e2.p[0], e2.p[1], e2.p[0], e2.p[1])) {
            const d = primD(bulges[k], e2.p[0], e2.p[1], false);
            if (d < dd) {
              dd = d;
              kk = k;
            }
          }
          if (kk < 0) break;
          e2 = (it < 3 ? null : entry()) ?? ontoBulge(bulges[kk], e2.p);
        }
        // where a keep-out zone cuts the bulge, its edge is the zone's: the point stays where it was
        let cut = false;
        region.zoneGrid.each(e2.p[0], e2.p[1], e2.p[0], e2.p[1], (z) => {
          if (!cut && primD(region.zones[z], e2.p[0], e2.p[1], false) < -1e-6)
            cut = true;
        });
        if (cut) {
          out.push(p);
          if (src[e] >= 0) A.set(arcs.subarray(4 * i, 4 * i + 4), 4 * e);
          else A[4 * e + 2] = 0;
          continue;
        }
        q = e2.p;
        A[4 * e] = e2.c[0];
        A[4 * e + 1] = e2.c[1];
        A[4 * e + 2] = e2.r;
      }
      out.push(q);
    }
    // a knot spans at most a few times the largest pull along the outline; cutting knots can leave
    // a crossing just behind the scan, so it runs again until a pass cuts nothing
    let r: Loop = { pts: out, arcs: A, hw: H, kind: K };
    const w = Math.ceil((4 * pull * cap) / (dist(l.pts[0], l.pts[1]) || 1)) + 4;
    for (let pass = 0; pass < 8; pass++) {
      const n = r.pts.length;
      r = untie(r.pts, r.arcs, r.hw!, r.kind!, w);
      if (r.pts.length === n) break;
    }
    return r;
  });
};
/** Pulling points in by different amounts can make a short run of the outline cross itself (where
 *  the pull changes quickly: at a cusp between two bulges, or where two links meet): a small knot.
 *  Each knot, a crossing of two segments at most w points apart, is cut out at the crossing (and
 *  the scan goes on from the crossing, so a knot that cutting one makes ahead of it is cut too). */
const untie = (
  pts: Pt[],
  arcs: Float64Array,
  hw: Float64Array,
  kind: Uint8Array,
  w: number
): Loop => {
  const N = pts.length;
  if (N < 8) return { pts, arcs, hw, kind };
  const keep = new Uint8Array(N).fill(1),
    at = new Map<number, Pt>();
  const X = (p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null => {
    const d =
      (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (Math.abs(d) < 1e-12) return null;
    const t =
      ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) /
      d;
    const u =
      ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) /
      d;
    return t > 0 && t < 1 && u > 0 && u < 1
      ? [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]
      : null;
  };
  const W = Math.min(w, Math.floor(N / 3)),
    Q = pts.slice();
  for (let i = 0; i < N; i++) {
    if (!keep[i]) continue;
    const a = Q[i],
      b = Q[(i + 1) % N];
    // the farthest crossing within reach, so a knot inside a knot goes with it
    for (let k = W; k >= 2; k--) {
      const j = (i + k) % N;
      if (!keep[j]) continue;
      const c = Q[j],
        e = Q[(j + 1) % N];
      if (
        Math.max(c[0], e[0]) < Math.min(a[0], b[0]) ||
        Math.min(c[0], e[0]) > Math.max(a[0], b[0]) ||
        Math.max(c[1], e[1]) < Math.min(a[1], b[1]) ||
        Math.min(c[1], e[1]) > Math.max(a[1], b[1])
      )
        continue;
      const x = X(a, b, c, e);
      if (!x) continue;
      for (let t = 1; t <= k; t++) keep[(i + t) % N] = 0;
      keep[(i + 1) % N] = 1;
      at.set((i + 1) % N, x);
      Q[(i + 1) % N] = x;
      // the new segment from the crossing runs to the point after the knot
      for (let t = 2; t <= k; t++) Q[(i + t) % N] = x;
      break;
    }
  }
  if (!at.size) return { pts, arcs, hw, kind };
  const P: Pt[] = [],
    A: number[] = [],
    H: number[] = [],
    K: number[] = [];
  for (let i = 0; i < N; i++)
    if (keep[i]) {
      const x = at.get(i);
      P.push(x ?? pts[i]);
      A.push(
        arcs[4 * i],
        arcs[4 * i + 1],
        x ? 0 : arcs[4 * i + 2],
        arcs[4 * i + 3]
      );
      H.push(hw[i]);
      K.push(kind[i]);
    }
  return {
    pts: P,
    arcs: Float64Array.from(A),
    hw: Float64Array.from(H),
    kind: Uint8Array.from(K),
  };
};
type SmoothOpts = SkelOpts & {
  neck?: number;
  roundness?: number;
  holes?: boolean;
  res?: number;
};
/** `holes: false` (the default): every hole of the traced region is filled, by dropping its loop
 *  (and any piece inside it), and the keep-out zones it held are cut back out, so an avoided node
 *  inside the set is always exactly its clearance zone. A hole whose whole edge is keep-out zones
 *  is that already, and stays. The zones a hole held cannot reach past it (they would join it to
 *  the outside or to another hole), so they are traced on their own, as holes in a disc around
 *  them. Filling never joins or splits pieces. */
const fillHoles = (region: Region, zones: Prim[], res: number): Region => {
  const loops = region.loops;
  if (loops.length < 2) return region;
  const areas = loops.map((l) => signedArea2(l.pts));
  const outer = Math.sign(
    areas.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0)
  );
  const filled = loops.filter(
    (l, i) => Math.sign(areas[i]) !== outer && !l.kind!.every((k) => k === 1)
  );
  if (!filled.length) return region;
  const keep = loops.filter(
    (l) =>
      !filled.includes(l) &&
      !filled.some(
        (h) =>
          Math.abs(signedArea2(h.pts)) > Math.abs(signedArea2(l.pts)) &&
          inPolyFast(l.pts[0], h.pts)
      )
  );
  // the zones a filled hole held: its edge runs along them, or their center lies in it
  const centers: Pt[] = zones.map((z) =>
    z.k === 2 ? [(z.x1 + z.x2) / 2, (z.y1 + z.y2) / 2] : [z.x1, z.y1]
  );
  const held = zones.filter((z, j) =>
    filled.some(
      (h) =>
        inPolyFast(centers[j], h.pts) ||
        h.pts.some(
          (p, i) =>
            h.kind![i] === 1 && Math.abs(primD(z, p[0], p[1], false)) < 0.05
        )
    )
  );
  if (!held.length) return { ...region, loops: keep };
  const bb = held.reduce(
    (r, z) => [
      Math.min(r[0], z.bb[0]),
      Math.min(r[1], z.bb[1]),
      Math.max(r[2], z.bb[2]),
      Math.max(r[3], z.bb[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
  // (a disc around them, whose outline crosses the grid at no special place)
  const around = discPrim(
    (bb[0] + bb[2]) / 2,
    (bb[1] + bb[3]) / 2,
    Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2 + 2
  );
  const cut = traceRegion([around], held, res, Math.min(1, res));
  const disc = cut.loops.reduce((a, b) =>
    Math.abs(signedArea2(b.pts)) > Math.abs(signedArea2(a.pts)) ? b : a
  );
  // every point of these holes is on a zone's edge, also where two zones meet (a resampled point
  // there cuts the corner, so the trace alone would not call it a zone's)
  const zoneHoles = cut.loops
    .filter((l) => l !== disc)
    .map((l) => {
      const arcs = l.arcs.slice();
      for (let i = 3; i < arcs.length; i += 4) arcs[i] = 1;
      return { ...l, arcs, kind: new Uint8Array(l.pts.length).fill(1) };
    });
  return {
    ...region,
    loops: [...keep, ...zoneHoles],
    radii: [
      ...new Set([...region.radii, ...cut.radii.filter((r) => r !== around.r)]),
    ],
  };
};
/** Steps 2-3: the region traced exactly, then rounded along its outline. */
const smoothBlob = (members: Member[], o: SmoothOpts): Pt[][] => {
  const clearance = o.clearance ?? 4,
    res = o.res ?? 1,
    neck = o.neck ?? 1;
  // each member's bulge and each avoided node's keep-out zone, built once
  const bulges = members.map((m) => ({ ...grownPrim(m, o.pad), bulge: true }));
  const zones = (o.avoiding ?? []).map((m) => grownPrim(m, clearance));
  const sk = skeleton(members, o, zones);
  const region = (() => {
    // faces first: they cover the most area, so a place deep inside the region is settled soonest
    // Pieces that lie inside other pieces add nothing to the union, and only cost time, so they are
    // left out: a link inside a wider link on the same segment (a spanning-tree link along a face
    // edge), and a link between two filled triangles whose other sides are at least as wide. (A
    // point within h of that edge and outside both triangles leaves a triangle through another
    // side, within h of it, so that side's link holds it.) Every member's bulge stays, so the
    // outline knows which of its points lie on a bulge (step 3 never moves those).
    const pieces: Prim[] = sk.faces.map(triPrim);
    // points are numbered by their coordinates, and a segment by its two points' numbers
    const byX = new Map<number, Map<number, number>>(),
      pts: Pt[] = [];
    const pid = (p: Pt) => {
      let m = byX.get(p[0]);
      if (!m) byX.set(p[0], (m = new Map()));
      let i = m.get(p[1]);
      if (i === undefined) {
        m.set(p[1], (i = pts.length));
        pts.push(p);
      }
      return i;
    };
    const segKey = (a: Pt, b: Pt) => {
      const i = pid(a),
        j = pid(b);
      return i < j ? i * 1048576 + j : j * 1048576 + i;
    };
    // per straight segment, its widest half-width at each end: [at the end with the smaller
    // number, at the other]
    const widest = new Map<number, [number, number]>();
    for (const e of sk.links)
      if (!e.parts && e.route.length === 2) {
        const [a, b] = e.route,
          key = segKey(a, b),
          w = widest.get(key) ?? [0, 0];
        const [ra, rb] = pid(a) < pid(b) ? [e.h, e.h2] : [e.h2, e.h];
        widest.set(key, [Math.max(w[0], ra), Math.max(w[1], rb)]);
      }
    // A link of one width along an edge of two filled triangles lies inside them and their other
    // sides' links when those are at least as wide; a tapered link is always drawn.
    const width = (key: number) => {
      const w = widest.get(key);
      return w === undefined ? 0 : w[0] === w[1] ? w[0] : -1;
    };
    const sides = new Map<number, number>(); // per face edge: how many of its triangles have both other sides as wide
    for (const [a, b, c] of sk.faces)
      for (const [p, q, r] of [
        [a, b, c],
        [b, c, a],
        [c, a, b],
      ]) {
        const key = segKey(p, q),
          h = width(key);
        if (h < 0) continue;
        const wp = widest.get(segKey(p, r)),
          wq = widest.get(segKey(q, r));
        if (Math.min(...(wp ?? [0])) >= h && Math.min(...(wq ?? [0])) >= h)
          sides.set(key, (sides.get(key) ?? 0) + 1);
      }
    for (const e of sk.links)
      if (e.parts) {
        // a routed link tapers along its length from h to h2; an arc around an avoided node keeps
        // the larger of its two ends' half-widths
        const lens = e.parts.map((pt) =>
          "c" in pt ? Math.abs(pt.sweep) * pt.r : dist(pt.a, pt.b)
        );
        const total = lens.reduce((x, y) => x + y, 0) || 1;
        let at = 0;
        e.parts.forEach((pt, i) => {
          const r0 = e.h + ((e.h2 - e.h) * at) / total;
          at += lens[i];
          const r1 = e.h + ((e.h2 - e.h) * at) / total;
          pieces.push(
            "c" in pt
              ? arcPrim(pt.c, pt.r, pt.a0, pt.sweep, Math.max(r0, r1))
              : taperPrim(pt.a, pt.b, r0, r1)
          );
        });
      }
    pieces.push(...bulges);
    for (const [key, [ra, rb]] of widest)
      if (sides.get(key) !== 2)
        pieces.push(
          taperPrim(pts[Math.floor(key / 1048576)], pts[key % 1048576], ra, rb)
        );
    const traced = traceRegion(pieces, zones, res, Math.min(1, res));
    return o.holes ? traced : fillHoles(traced, zones, res);
  })();
  // Like rounding, pulling in never changes the topology: should two parts of the outline still
  // cross (where the half-width is misjudged at a sharp tip), the pull is halved near each
  // crossing (within two link widths of it) until none is left, and dropped there on the last
  // pass. Only the places that cross give way: the rest of the outline keeps the asked neck.
  const necked = (() => {
    const pull = 1 - neck;
    if (pull <= 0) return region.loops;
    const scale = region.loops.map((l) =>
      new Float64Array(l.pts.length).fill(1)
    );
    let cap = 0;
    for (const l of region.loops)
      for (let i = 0; i < l.pts.length; i++)
        if (l.kind![i] !== 2) cap = Math.max(cap, l.hw![i]);
    const reach = 2 * cap + 2;
    let out = neckOutline(region, bulges, pull, scale);
    for (let pass = 0; pass < 6; pass++) {
      const hits: Pt[] = [];
      if (
        !loopsCross(
          out.map((l) => l.pts),
          hits
        )
      )
        return out;
      const near = boxGrid(
        hits.map((h) => [
          h[0] - reach,
          h[1] - reach,
          h[0] + reach,
          h[1] + reach,
        ])
      );
      region.loops.forEach((l, li) =>
        l.pts.forEach((p, i) => {
          if (
            near
              .query(p[0], p[1], p[0], p[1])
              .some((k) => dist(p, hits[k]) <= reach)
          )
            scale[li][i] = pass < 5 ? scale[li][i] / 2 : 0;
        })
      );
      out = neckOutline(region, bulges, pull, scale);
    }
    return loopsCross(out.map((l) => l.pts)) ? region.loops : out;
  })();
  // `roundness` is the smoothing's reach: a Gaussian of width sigma = roundness / 2 along the
  // outline. It stops at the smallest circle in the region (a member's bulge, a link's
  // half-width, a box corner, a keep-out zone): rounding further would bend that circle.
  let thinnest = Infinity;
  for (const r of sk.R) thinnest = Math.min(thinnest, r);
  for (const e of sk.links)
    thinnest = Math.min(thinnest, neck * Math.min(e.h, e.h2));
  for (const r of region.radii) thinnest = Math.min(thinnest, r);
  const asked = Math.max(0, Math.min(o.roundness ?? o.pad, thinnest)) / 2;
  // Rounding never changes the topology: it moves each loop on its own, so pieces and holes stay
  // as traced unless two loops (or two parts of one) would cross; then sigma is narrowed until they do not.
  const roundAll = (s: number) => {
    const k = Math.max(s, res);
    return necked.map((l) => {
      const c =
        s > 0
          ? closeInlets(l.pts, l.arcs, 1.5 * s, region.zones, region.zoneGrid)
          : l;
      return keepOut(
        roundLoop(c.pts, c.arcs, s, k),
        region.zones,
        region.zoneGrid,
        k
      );
    });
  };
  let sigma = asked,
    loops = roundAll(sigma);
  if (sigma > 0 && loopsCross(loops)) {
    let lo = 0,
      hi = sigma,
      best: Pt[][] | undefined;
    for (let it = 0; it < 6; it++) {
      const mid = (lo + hi) / 2,
        tried = roundAll(mid);
      if (loopsCross(tried)) hi = mid;
      else {
        lo = mid;
        best = tried;
      }
    }
    sigma = lo;
    loops = best ?? roundAll(0);
  }
  return loops;
};

/** The options of {@link blobOutline}: `Shape.blob()`'s, plus the
 *  enclosure's `padding`. */
export type BlobOutlineOptions = {
  /** Pixels between each member and the outline. */
  padding: number;
  /** The share of the members' convex hull that is filled, 0 to 1. Default 0.5. */
  convexity?: number;
  /** Keep a hole left open inside the silhouette. Default false. */
  holes?: boolean;
  /** How far corners are rounded, in pixels. Default: `padding`. */
  roundness?: number;
  /** How far the outline is NOT pulled in between members, above 0 and at
   *  most 1. Default 1. */
  neck?: number;
  /** Nodes kept out of the region. */
  avoiding?: BlobMember[];
  /** Pixels kept between the outline and each avoided node. Default 4. */
  clearance?: number;
  /** Grid spacing of the exact trace, in pixels. Default 1. */
  res?: number;
};

/**
 * The outline of the blob around `members`: its closed loops, in the members'
 * frame. Outer loops and holes wind opposite ways, so they draw as one path
 * with the nonzero fill rule. No members, no outline.
 */
export function blobOutline(
  members: BlobMember[],
  opts: BlobOutlineOptions
): Pt[][] {
  if (members.length === 0) return [];
  return smoothBlob(members, {
    pad: opts.padding,
    convexity: opts.convexity ?? 0.5,
    holes: opts.holes,
    roundness: opts.roundness,
    neck: opts.neck,
    avoiding: opts.avoiding,
    clearance: opts.clearance,
    res: opts.res,
  });
}
