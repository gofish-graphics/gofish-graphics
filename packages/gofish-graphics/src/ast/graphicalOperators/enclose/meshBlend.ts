/**
 * PROTOTYPE (scratch, not for merge): the per-bay blend, what a blob's
 * convexity between 0 and 1 means, solved on a triangle mesh (an earlier
 * version on a 1 px grid is deleted). Every pocket of hull − spine fills
 * share c of its own area, by the level sets of a harmonic field:
 *
 *  - the pockets are the pieces of the padded hull less the spine (the exact
 *    closing at r = padding). The hull is the convex hull of the spine's own
 *    vertices (the closing's hull is the members' padded hull), so each hull
 *    vertex is a spine vertex and a pocket is read off the hull: a hull edge
 *    between two spine vertices that are not neighbors is a mouth, and the
 *    spine run behind it (walked backward from the mouth's end to the next
 *    mouth's start) is its wall. A spine hole (with `holes`) is a pocket
 *    with no mouth.
 *  - in a pocket with a mouth, u is harmonic, 0 on the spine and 1 on the
 *    mouth: P1 finite elements on a Delaunay triangulation of the pocket
 *    (boundary sampled finer where the wall nears the mouth, interior points
 *    from a quadtree graded by distance from the boundary), solved by
 *    conjugate gradients with an incomplete Cholesky preconditioner. On a
 *    Delaunay mesh the cotangent weights are nonnegative, so the discrete u
 *    keeps the maximum principle: no lake and no island at any level.
 *  - where the mouth is tangent to the wall (every mouth end) the pocket is a
 *    cusp of zero width; it is cut off where it is `delta` px wide, and u in
 *    the cusp is the share of the way across it (the limit of the harmonic u
 *    in a thin channel). The cut edge carries that linear u.
 *  - in a pocket with no mouth, u is the distance from its wall over the
 *    greatest such distance, exact at every mesh vertex.
 *  - each pocket fills share c of its own area: the area of {u <= l} is
 *    closed form per triangle (piecewise quadratic in l), summed into one
 *    piecewise quadratic per pocket, so the level for c is a lookup and a
 *    one-interval root.
 *  - the outline at c is exact for the P1 field: the level set is a
 *    straight segment per triangle, chained, run through the cusps to the
 *    mouth ends, and stitched to the spine runs on the hull between pockets.
 *  - with MESH_BLEND.refine (off by default), the area and the outline are
 *    read from a refined field instead: each triangle split in four at its
 *    edges' middles, the middle's value from a cubic along the edge (the
 *    ends' values and recovered gradients) clamped to the ends' range, so
 *    no middle is a new extremum and the no-lake property survives.
 */
import { Delaunay } from "d3-delaunay";
import type { Pt } from "./blob";
import { signedArea2, cross } from "../../geometry/plane";

/** PROTOTYPE: the mesh's knobs, px. delta: the cusp cut width; s0: the
 *  longest boundary step; beta: a boundary step's share of its distance to
 *  the other boundary (wall to mouth); alpha: how fast the interior's step
 *  grows away from the boundary; hMax: the longest interior step. */
export const MESH_BLEND = {
  delta: 0.02,
  s0: 2,
  sMin: 0.002,
  beta: 1,
  alpha: 0.3,
  hMax: 6,
  /** read the outline from the refined field (quadratic middles); false:
   *  from the P1 field itself. Off: it narrows the unsmoothed outline's
   *  error to the reference by 10 to 30% (0.31 to 0.27 px at worst) but not
   *  the smoothed one, and costs a third of the build and the call. */
  refine: false,
  /** CG stops at this relative residual */
  tol: 1e-7,
};

/** PROTOTYPE: the coarser mesh drawn while a slider is dragged (about a
 *  third of the vertices; see UNIFIED_PROTOTYPE.draft). */
export const MESH_DRAFT = {
  ...MESH_BLEND,
  s0: 4,
  beta: 2,
  alpha: 0.6,
  hMax: 12,
};

export const MESH_FAIL: { miss?: number[][]; spine?: Pt[][] } = {};

// ── spatial helpers ─────────────────────────────────────────────────────────

/** Segments bucketed on a grid, for nearest-distance queries. */
export class SegGrid {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  start: Int32Array;
  items: Int32Array;
  S: Float64Array;
  constructor(S: Float64Array, cell = 4) {
    this.S = S;
    const n = S.length / 4;
    let [xa, ya, xb, yb] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let s = 0; s < n; s++)
      for (const k of [0, 2]) {
        xa = Math.min(xa, S[4 * s + k]);
        xb = Math.max(xb, S[4 * s + k]);
        ya = Math.min(ya, S[4 * s + k + 1]);
        yb = Math.max(yb, S[4 * s + k + 1]);
      }
    if (!n) [xa, ya, xb, yb] = [0, 0, 1, 1];
    this.cell = cell;
    this.x0 = xa - cell;
    this.y0 = ya - cell;
    this.nx = Math.ceil((xb - this.x0) / cell) + 2;
    this.ny = Math.ceil((yb - this.y0) / cell) + 2;
    const count = new Int32Array(this.nx * this.ny + 1);
    const each = (s: number, f: (c: number) => void) => {
      const i0 = Math.floor(
          (Math.min(S[4 * s], S[4 * s + 2]) - this.x0) / cell
        ),
        i1 = Math.floor((Math.max(S[4 * s], S[4 * s + 2]) - this.x0) / cell),
        j0 = Math.floor(
          (Math.min(S[4 * s + 1], S[4 * s + 3]) - this.y0) / cell
        ),
        j1 = Math.floor(
          (Math.max(S[4 * s + 1], S[4 * s + 3]) - this.y0) / cell
        );
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) f(j * this.nx + i);
    };
    for (let s = 0; s < n; s++) each(s, (c) => count[c + 1]++);
    for (let c = 0; c < this.nx * this.ny; c++) count[c + 1] += count[c];
    this.start = count;
    this.items = new Int32Array(count[this.nx * this.ny]);
    const fill = count.slice();
    for (let s = 0; s < n; s++) each(s, (c) => (this.items[fill[c]++] = s));
  }
  /** The distance from (x, y) to the nearest segment, and which one. */
  nearest(x: number, y: number): [number, number] {
    const { x0, y0, cell, nx, ny, start, items, S } = this;
    const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell))),
      cj = Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / cell)));
    // how far (x, y) is outside the grid, so the ring bound stays safe
    const off = Math.max(
      0,
      x0 - x,
      x - (x0 + nx * cell),
      y0 - y,
      y - (y0 + ny * cell)
    );
    let best = Infinity,
      bs = -1;
    const R = Math.max(nx, ny);
    for (let k = 0; k <= R; k++) {
      for (let j = cj - k; j <= cj + k; j++) {
        if (j < 0 || j >= ny) continue;
        const edge = j === cj - k || j === cj + k;
        for (let i = ci - k; i <= ci + k; i += edge ? 1 : 2 * k || 1) {
          if (i < 0 || i >= nx) continue;
          const c = j * nx + i;
          for (let q = start[c]; q < start[c + 1]; q++) {
            const s = items[q];
            const ax = S[4 * s],
              ay = S[4 * s + 1],
              ex = S[4 * s + 2] - ax,
              ey = S[4 * s + 3] - ay;
            const L = ex * ex + ey * ey;
            let t = L > 0 ? ((x - ax) * ex + (y - ay) * ey) / L : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = x - ax - t * ex,
              dy = y - ay - t * ey;
            const d = dx * dx + dy * dy;
            if (d < best) [best, bs] = [d, s];
          }
        }
      }
      if (bs >= 0 && Math.sqrt(best) <= k * cell - off) break;
    }
    return [Math.sqrt(best), bs];
  }
}

/** Segments of rings as the flat array SegGrid takes. */
export const segsOf = (rings: Pt[][]): Float64Array => {
  let n = 0;
  for (const r of rings) n += r.length;
  const S = new Float64Array(4 * n);
  let k = 0;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      S[k++] = a[0];
      S[k++] = a[1];
      S[k++] = b[0];
      S[k++] = b[1];
    }
  return S;
};

/** Nonzero winding of a point over rings, by edges bucketed into rows. */
export class Inside {
  y0: number;
  h: number;
  rows: number[][];
  S: Float64Array;
  constructor(S: Float64Array, h = 2) {
    this.S = S;
    const n = S.length / 4;
    let ya = Infinity,
      yb = -Infinity;
    for (let s = 0; s < n; s++) {
      ya = Math.min(ya, S[4 * s + 1], S[4 * s + 3]);
      yb = Math.max(yb, S[4 * s + 1], S[4 * s + 3]);
    }
    if (!n) [ya, yb] = [0, 1];
    this.y0 = ya;
    this.h = h;
    this.rows = Array.from(
      { length: Math.ceil((yb - ya) / h) + 1 },
      () => [] as number[]
    );
    for (let s = 0; s < n; s++) {
      const lo = Math.min(S[4 * s + 1], S[4 * s + 3]),
        hi = Math.max(S[4 * s + 1], S[4 * s + 3]);
      for (
        let j = Math.floor((lo - ya) / h);
        j <= Math.floor((hi - ya) / h);
        j++
      )
        this.rows[j].push(s);
    }
  }
  has(x: number, y: number): boolean {
    const j = Math.floor((y - this.y0) / this.h);
    if (j < 0 || j >= this.rows.length) return false;
    const S = this.S;
    let w = 0;
    for (const s of this.rows[j]) {
      const ay = S[4 * s + 1],
        by = S[4 * s + 3];
      if (ay <= y !== by <= y) {
        const ax = S[4 * s],
          bx = S[4 * s + 2];
        if (ax + ((y - ay) * (bx - ax)) / (by - ay) > x) w += by > ay ? 1 : -1;
      }
    }
    return w !== 0;
  }
}

/** Edges bucketed by rows, for the nonzero winding number of a point. */
class Rows {
  y0: number;
  h: number;
  ny: number;
  lists: number[][];
  E: Float64Array;
  constructor(E: Float64Array, h = 2) {
    this.E = E;
    const n = E.length / 4;
    let ya = Infinity,
      yb = -Infinity;
    for (let s = 0; s < n; s++) {
      ya = Math.min(ya, E[4 * s + 1], E[4 * s + 3]);
      yb = Math.max(yb, E[4 * s + 1], E[4 * s + 3]);
    }
    if (!n) [ya, yb] = [0, 1];
    this.y0 = ya - h;
    this.h = h;
    this.ny = Math.ceil((yb - this.y0) / h) + 2;
    this.lists = Array.from({ length: this.ny }, () => []);
    for (let s = 0; s < n; s++) {
      const lo = Math.min(E[4 * s + 1], E[4 * s + 3]),
        hi = Math.max(E[4 * s + 1], E[4 * s + 3]);
      for (
        let j = Math.floor((lo - this.y0) / h);
        j <= Math.floor((hi - this.y0) / h);
        j++
      )
        this.lists[j].push(s);
    }
  }
  winding(x: number, y: number): number {
    const j = Math.floor((y - this.y0) / this.h);
    if (j < 0 || j >= this.ny) return 0;
    const E = this.E;
    let w = 0;
    for (const s of this.lists[j]) {
      const ax = E[4 * s],
        ay = E[4 * s + 1],
        bx = E[4 * s + 2],
        by = E[4 * s + 3];
      if (ay <= y !== by <= y) {
        const xc = ax + ((y - ay) * (bx - ax)) / (by - ay);
        if (xc > x) w += by > ay ? 1 : -1;
      }
    }
    return w;
  }
}

// ── the pockets ─────────────────────────────────────────────────────────────

/** A vertex of the spine: its ring and index. */
type RV = { r: number; i: number };

type Mouth = { a: RV; b: RV; A: Pt; B: Pt; kept: boolean; hullAt: number };

/** A mouth end, cut where the cusp is delta wide: the cusp's wall points
 *  from the corner to the cut (c*), and each one's foot on the mouth. */
type Corner = { mouth: number; end: "a" | "b"; wall: Pt[]; feet: Pt[] };

/** A boundary loop of a pocket, the pocket on its left: its points, the
 *  fixed value of u at each (NaN: none, an interior), and each edge's kind
 *  (0 wall, 1 mouth, 2 cut: not subdivided). */
type Loop = {
  pocket: number;
  pts: Pt[];
  val: number[];
  kind: number[];
  /** for a cut edge (kind 2), its corner */
  corner: number[];
};

type Pocket = {
  mouths: number[];
  hole: boolean;
  /** the area cut off as cusps (filled at the rate ℓ) */
  cuspArea: number;
  // the area of {u ≤ ℓ}: breakpoints and the quadratic after each
  xs?: Float64Array;
  q2?: Float64Array;
  q1?: Float64Array;
  q0?: Float64Array;
  At?: Float64Array;
  area: number;
};

export type MeshBlend = {
  spine: Pt[][];
  hull: Pt[];
  mouths: Mouth[];
  corners: Corner[];
  /** each corner's pocket */
  cornerPocket: number[];
  pockets: Pocket[];
  /** the solved P1 mesh: vertex positions and u, the pocket triangles (3
   *  vertex ids each) and their pocket */
  X: Float64Array;
  Y: Float64Array;
  U: Float64Array;
  tri: Int32Array;
  triPocket: Int32Array;
  /** the refined mesh the outline and areas are read from (each triangle
   *  in four, u linear on each): vertices, triangles, their pocket, each
   *  triangle edge's id (shared by the two triangles on it) and, for a cut
   *  edge's id, its corner */
  RX: Float64Array;
  RY: Float64Array;
  RU: Float64Array;
  rtri: Int32Array;
  rtriPocket: Int32Array;
  redge: Int32Array;
  nREdge: number;
  cutCorner: Map<number, number>;
  stats: {
    vertices: number;
    unknowns: number;
    triangles: number;
    pockets: number;
    rounds: number;
    cg: number;
    msMesh: number;
    msSolve: number;
    ms: number;
    [phase: string]: number;
  };
};

const key = (r: number, i: number) => r * 1_000_003 + i;

/** The convex hull of the outer rings' vertices, winding positive, as ring
 *  vertices; collinear points dropped. */
function hullOf(rings: Pt[][]): RV[] {
  const P: RV[] = [];
  rings.forEach((r, ri) => r.forEach((_, i) => P.push({ r: ri, i })));
  const at = (v: RV) => rings[v.r][v.i];
  P.sort((p, q) => at(p)[0] - at(q)[0] || at(p)[1] - at(q)[1]);
  const half = (pts: RV[]) => {
    const h: RV[] = [];
    for (const p of pts) {
      while (
        h.length >= 2 &&
        cross(at(h[h.length - 2]), at(h[h.length - 1]), at(p)) <= 0
      )
        h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(P), ...half(P.slice().reverse())];
}

/** Distance from p to the line A→B, positive on its left (the pocket). */
const gapTo = (A: Pt, B: Pt, p: Pt) =>
  cross(A, B, p) / Math.hypot(B[0] - A[0], B[1] - A[1]);
const footOn = (A: Pt, B: Pt, p: Pt): Pt => {
  const ex = B[0] - A[0],
    ey = B[1] - A[1];
  const t = ((p[0] - A[0]) * ex + (p[1] - A[1]) * ey) / (ex * ex + ey * ey);
  return [A[0] + t * ex, A[1] + t * ey];
};

/**
 * The blend's field on a mesh, for the spine rings (outer rings winding
 * positive; holes, with `holes`, the other way).
 */
export function buildMeshBlend(
  spine: Pt[][],
  knobs: typeof MESH_BLEND = MESH_BLEND
): MeshBlend {
  const t0 = performance.now();
  MESH_FAIL.spine = spine;
  const PH: Record<string, number> = {};
  let tl = t0;
  const lap = (k: string) => {
    const t = performance.now();
    PH[k] = t - tl;
    tl = t;
  };
  const { delta, s0, sMin, beta, alpha, hMax } = knobs;
  // drop points within 0.01 px of the next (arc joins can repeat a point
  // to within rounding, or step back by a few thousandths of a px: a
  // near-zero edge or a zig-zag that crosses itself defeats the Delaunay's
  // edge recovery, which can never recover two crossing edges), and split
  // outer rings from holes
  const clean = spine
    .map((r) =>
      r.filter((p, i) => {
        const q = r[(i + 1) % r.length];
        return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01;
      })
    )
    .filter((r) => r.length >= 3);
  const outer = clean.filter((r) => signedArea2(r) > 0);
  const holeRings = clean.filter((r) => signedArea2(r) < 0);
  const at = (v: RV) => outer[v.r][v.i];
  const H = hullOf(outer);
  const hull = H.map(at);
  // mouths: hull edges between ring vertices that are not neighbors
  const mouths: Mouth[] = [];
  const aOf = new Map<number, number>();
  const touched = new Set<number>();
  for (let k = 0; k < H.length; k++) {
    const a = H[k],
      b = H[(k + 1) % H.length];
    touched.add(a.r);
    if (a.r === b.r && b.i === (a.i + 1) % outer[a.r].length) continue;
    aOf.set(key(a.r, a.i), mouths.length);
    mouths.push({ a, b, A: at(a), B: at(b), kept: true, hullAt: k });
  }
  // pockets: from a mouth's end, back along its ring to the next mouth's
  // start, until the first mouth again
  type Chain = number[]; // ring indices, on ring `r`
  const pocketsRaw: {
    mouths: number[];
    chains: { r: number; idx: Chain }[];
  }[] = [];
  const seen = new Uint8Array(mouths.length);
  for (let m0 = 0; m0 < mouths.length; m0++) {
    if (seen[m0]) continue;
    const ms: number[] = [],
      chains: { r: number; idx: Chain }[] = [];
    let m = m0;
    for (let guard = 0; ; guard++) {
      if (guard > mouths.length) throw new Error("meshBlend: pocket walk");
      seen[m] = 1;
      ms.push(m);
      const { r, i } = mouths[m].b;
      const n = outer[r].length;
      const idx = [i];
      let j = i;
      let next = -1;
      for (let s = 0; s <= n; s++) {
        j = (j - 1 + n) % n;
        idx.push(j);
        const q = aOf.get(key(r, j));
        if (q !== undefined) {
          next = q;
          break;
        }
      }
      if (next < 0) throw new Error("meshBlend: no next mouth");
      chains.push({ r, idx });
      if (next === m0) break;
      m = next;
    }
    pocketsRaw.push({ mouths: ms, chains });
  }
  // a single-mouth pocket shallower than 4 delta stays spine
  for (const P of pocketsRaw) {
    if (P.mouths.length !== 1) continue;
    const M = mouths[P.mouths[0]];
    let g = 0;
    for (const i of P.chains[0].idx)
      g = Math.max(g, gapTo(M.A, M.B, outer[P.chains[0].r][i]));
    if (g < 4 * delta) M.kept = false;
  }
  // the loops of every kept pocket, with their cusps cut
  const corners: Corner[] = [];
  const pockets: Pocket[] = [];
  const loops: Loop[] = [];
  const cutAt = (
    M: Mouth,
    pts: Pt[]
  ): { k: number; wall: Pt[]; feet: Pt[]; area: number } => {
    // the first point at least delta from the mouth's line, the cut between
    // it and the one before
    let k = 1;
    while (k < pts.length && gapTo(M.A, M.B, pts[k]) < delta) k++;
    if (k >= pts.length) throw new Error("meshBlend: cusp never opens");
    const g0 = gapTo(M.A, M.B, pts[k - 1]),
      g1 = gapTo(M.A, M.B, pts[k]);
    const t = (delta - g0) / (g1 - g0);
    const c: Pt = [
      pts[k - 1][0] + t * (pts[k][0] - pts[k - 1][0]),
      pts[k - 1][1] + t * (pts[k][1] - pts[k - 1][1]),
    ];
    const wall = [...pts.slice(0, k), c];
    const feet = wall.map((p) => footOn(M.A, M.B, p));
    // the cusp's area: wall out to the cut, back along the mouth
    const area =
      Math.abs(signedArea2([...wall, ...feet.slice().reverse()])) / 2;
    return { k, wall, feet, area };
  };
  for (const P of pocketsRaw) {
    if (P.mouths.length === 1 && !mouths[P.mouths[0]].kept) continue;
    const pid = pockets.length;
    const pocket: Pocket = {
      mouths: P.mouths,
      hole: false,
      cuspArea: 0,
      area: 0,
    };
    pockets.push(pocket);
    const L: Loop = { pocket: pid, pts: [], val: [], kind: [], corner: [] };
    // per chain: its cut at the start (the b end of mouth k) and at the end
    // (the a end of mouth k + 1)
    const nM = P.mouths.length;
    const cuts = P.chains.map((ch, k) => {
      const pts = ch.idx.map((i) => outer[ch.r][i]);
      const Mb = mouths[P.mouths[k]],
        Ma = mouths[P.mouths[(k + 1) % nM]];
      const s = cutAt(Mb, pts);
      const e = cutAt(Ma, pts.slice().reverse());
      if (s.k > pts.length - 1 - e.k + 1)
        throw new Error("meshBlend: cusp cuts cross");
      pocket.cuspArea += s.area + e.area;
      const cb = corners.length;
      corners.push({
        mouth: P.mouths[k],
        end: "b",
        wall: s.wall,
        feet: s.feet,
      });
      corners.push({
        mouth: P.mouths[(k + 1) % nM],
        end: "a",
        wall: e.wall,
        feet: e.feet,
      });
      return { pts, s, e, cb, ca: cb + 1 };
    });
    // the loop: mouth k from its a cut to its b cut, the cut edge in, the
    // wall back to the next mouth's a cut, the cut edge out
    for (let k = 0; k < nM; k++) {
      const prev = cuts[(k - 1 + nM) % nM],
        cur = cuts[k];
      const push = (p: Pt, v: number, kind: number, corner = -1) => {
        L.pts.push(p);
        L.val.push(v);
        L.kind.push(kind);
        L.corner.push(corner);
      };
      // a cut's foot on mouth k (from the previous chain's end), then the
      // mouth to the b cut's foot
      push(prev.e.feet.at(-1)!, 1, 1);
      push(cur.s.feet.at(-1)!, 1, 2, cur.cb); // cut edge to the wall
      push(cur.s.wall.at(-1)!, 0, 0);
      for (let q = cur.s.k; q <= cur.pts.length - 1 - cur.e.k; q++)
        push(cur.pts[q], 0, 0);
      // the wall's last point before the a cut, then the cut edge out
      push(cur.e.wall.at(-1)!, 0, 2, cur.ca);
    }
    loops.push(L);
  }
  // spine rings off the hull sit inside a pocket, as walls; holes are
  // pockets with no mouth
  for (let r = 0; r < outer.length; r++) {
    if (touched.has(r)) continue;
    const p = outer[r][0];
    const owner = loops.findIndex(
      (L) => !pockets[L.pocket].hole && windingOf([L.pts], p) !== 0
    );
    if (owner < 0) continue;
    const pts = outer[r].slice().reverse();
    loops.push({
      pocket: loops[owner].pocket,
      pts,
      val: pts.map(() => 0),
      kind: pts.map(() => 0),
      corner: pts.map(() => -1),
    });
  }
  for (const h of holeRings) {
    const pid = pockets.length;
    pockets.push({ mouths: [], hole: true, cuspArea: 0, area: 0 });
    const pts = h.slice().reverse();
    loops.push({
      pocket: pid,
      pts,
      val: pts.map(() => 0),
      kind: pts.map(() => 0),
      corner: pts.map(() => -1),
    });
  }

  lap("pockets");
  // ── the boundary, sampled ─────────────────────────────────────────────────
  const segsOfKind = (kind: number) => {
    const out: number[] = [];
    for (const L of loops)
      for (let i = 0; i < L.pts.length; i++)
        if (L.kind[i] === kind) {
          const a = L.pts[i],
            b = L.pts[(i + 1) % L.pts.length];
          out.push(a[0], a[1], b[0], b[1]);
        }
    return new SegGrid(Float64Array.from(out));
  };
  const hasMouth = mouths.some((m) => m.kept);
  const wallIdx = segsOfKind(0),
    mouthIdx = segsOfKind(1);
  /** the boundary step at a point of a wall (kind 0) or mouth (kind 1): a
   *  share of its distance to the other kind, at most s0 */
  const stepAt = (x: number, y: number, kind: number) => {
    if (!hasMouth) return s0;
    const d = (kind === 0 ? mouthIdx : wallIdx).nearest(x, y)[0];
    return Math.max(sMin, Math.min(s0, beta * d));
  };
  const BX: number[] = [],
    BY: number[] = [],
    BV: number[] = [];
  /** per loop: its vertex ids, each edge's kind and (cut edges) corner */
  const bl: {
    pocket: number;
    v: number[];
    kind: number[];
    corner: number[];
  }[] = [];
  for (const L of loops) {
    const out = {
      pocket: L.pocket,
      v: [] as number[],
      kind: [] as number[],
      corner: [] as number[],
    };
    const add = (x: number, y: number, v: number, kind: number, c: number) => {
      BX.push(x);
      BY.push(y);
      BV.push(v);
      out.v.push(BX.length - 1);
      out.kind.push(kind);
      out.corner.push(c);
    };
    const n = L.pts.length;
    for (let i = 0; i < n; i++) {
      const a = L.pts[i],
        b = L.pts[(i + 1) % n];
      const kind = L.kind[i];
      add(a[0], a[1], L.val[i], kind, L.corner[i]);
      if (kind === 2) continue;
      // march along the edge, one step (at the current point) at a time
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let t = 0;
      for (let guard = 0; guard < 100000; guard++) {
        const x = a[0] + t * (b[0] - a[0]),
          y = a[1] + t * (b[1] - a[1]);
        const s = stepAt(x, y, kind);
        if (len * (1 - t) <= 1.2 * s) break;
        t += s / len;
        add(
          a[0] + t * (b[0] - a[0]),
          a[1] + t * (b[1] - a[1]),
          kind === 1 ? 1 : 0,
          kind,
          -1
        );
      }
    }
    bl.push(out);
  }
  const nB0 = BX.length;

  lap("boundary");
  // ── interior points: a quadtree graded by distance from the boundary ──────
  const allSegs: number[] = [];
  for (const L of bl)
    for (let i = 0; i < L.v.length; i++) {
      const a = L.v[i],
        b = L.v[(i + 1) % L.v.length];
      allSegs.push(BX[a], BY[a], BX[b], BY[b]);
    }
  const AS = Float64Array.from(allSegs);
  const bIdx = new SegGrid(AS);
  const rows = new Rows(AS);
  const IX: number[] = [],
    IY: number[] = [];
  if (nB0) {
    let [xa, ya, xb, yb] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let v = 0; v < nB0; v++) {
      xa = Math.min(xa, BX[v]);
      xb = Math.max(xb, BX[v]);
      ya = Math.min(ya, BY[v]);
      yb = Math.max(yb, BY[v]);
    }
    const side = Math.max(xb - xa, yb - ya);
    const visit = (cx: number, cy: number, L: number) => {
      const [d] = bIdx.nearest(cx, cy);
      const half = L * Math.SQRT1_2;
      if (d > half && rows.winding(cx, cy) === 0) return; // wholly outside
      const h = Math.min(hMax, s0 + alpha * Math.max(0, d - half));
      if (L > h && L > sMin) {
        const q = L / 4;
        visit(cx - q, cy - q, L / 2);
        visit(cx + q, cy - q, L / 2);
        visit(cx - q, cy + q, L / 2);
        visit(cx + q, cy + q, L / 2);
        return;
      }
      if (d >= 0.5 * L && rows.winding(cx, cy) !== 0) {
        IX.push(cx);
        IY.push(cy);
      }
    };
    visit((xa + xb) / 2, (ya + yb) / 2, side * 1.0001);
  }

  lap("quadtree");
  // ── Delaunay, splitting boundary edges it misses ──────────────────────────
  const tm = performance.now();
  // the free points, bucketed, for dropping those that block a boundary edge
  const PB = 4;
  let pbx0 = Infinity,
    pby0 = Infinity;
  for (let k = 0; k < IX.length; k++) {
    pbx0 = Math.min(pbx0, IX[k] - PB);
    pby0 = Math.min(pby0, IY[k] - PB);
  }
  if (!IX.length) pbx0 = pby0 = 0;
  const pBuckets = new Map<number, number[]>();
  const pKey = (x: number, y: number) =>
    Math.floor((x - pbx0) / PB) * 100003 + Math.floor((y - pby0) / PB);
  IX.forEach((x, k) => {
    const kk = pKey(x, IY[k]);
    const l = pBuckets.get(kk);
    if (l) l.push(k);
    else pBuckets.set(kk, [k]);
  });
  const alive = new Uint8Array(IX.length).fill(1);
  let rounds = 0;
  let T!: Uint32Array, HE!: Int32Array;
  let X!: Float64Array, Y!: Float64Array;
  // each boundary vertex's next along its loop, and that edge's loop and
  // position (every boundary vertex is on exactly one loop, once)
  let nxt = new Int32Array(0),
    pos = new Int32Array(0);
  let nV = 0;
  const nextHe = (e: number) => (e % 3 === 2 ? e - 2 : e + 1);
  for (; rounds < 40; rounds++) {
    const nB = BX.length;
    let nI = 0;
    for (let k = 0; k < IX.length; k++) nI += alive[k];
    nV = nB + nI;
    X = new Float64Array(nV);
    Y = new Float64Array(nV);
    const coords = new Float64Array(2 * nV);
    for (let v = 0; v < nB; v++) {
      X[v] = coords[2 * v] = BX[v];
      Y[v] = coords[2 * v + 1] = BY[v];
    }
    for (let k = 0, q = nB; k < IX.length; k++)
      if (alive[k]) {
        X[q] = coords[2 * q] = IX[k];
        Y[q] = coords[2 * q + 1] = IY[k];
        q++;
      }
    const D = new Delaunay(coords);
    T = D.triangles;
    HE = D.halfedges;
    nxt = new Int32Array(nB);
    pos = new Int32Array(nB);
    bl.forEach((L, li) => {
      for (let i = 0; i < L.v.length; i++) {
        nxt[L.v[i]] = L.v[(i + 1) % L.v.length];
        pos[L.v[i]] = li * 1_000_000 + i;
      }
    });
    const found = new Uint8Array(nB);
    let nFound = 0;
    for (let e = 0; e < T.length; e++) {
      const a = T[e],
        b = T[nextHe(e)];
      if (a >= nB || b >= nB) continue;
      const s0 = nxt[a] === b ? a : nxt[b] === a ? b : -1;
      if (s0 >= 0 && !found[s0]) {
        found[s0] = 1;
        nFound++;
      }
    }
    if (nFound === nB) break;
    for (const L of bl) {
      const nv: number[] = [],
        nk: number[] = [],
        nc: number[] = [];
      for (let i = 0; i < L.v.length; i++) {
        const a = L.v[i],
          b = L.v[(i + 1) % L.v.length];
        nv.push(a);
        nk.push(L.kind[i]);
        nc.push(L.corner[i]);
        if (found[a]) continue;
        const mx = (BX[a] + BX[b]) / 2,
          my = (BY[a] + BY[b]) / 2;
        const r2 = ((BX[b] - BX[a]) ** 2 + (BY[b] - BY[a]) ** 2) / 4;
        const r = Math.sqrt(r2);
        // free points in the edge's diametral circle go
        for (
          let gx = Math.floor((mx - r - pbx0) / PB);
          gx <= Math.floor((mx + r - pbx0) / PB);
          gx++
        )
          for (
            let gy = Math.floor((my - r - pby0) / PB);
            gy <= Math.floor((my + r - pby0) / PB);
            gy++
          )
            for (const k of pBuckets.get(gx * 100003 + gy) ?? [])
              if ((IX[k] - mx) ** 2 + (IY[k] - my) ** 2 < 1.0001 * r2)
                alive[k] = 0;
        BX.push(mx);
        BY.push(my);
        BV.push((BV[a] + BV[b]) / 2);
        nv.push(BX.length - 1);
        nk.push(L.kind[i]);
        nc.push(L.corner[i]);
      }
      L.v = nv;
      L.kind = nk;
      L.corner = nc;
    }
  }
  if (rounds === 40) {
    // SCRATCH diagnostics: the edges still missing
    const nB = BX.length;
    const miss: number[][] = [];
    const found = new Uint8Array(nB);
    for (let e = 0; e < T.length; e++) {
      const a = T[e],
        b = T[nextHe(e)];
      if (a >= nB || b >= nB) continue;
      if (nxt[a] === b) found[a] = 1;
      if (nxt[b] === a) found[b] = 1;
    }
    for (let a = 0; a < nB; a++)
      if (!found[a]) miss.push([BX[a], BY[a], BX[nxt[a]], BY[nxt[a]], pos[a]]);
    (MESH_FAIL as any).miss = miss;
    throw new Error("meshBlend: boundary edges not recovered");
  }
  const nB = BX.length;
  const nT = T.length / 3;
  // boundary halfedges; the triangles on a boundary edge's left (its loop's
  // pocket side) seed a flood that stops at boundary edges
  const isBHe = new Uint8Array(T.length);
  const tP = new Int32Array(nT).fill(-1);
  const isB = new Uint8Array(nV);
  for (let v = 0; v < nB; v++) isB[v] = 1;
  const cutHe: [number, number][] = [];
  const stack: number[] = [];
  for (let e = 0; e < T.length; e++) {
    const a = T[e],
      b = T[nextHe(e)];
    if (a >= nB || b >= nB) continue;
    let p: number, q: number;
    if (nxt[a] === b) [p, q] = [a, b];
    else if (nxt[b] === a) [p, q] = [b, a];
    else continue;
    isBHe[e] = 1;
    const k = pos[p];
    const L = bl[Math.floor(k / 1_000_000)];
    const i = k % 1_000_000;
    if (L.kind[i] === 2) cutHe.push([e, L.corner[i]]);
    const c = T[nextHe(nextHe(e))];
    const t = (e / 3) | 0;
    if (
      tP[t] < 0 &&
      (X[q] - X[p]) * (Y[c] - Y[p]) - (Y[q] - Y[p]) * (X[c] - X[p]) > 0
    ) {
      tP[t] = L.pocket;
      stack.push(t);
    }
  }
  while (stack.length) {
    const t = stack.pop()!;
    for (let q = 0; q < 3; q++) {
      const e = 3 * t + q;
      const o = HE[e];
      if (o < 0 || isBHe[e]) continue;
      const u = (o / 3) | 0;
      if (tP[u] >= 0) continue;
      tP[u] = tP[t];
      stack.push(u);
    }
  }
  let nIn = 0;
  for (let t = 0; t < nT; t++) if (tP[t] >= 0) nIn++;
  const tri = new Int32Array(3 * nIn),
    triPocket = new Int32Array(nIn),
    triOf = new Int32Array(nT).fill(-1);
  for (let t = 0, w = 0; t < nT; t++) {
    if (tP[t] < 0) continue;
    tri[3 * w] = T[3 * t];
    tri[3 * w + 1] = T[3 * t + 1];
    tri[3 * w + 2] = T[3 * t + 2];
    triPocket[w] = tP[t];
    triOf[t] = w++;
  }
  // each triangle edge's id: one per unique edge (the lower halfedge)
  const edgeId = new Int32Array(3 * nIn);
  for (let t = 0; t < nT; t++) {
    const w = triOf[t];
    if (w < 0) continue;
    for (let q = 0; q < 3; q++) {
      const e = 3 * t + q;
      edgeId[3 * w + q] = HE[e] >= 0 ? Math.min(e, HE[e]) : e;
    }
  }
  const nEdgeIds = T.length;
  const msMesh = performance.now() - tm;

  lap("delaunay");
  // ── u: holes by distance, pockets by P1 FEM ───────────────────────────────
  const ts = performance.now();
  const U = new Float64Array(nV);
  for (let v = 0; v < nB; v++) U[v] = BV[v];
  const vP = new Int32Array(nV).fill(-1);
  for (let t = 0; t < nIn; t++)
    for (let q = 0; q < 3; q++) vP[tri[3 * t + q]] = triPocket[t];
  // holes: distance from the wall over the most
  const holeWall = new Map<number, SegGrid>();
  for (const L of bl) {
    if (!pockets[L.pocket].hole) continue;
    const s: number[] = [];
    for (let i = 0; i < L.v.length; i++) {
      const a = L.v[i],
        b = L.v[(i + 1) % L.v.length];
      s.push(X[a], Y[a], X[b], Y[b]);
    }
    holeWall.set(L.pocket, new SegGrid(Float64Array.from(s)));
  }
  const most = new Float64Array(pockets.length);
  for (let v = 0; v < nV; v++) {
    const p = vP[v];
    if (p < 0 || !pockets[p].hole) continue;
    U[v] = isB[v] ? 0 : holeWall.get(p)!.nearest(X[v], Y[v])[0];
    most[p] = Math.max(most[p], U[v]);
  }
  for (let v = 0; v < nV; v++) {
    const p = vP[v];
    if (p >= 0 && pockets[p].hole) U[v] /= most[p] || 1;
  }
  // FEM: the unknowns are the free vertices of pockets with mouths; the
  // stiffness per unique edge is the sum of its triangles' cot / 2
  const idx = new Int32Array(nV).fill(-1);
  let m = 0;
  for (let v = 0; v < nV; v++)
    if (!isB[v] && vP[v] >= 0 && !pockets[vP[v]].hole) idx[v] = m++;
  const W = new Float64Array(nEdgeIds);
  for (let t = 0; t < nIn; t++) {
    if (pockets[triPocket[t]].hole) continue;
    for (let q = 0; q < 3; q++) {
      const i = tri[3 * t + q],
        j = tri[3 * t + ((q + 1) % 3)],
        k = tri[3 * t + ((q + 2) % 3)];
      const ux = X[i] - X[k],
        uy = Y[i] - Y[k],
        wx = X[j] - X[k],
        wy = Y[j] - Y[k];
      const cr = Math.abs(ux * wy - uy * wx);
      if (cr < 1e-14) continue;
      W[edgeId[3 * t + q]] += (ux * wx + uy * wy) / cr / 2;
    }
  }
  const deg = new Int32Array(m + 1);
  const diag = new Float64Array(m),
    rhs = new Float64Array(m);
  const endA = (id: number) => T[id],
    endB = (id: number) => T[nextHe(id)];
  const edgeSeen = new Uint8Array(nEdgeIds);
  const uniq: number[] = [];
  for (let t = 0; t < nIn; t++)
    for (let q = 0; q < 3; q++) {
      const id = edgeId[3 * t + q];
      if (edgeSeen[id] || W[id] === 0) continue;
      edgeSeen[id] = 1;
      uniq.push(id);
      const a = endA(id),
        b = endB(id);
      const I = idx[a],
        J = idx[b];
      const w = W[id];
      if (I >= 0) diag[I] += w;
      if (J >= 0) diag[J] += w;
      if (I >= 0 && J >= 0) {
        deg[I + 1]++;
        deg[J + 1]++;
      } else if (I >= 0) rhs[I] += w * U[b];
      else if (J >= 0) rhs[J] += w * U[a];
    }
  // CSR, columns sorted, diagonal included
  const rp = new Int32Array(m + 1);
  for (let i = 0; i < m; i++) rp[i + 1] = rp[i] + deg[i + 1] + 1;
  const ci = new Int32Array(rp[m]),
    cv = new Float64Array(rp[m]);
  const fill = rp.slice(0, m);
  for (let i = 0; i < m; i++) {
    ci[fill[i]] = i;
    cv[fill[i]++] = diag[i];
  }
  for (const id of uniq) {
    const a = endA(id),
      b = endB(id);
    const I = idx[a],
      J = idx[b];
    if (I < 0 || J < 0) continue;
    ci[fill[I]] = J;
    cv[fill[I]++] = -W[id];
    ci[fill[J]] = I;
    cv[fill[J]++] = -W[id];
  }
  for (let i = 0; i < m; i++)
    for (let q = rp[i] + 1; q < rp[i + 1]; q++) {
      const c = ci[q],
        v = cv[q];
      let r = q - 1;
      while (r >= rp[i] && ci[r] > c) {
        ci[r + 1] = ci[r];
        cv[r + 1] = cv[r];
        r--;
      }
      ci[r + 1] = c;
      cv[r + 1] = v;
    }
  lap("assemble");
  const sol = pcgIC(rp, ci, cv, rhs, m);
  for (let v = 0; v < nV; v++)
    if (idx[v] >= 0) U[v] = Math.min(1, Math.max(0, sol.x[idx[v]]));
  const msSolve = performance.now() - ts;

  lap("solve");
  // ── the refined field: a quadratic value at every edge's middle ───────────
  // Each triangle is split in four at its edges' middles, and u is linear on
  // each quarter. A middle's value is the Hermite cubic's along the edge,
  // from the two ends' values and recovered gradients (each vertex's
  // area-weighted mean of its triangles' gradients), clamped to the ends'
  // range: no middle is ever a strict extremum, so no lake and no island
  // forms. On boundary edges it is the mean (u is linear there); in holes,
  // the exact distance.
  const gx = new Float64Array(nV),
    gy = new Float64Array(nV),
    gw = new Float64Array(nV);
  for (let t = 0; t < nIn; t++) {
    const a = tri[3 * t],
      b = tri[3 * t + 1],
      c = tri[3 * t + 2];
    const d = (X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]);
    if (Math.abs(d) < 1e-14) continue;
    const ub = U[b] - U[a],
      uc = U[c] - U[a];
    const tx = (ub * (Y[c] - Y[a]) - uc * (Y[b] - Y[a])) / d,
      ty = (uc * (X[b] - X[a]) - ub * (X[c] - X[a])) / d;
    const ar = Math.abs(d) / 2;
    for (const v of [a, b, c]) {
      gx[v] += ar * tx;
      gy[v] += ar * ty;
      gw[v] += ar;
    }
  }
  for (let v = 0; v < nV; v++)
    if (gw[v] > 0) {
      gx[v] /= gw[v];
      gy[v] /= gw[v];
    }
  const refine = MESH_BLEND.refine;
  const mid = new Int32Array(nEdgeIds).fill(-1);
  const RX: number[] = Array.from(X),
    RY: number[] = Array.from(Y),
    RU: number[] = Array.from(U);
  if (refine)
    for (let t = 0; t < nIn; t++) {
      const hole = pockets[triPocket[t]].hole;
      for (let q = 0; q < 3; q++) {
        const id = edgeId[3 * t + q];
        if (mid[id] >= 0) continue;
        const a = tri[3 * t + q],
          b = tri[3 * t + ((q + 1) % 3)];
        const mx = (X[a] + X[b]) / 2,
          my = (Y[a] + Y[b]) / 2;
        let u = (U[a] + U[b]) / 2;
        const onB = isBHe[id] || (HE[id] >= 0 && isBHe[HE[id]]);
        if (hole && !onB)
          u =
            holeWall.get(triPocket[t])!.nearest(mx, my)[0] /
            (most[triPocket[t]] || 1);
        else if (!onB) {
          u +=
            ((gx[a] - gx[b]) * (X[b] - X[a]) +
              (gy[a] - gy[b]) * (Y[b] - Y[a])) /
            8;
          u = Math.min(Math.max(U[a], U[b]), Math.max(Math.min(U[a], U[b]), u));
        }
        mid[id] = RX.length;
        RX.push(mx);
        RY.push(my);
        RU.push(u);
      }
    }
  // the quarter triangles, each edge's id (an edge's halves: 2·id for the one
  // at its lower vertex; the inner edges after all of those), cut corners
  const nR = refine ? 4 * nIn : nIn;
  const rtri = new Int32Array(3 * nR),
    rtriPocket = new Int32Array(nR),
    redge = new Int32Array(3 * nR);
  const half = (id: number, v: number) =>
    2 * id + (v === Math.min(endA(id), endB(id)) ? 0 : 1);
  for (let t = 0; t < nIn; t++) {
    const v = [tri[3 * t], tri[3 * t + 1], tri[3 * t + 2]];
    const e = [edgeId[3 * t], edgeId[3 * t + 1], edgeId[3 * t + 2]];
    if (!refine) {
      rtri.set(v, 3 * t);
      redge.set(e, 3 * t);
      rtriPocket[t] = triPocket[t];
      continue;
    }
    // middles: m0 on v0v1, m1 on v1v2, m2 on v2v0
    const md = [mid[e[0]], mid[e[1]], mid[e[2]]];
    const inner = (k: number) => 2 * nEdgeIds + 3 * t + k;
    const quads: [number[], number[]][] = [
      [
        [v[0], md[0], md[2]],
        [half(e[0], v[0]), inner(0), half(e[2], v[0])],
      ],
      [
        [md[0], v[1], md[1]],
        [half(e[0], v[1]), half(e[1], v[1]), inner(1)],
      ],
      [
        [md[2], md[1], v[2]],
        [inner(2), half(e[1], v[2]), half(e[2], v[2])],
      ],
      [
        [md[0], md[1], md[2]],
        [inner(1), inner(2), inner(0)],
      ],
    ];
    quads.forEach(([vs, es], k) => {
      rtri.set(vs, 3 * (4 * t + k));
      redge.set(es, 3 * (4 * t + k));
      rtriPocket[4 * t + k] = triPocket[t];
    });
  }
  const cutCorner = new Map<number, number>();
  for (const [e, c] of cutHe) {
    const id = HE[e] >= 0 ? Math.min(e, HE[e]) : e;
    if (refine) {
      cutCorner.set(2 * id, c);
      cutCorner.set(2 * id + 1, c);
    } else cutCorner.set(id, c);
  }
  const nREdge = refine ? 2 * nEdgeIds + 3 * nIn : nEdgeIds;

  lap("refine");
  // ── each pocket's area of {u ≤ ℓ}, piecewise quadratic ────────────────────
  // per quarter, with values a ≤ b ≤ c and area A: k1 (ℓ − a)² on [a, b],
  // A − k2 (c − ℓ)² on [b, c], A after; as events (position, Δq2, Δq1, Δq0)
  const nEv = 3 * nR + 2 * pockets.length;
  const evX = new Float64Array(nEv),
    evP = new Int32Array(nEv),
    evC = new Float64Array(3 * nEv);
  let ne = 0;
  const push = (p: number, x: number, c2: number, c1: number, c0: number) => {
    evX[ne] = x;
    evP[ne] = p;
    evC[3 * ne] = c2;
    evC[3 * ne + 1] = c1;
    evC[3 * ne + 2] = c0;
    ne++;
  };
  // a quarter's events sit at its corners' values, so they are summed per
  // corner (vertex) first: one event per vertex, not three per quarter
  const nRV = RU.length;
  const vC = new Float64Array(3 * nRV),
    vPk = new Int32Array(nRV).fill(-1);
  const addAt = (p: number, v: number, c2: number, c1: number, c0: number) => {
    if (vPk[v] < 0) vPk[v] = p;
    if (vPk[v] !== p) return push(p, RU[v], c2, c1, c0); // a vertex of two pockets
    vC[3 * v] += c2;
    vC[3 * v + 1] += c1;
    vC[3 * v + 2] += c0;
  };
  for (let t = 0; t < nR; t++) {
    let i = rtri[3 * t],
      j = rtri[3 * t + 1],
      k = rtri[3 * t + 2];
    const ar =
      Math.abs(
        (RX[j] - RX[i]) * (RY[k] - RY[i]) - (RY[j] - RY[i]) * (RX[k] - RX[i])
      ) / 2;
    if (ar === 0) continue;
    if (RU[i] > RU[j]) [i, j] = [j, i];
    if (RU[j] > RU[k]) [j, k] = [k, j];
    if (RU[i] > RU[j]) [i, j] = [j, i];
    const a = RU[i],
      b = RU[j],
      c = RU[k];
    const p = rtriPocket[t];
    pockets[p].area += ar;
    if (c - a < 1e-12) {
      addAt(p, i, 0, 0, ar);
      continue;
    }
    const k1 = b - a > 1e-12 ? ar / ((b - a) * (c - a)) : 0;
    const k2 = c - b > 1e-12 ? ar / ((c - a) * (c - b)) : 0;
    addAt(p, i, k1, -2 * a * k1, a * a * k1);
    addAt(
      p,
      j,
      -k1 - k2,
      2 * a * k1 + 2 * c * k2,
      -a * a * k1 + ar - c * c * k2
    );
    addAt(p, k, k2, -2 * c * k2, c * c * k2);
  }
  for (let v = 0; v < nRV; v++)
    if (vPk[v] >= 0)
      push(vPk[v], RU[v], vC[3 * v], vC[3 * v + 1], vC[3 * v + 2]);
  // the cusps fill at the rate ℓ
  pockets.forEach((P, p) => {
    if (P.cuspArea <= 0) return;
    push(p, 0, 0, P.cuspArea, 0);
    push(p, 1, 0, -P.cuspArea, P.cuspArea);
    P.area += P.cuspArea;
  });
  const order = sortByKey(evX.subarray(0, ne));
  // the sorted events split by pocket (stable: each pocket's stay sorted)
  const start = new Int32Array(pockets.length + 1);
  for (let q = 0; q < ne; q++) start[evP[q] + 1]++;
  for (let p = 0; p < pockets.length; p++) start[p + 1] += start[p];
  const byPocket = new Int32Array(ne);
  const fillAt = start.slice(0, pockets.length);
  for (let q = 0; q < ne; q++) byPocket[fillAt[evP[order[q]]]++] = order[q];
  pockets.forEach((P, p) => {
    const os = byPocket.subarray(start[p], start[p + 1]);
    const n = os.length;
    const xs = new Float64Array(n),
      q2 = new Float64Array(n),
      q1 = new Float64Array(n),
      q0 = new Float64Array(n),
      At = new Float64Array(n);
    let s2 = 0,
      s1 = 0,
      s0_ = 0;
    for (let q = 0; q < n; q++) {
      const o = os[q];
      s2 += evC[3 * o];
      s1 += evC[3 * o + 1];
      s0_ += evC[3 * o + 2];
      const x = evX[o];
      xs[q] = x;
      q2[q] = s2;
      q1[q] = s1;
      q0[q] = s0_;
      At[q] = s2 * x * x + s1 * x + s0_;
    }
    Object.assign(P, { xs, q2, q1, q0, At });
  });
  const cornerPocket = corners.map((C) =>
    pockets.findIndex((P) => P.mouths.includes(C.mouth))
  );

  lap("area");
  return {
    spine: clean,
    hull,
    mouths,
    corners,
    cornerPocket,
    pockets,
    X,
    Y,
    U,
    tri,
    triPocket,
    RX: Float64Array.from(RX),
    RY: Float64Array.from(RY),
    RU: Float64Array.from(RU),
    rtri,
    rtriPocket,
    redge,
    nREdge,
    cutCorner,
    stats: {
      vertices: nV,
      boundary: nB,
      outside: nV - nB - m,
      unknowns: m,
      triangles: nIn,
      pockets: pockets.length,
      rounds,
      cg: sol.it,
      msMesh,
      msSolve,
      ms: performance.now() - t0,
      ...Object.fromEntries(Object.entries(PH).map(([k, v]) => ["ms_" + k, v])),
    },
  };
}

/** the order of nonnegative keys: an LSD radix sort on their bits (for
 * nonnegative doubles the bit patterns sort as the values), 16 bits a pass;
 * stable, O(n) however the keys cluster */
function sortByKey(keys: Float64Array): Uint32Array {
  const n = keys.length;
  const K = new Float64Array(n);
  for (let i = 0; i < n; i++) K[i] = keys[i] + 0; // -0 → +0
  const W = new Uint32Array(K.buffer); // little-endian: [lo, hi] per key
  let out = new Uint32Array(n),
    tmp = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  const cnt = new Uint32Array(65537);
  for (let pass = 0; pass < 4; pass++) {
    const word = pass >> 1,
      shift = (pass & 1) * 16;
    cnt.fill(0);
    for (let i = 0; i < n; i++)
      cnt[((W[2 * i + word] >>> shift) & 0xffff) + 1]++;
    if (cnt[((W[word] >>> shift) & 0xffff) + 1] === n) continue; // one digit: no-op
    for (let d = 0; d < 65536; d++) cnt[d + 1] += cnt[d];
    for (let q = 0; q < n; q++) {
      const i = out[q];
      tmp[cnt[(W[2 * i + word] >>> shift) & 0xffff]++] = i;
    }
    [out, tmp] = [tmp, out];
  }
  return out;
}

function windingOf(rings: Pt[][], p: Pt): number {
  let w = 0;
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      if (a[1] <= p[1] !== b[1] <= p[1]) {
        const xc = a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
        if (xc > p[0]) w += b[1] > a[1] ? 1 : -1;
      }
    }
  return w;
}

/** Conjugate gradients with an IC(0) preconditioner, on a symmetric CSR
 *  matrix with sorted columns. */
function pcgIC(
  rp: Int32Array,
  ci: Int32Array,
  cv: Float64Array,
  b: Float64Array,
  n: number
): { x: Float64Array; it: number } {
  // IC(0): L on the lower pattern of A, row by row
  const lp = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let q = rp[i]; q < rp[i + 1]; q++) if (ci[q] <= i) c++;
    lp[i + 1] = lp[i] + c;
  }
  const lc = new Int32Array(lp[n]),
    lv = new Float64Array(lp[n]);
  for (let i = 0; i < n; i++) {
    let w = lp[i];
    for (let q = rp[i]; q < rp[i + 1]; q++)
      if (ci[q] <= i) {
        lc[w] = ci[q];
        lv[w] = cv[q];
        w++;
      }
  }
  for (let i = 0; i < n; i++) {
    for (let q = lp[i]; q < lp[i + 1]; q++) {
      const j = lc[q];
      // L_ij -= Σ_k<j L_ik L_jk, then / L_jj (or the diagonal: sqrt)
      let s = lv[q];
      let a = lp[i],
        bq = lp[j];
      while (a < q && bq < lp[j + 1] - 1) {
        if (lc[a] === lc[bq]) s -= lv[a++] * lv[bq++];
        else if (lc[a] < lc[bq]) a++;
        else bq++;
      }
      if (j === i) lv[q] = Math.sqrt(Math.max(s, 1e-30));
      else lv[q] = s / lv[lp[j + 1] - 1];
    }
  }
  const apply = (r: Float64Array, z: Float64Array) => {
    for (let i = 0; i < n; i++) {
      let s = r[i];
      for (let q = lp[i]; q < lp[i + 1] - 1; q++) s -= lv[q] * z[lc[q]];
      z[i] = s / lv[lp[i + 1] - 1];
    }
    for (let i = n - 1; i >= 0; i--) {
      z[i] /= lv[lp[i + 1] - 1];
      const zi = z[i];
      for (let q = lp[i]; q < lp[i + 1] - 1; q++) z[lc[q]] -= lv[q] * zi;
    }
  };
  const x = new Float64Array(n),
    r = Float64Array.from(b),
    z = new Float64Array(n),
    p = new Float64Array(n),
    Ap = new Float64Array(n);
  apply(r, z);
  p.set(z);
  let rz = 0;
  for (let i = 0; i < n; i++) rz += r[i] * z[i];
  const bn = Math.sqrt(b.reduce((s, v) => s + v * v, 0)) || 1;
  let it = 0;
  for (; it < 2000; it++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let q = rp[i]; q < rp[i + 1]; q++) s += cv[q] * p[ci[q]];
      Ap[i] = s;
    }
    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
    if (!(pAp > 0)) break;
    const al = rz / pAp;
    let rn = 0;
    for (let i = 0; i < n; i++) {
      x[i] += al * p[i];
      r[i] -= al * Ap[i];
      rn += r[i] * r[i];
    }
    if (Math.sqrt(rn) < MESH_BLEND.tol * bn) {
      it++;
      break;
    }
    apply(r, z);
    let rz2 = 0;
    for (let i = 0; i < n; i++) rz2 += r[i] * z[i];
    const be = rz2 / rz;
    rz = rz2;
    for (let i = 0; i < n; i++) p[i] = z[i] + be * p[i];
  }
  return { x, it };
}

/** A pocket's level for convexity c: the ℓ at which {u ≤ ℓ} holds share c
 *  of its area. */
export function meshLevel(P: Pocket, c: number): number {
  const { xs, q2, q1, q0, At } = P as Required<Pocket>;
  const target = c * P.area;
  const n = xs.length;
  if (!n) return c;
  // the last breakpoint with A ≤ target
  let lo = 0,
    hi = n - 1;
  if (At[0] > target) return xs[0];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (At[mid] <= target) lo = mid;
    else hi = mid - 1;
  }
  const a = xs[lo],
    b = lo + 1 < n ? xs[lo + 1] : Math.max(1, a);
  const f = (x: number) => q2[lo] * x * x + q1[lo] * x + q0[lo];
  let x0 = a,
    x1 = b;
  for (let k = 0; k < 60 && x1 - x0 > 1e-15; k++) {
    const mm = (x0 + x1) / 2;
    if (f(mm) < target) x0 = mm;
    else x1 = mm;
  }
  return (x0 + x1) / 2;
}

/** The area of {u ≤ ℓ} in a pocket (for checks). */
export function meshArea(P: Pocket, l: number): number {
  const { xs, q2, q1, q0 } = P as Required<Pocket>;
  let lo = -1;
  for (let q = 0; q < xs.length && xs[q] <= l; q++) lo = q;
  return lo < 0 ? 0 : q2[lo] * l * l + q1[lo] * l + q0[lo];
}

/**
 * The blend's outline at convexity c in (0, 1): in every pocket the level
 * set of u at that pocket's level, run through its cusps to the mouth ends
 * and joined by the spine's runs on the hull; holes' level sets as their own
 * rings. Outer rings wind positive, holes the other way.
 */
export function meshBlendRings(
  MB: MeshBlend,
  c: number,
  holes: boolean
): Pt[][] {
  const { RX, RY, RU, rtri, rtriPocket, redge, pockets, corners, mouths } = MB;
  const lv = pockets.map((P) => meshLevel(P, c));
  const nE = MB.nREdge;
  const px = new Float64Array(nE),
    py = new Float64Array(nE);
  const next = new Int32Array(nE).fill(-1);
  const hasPrev = new Uint8Array(nE);
  const used: number[] = [];
  const nT = rtri.length / 3;
  for (let t = 0; t < nT; t++) {
    const l = lv[rtriPocket[t]];
    const v0 = rtri[3 * t],
      v1 = rtri[3 * t + 1],
      v2 = rtri[3 * t + 2];
    const in0 = RU[v0] <= l,
      in1 = RU[v1] <= l,
      in2 = RU[v2] <= l;
    if (in0 === in1 && in1 === in2) continue;
    let i0 = -1,
      i1 = -1;
    for (let q = 0; q < 3; q++) {
      const a = q === 0 ? v0 : q === 1 ? v1 : v2,
        b = q === 0 ? v1 : q === 1 ? v2 : v0;
      const ia = q === 0 ? in0 : q === 1 ? in1 : in2,
        ib = q === 0 ? in1 : q === 1 ? in2 : in0;
      if (ia === ib) continue;
      const id = redge[3 * t + q];
      // the crossing, from the lower vertex id so both triangles agree
      const [p, r] = a < b ? [a, b] : [b, a];
      const s = (l - RU[p]) / (RU[r] - RU[p]);
      px[id] = RX[p] + s * (RX[r] - RX[p]);
      py[id] = RY[p] + s * (RY[r] - RY[p]);
      if (i0 < 0) i0 = id;
      else i1 = id;
    }
    // the filled side on the left: the lone vertex is in or out
    const lone = in0 === in1 ? v2 : in1 === in2 ? v0 : v1;
    const loneIn = RU[lone] <= l;
    const cr =
      (px[i1] - px[i0]) * (RY[lone] - py[i0]) -
      (py[i1] - py[i0]) * (RX[lone] - px[i0]);
    if (cr > 0 !== loneIn) [i0, i1] = [i1, i0];
    next[i0] = i1;
    hasPrev[i1] = 1;
    used.push(i0);
  }
  const level = (ci: number, l: number): Pt[] => {
    const C = corners[ci];
    return C.wall.map(
      (w, k) =>
        [
          w[0] + l * (C.feet[k][0] - w[0]),
          w[1] + l * (C.feet[k][1] - w[1]),
        ] as Pt
    );
  };
  // open level curves: from an a corner's cut to a b corner's cut
  const pieceFrom = new Map<number, { pts: Pt[]; end: number }>();
  const closed: Pt[][] = [];
  const done = new Uint8Array(nE);
  for (const s of used) {
    if (hasPrev[s] || done[s]) continue;
    const ca = MB.cutCorner.get(s);
    const pts: Pt[] = [];
    let e = s,
      last = s;
    while (e >= 0 && !done[e]) {
      done[e] = 1;
      pts.push([px[e], py[e]]);
      last = e;
      e = next[e];
    }
    const cb = MB.cutCorner.get(last);
    if (ca === undefined || cb === undefined)
      throw new Error("meshBlend: level curve ends off a cut");
    // the cusps: corner to cut (a), cut to corner (b)
    const head = level(ca, lv[MB.cornerPocket[ca]]);
    const tail = level(cb, lv[MB.cornerPocket[cb]]).reverse();
    pieceFrom.set(ca, {
      pts: [...head.slice(0, -1), ...pts, ...tail.slice(1)],
      end: cb,
    });
  }
  for (const s of used) {
    if (done[s]) continue;
    const pts: Pt[] = [];
    let e = s;
    while (e >= 0 && !done[e]) {
      done[e] = 1;
      pts.push([px[e], py[e]]);
      e = next[e];
    }
    if (pts.length > 2) closed.push(pts);
  }
  // stitch: a level curve to a b corner, the spine on the hull to the next
  // kept mouth's a corner, its level curve, ...
  const spine = MB.spine.filter((r) => signedArea2(r) > 0);
  const kept = mouths
    .map((M, k) => ({ M, k }))
    .filter(({ M }) => M.kept)
    .sort((p, q) => p.M.hullAt - q.M.hullAt);
  const cornerOf = new Map<string, number>();
  corners.forEach((C, k) => cornerOf.set(`${C.mouth}${C.end}`, k));
  const rings: Pt[][] = [];
  if (!kept.length) rings.push(...spine);
  else {
    const order = new Map<number, number>();
    kept.forEach(({ k }, q) => order.set(k, q));
    const doneA = new Set<number>();
    for (const { k: m0 } of kept) {
      const a0 = cornerOf.get(`${m0}a`)!;
      if (doneA.has(a0)) continue;
      const ring: Pt[] = [];
      let a = a0;
      for (let guard = 0; guard <= kept.length; guard++) {
        doneA.add(a);
        const pc = pieceFrom.get(a);
        if (!pc) throw new Error("meshBlend: no level curve from a corner");
        ring.push(...pc.pts);
        const mb = corners[pc.end].mouth;
        const nm = kept[(order.get(mb)! + 1) % kept.length].k;
        const B = mouths[mb].b,
          A = mouths[nm].a;
        if (B.r !== A.r) throw new Error("meshBlend: spine run across rings");
        const R = spine[B.r];
        const n = R.length;
        // the spine from the b corner (the curve's last point) to the a
        // corner (the next curve's first)
        const run = (A.i - B.i + n) % n;
        for (let s = 1; s < run; s++) ring.push(R[(B.i + s) % n]);
        a = cornerOf.get(`${nm}a`)!;
        if (a === a0) break;
      }
      rings.push(ring);
    }
  }
  rings.push(...closed);
  const out = rings.filter((r) => r.length > 2);
  return holes ? out : out.filter((r) => signedArea2(r) > 0);
}
