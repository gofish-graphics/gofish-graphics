// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * The per-bay blend, what a blob's convexity between 0 and 1 means, solved
 * on a regular grid per pocket (earlier versions on a 1 px raster and on a
 * Delaunay mesh are deleted). Every pocket of hull − spine fills share c of
 * its own area, by the level sets of a harmonic field:
 *
 *  - the pockets are the pieces of the padded hull less the spine (the exact
 *    closing at r = padding). The hull is the convex hull of the spine's own
 *    vertices (the closing's hull is the members' padded hull), so each hull
 *    vertex is a spine vertex and a pocket is read off the hull: a hull edge
 *    between two spine vertices that are not neighbors is a mouth, and the
 *    spine run behind it (walked backward from the mouth's end to the next
 *    mouth's start) is its wall. A spine hole (with `holes`) is a pocket
 *    with no mouth.
 *  - where the mouth is tangent to the wall (every mouth end) the pocket is a
 *    cusp of zero width; it is cut off where it is `delta` px wide, and u in
 *    the cusp is the share of the way across it (the limit of the harmonic u
 *    in a thin channel). The cut edge carries that linear u.
 *  - in a pocket with a mouth, u is harmonic, 0 on the spine and 1 on the
 *    mouth, on a square grid of step h (BLEND.h, or the pocket's size over
 *    BLEND.k in a small pocket). The boundary's crossings of the grid lines
 *    are exact, and a node next to the boundary has its arm to the crossing
 *    shortened (Shortley and Weller) in Gibou's symmetric form, so the
 *    matrix is a symmetric M-matrix: u keeps the maximum principle, with no
 *    lake and no island at any level. Solved by conjugate gradients
 *    preconditioned by an incomplete Cholesky factor, IC(0) (solveNodes).
 *  - in a pocket with no mouth, u is the distance from its wall over the
 *    greatest such distance, exact at every node.
 *  - the field is read on triangles: a grid cell wholly inside is two, a
 *    cell the boundary cuts is the polygon of the boundary's run through it
 *    and its inside corners, ear clipped; u is linear on each.
 *  - each pocket fills share c of its own area: the area of {u <= l} is
 *    summed over the pocket's triangles, each in closed form as a product of
 *    two ratios of at most 1 (so it is exact however near a triangle's
 *    values are, and behind a narrow channel they are all within 1e-6), and
 *    the level for c is the root of that sum by regula falsi.
 *  - the outline at c is exact for that piecewise linear field: the level
 *    set is a straight segment per triangle, chained, run through the cusps
 *    to the mouth ends, and stitched to the spine runs on the hull between
 *    pockets.
 */
import type { Pt } from "./prims";
import { signedArea2, cross } from "../../geometry/plane";

/** The blend's knobs, px. delta: the cusp cut width; h: the grid step; k: a
 *  small pocket's grid step is its size (the square root of its area) over
 *  k; hMin: the least step. */
export const BLEND = {
  delta: 0.02,
  h: 4,
  k: 12,
  hMin: 0.25,
  /** the solve stops at this relative residual. Behind a narrow channel u
   *  is exponentially small (1e-6 and less), and a pocket's level can sit
   *  there: at 1e-7 the level set in such a chamber moved by up to 12 px
   *  between two solves. */
  tol: 1e-10,
};

// ── spatial helpers ─────────────────────────────────────────────────────────

/** Segments bucketed on a grid, for nearest-distance queries. `cell`: the
 *  grid's step, px; by default 4 px, or coarser where the segments are sparse
 *  (about one per cell), so a query far from a few long segments (a pocket's
 *  mouths) crosses few empty cells. The distance is exact at any step. */
export class SegGrid {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  start: Int32Array;
  items: Int32Array;
  S: Float64Array;
  constructor(S: Float64Array, cell?: number) {
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
    cell ??= Math.max(4, Math.sqrt(((xb - xa) * (yb - ya)) / Math.max(1, n)));
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

  /** The distance from (x, y) to the grid's nearest segment, or `cap` when
   *  that is at least cap (the search stops there). */
  capped(x: number, y: number, cap: number): number {
    const { x0, y0, cell, nx, ny, start, items, S } = this;
    const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell))),
      cj = Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / cell)));
    const off = Math.max(
      0,
      x0 - x,
      x - (x0 + nx * cell),
      y0 - y,
      y - (y0 + ny * cell)
    );
    if (off >= cap) return cap;
    let best = cap * cap;
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
            if (d < best) best = d;
          }
        }
      }
      // every segment not yet seen is at least k·cell − off away
      if (Math.sqrt(best) <= k * cell - off) break;
    }
    return Math.min(cap, Math.sqrt(best));
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
  /** its triangles: the values at their corners, least first, and area */
  tv?: Float64Array;
  area: number;
};

export type Blend = {
  spine: Pt[][];
  hull: Pt[];
  mouths: Mouth[];
  corners: Corner[];
  /** each corner's pocket */
  cornerPocket: number[];
  pockets: Pocket[];
  /** the vertices (boundary points, grid crossings and grid nodes) with
   *  their u, the triangles (3 vertex ids each) and their pocket */
  X: Float64Array;
  Y: Float64Array;
  U: Float64Array;
  tri: Int32Array;
  triPocket: Int32Array;
  /** each triangle edge's id (shared by the two triangles on it), how many
   *  there are, and for a cut edge's id its corner */
  edge: Int32Array;
  nEdge: number;
  cutCorner: Map<number, number>;
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
 * The pockets of the padded hull less the spine rings (outer rings winding
 * positive; holes, with `holes`, the other way), each as its boundary loops
 * with its cusps cut.
 */
export function pocketsOf(spine: Pt[][]): {
  clean: Pt[][];
  hull: Pt[];
  mouths: Mouth[];
  corners: Corner[];
  pockets: Pocket[];
  loops: Loop[];
} {
  const { delta } = BLEND;
  // drop points within 0.01 px of the next (arc joins can repeat a point
  // to within rounding, or step back by a few thousandths of a px: a
  // near-zero edge, or a zig-zag that crosses itself and so splits a cell's
  // run), and split outer rings from holes
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
      if (guard > mouths.length) throw new Error("blend: pocket walk");
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
      if (next < 0) throw new Error("blend: no next mouth");
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
    if (k >= pts.length) throw new Error("blend: cusp never opens");
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
        throw new Error("blend: cusp cuts cross");
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
  return { clean, hull, mouths, corners, pockets, loops };
}

// ── the field on a grid ─────────────────────────────────────────────────────

/** A pocket boundary's crossing of a grid line: where along the line, which
 *  way it crosses (+1 toward increasing x or y), its vertex and u. */
type Cross = { c: number; dir: number; id: number; u: number };

/** A pocket's boundary inside one grid cell, from where it enters the
 *  cell's perimeter to where it leaves (perimeter parameters, 0..4 from the
 *  lower left corner, counterclockwise in y-down px: along y0, up x1, back
 *  along y1, down x0), as vertex ids. */
type Run = { inT: number; outT: number; verts: number[] };

/** Ear clipping of a simple polygon (vertex ids, counterclockwise), into
 *  `out` as vertex triples. A cut cell's polygon has a few vertices, so the
 *  quadratic search is cheap. */
function earClip(
  poly: number[],
  X: number[],
  Y: number[],
  out: number[]
): void {
  const idx = poly.slice();
  const cr = (a: number, b: number, c: number) =>
    (X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]);
  const inTri = (p: number, a: number, b: number, c: number) =>
    cr(a, b, p) >= 0 && cr(b, c, p) >= 0 && cr(c, a, p) >= 0;
  while (idx.length > 3) {
    const n = idx.length;
    let found = -1;
    for (let k = 0; k < n && found < 0; k++) {
      const a = idx[(k + n - 1) % n],
        b = idx[k],
        c = idx[(k + 1) % n];
      if (cr(a, b, c) <= 0) continue;
      let blocked = false;
      for (let q = 0; q < n && !blocked; q++) {
        const d = idx[q];
        if (d === a || d === b || d === c) continue;
        if (X[d] === X[a] && Y[d] === Y[a]) continue;
        blocked = inTri(d, a, b, c);
      }
      if (!blocked) found = k;
    }
    if (found < 0) {
      // only collinear or repeated corners are left: clip the flattest
      let bv = Infinity;
      for (let k = 0; k < n; k++) {
        const v = Math.abs(cr(idx[(k + n - 1) % n], idx[k], idx[(k + 1) % n]));
        if (v < bv) [bv, found] = [v, k];
      }
    }
    out.push(idx[(found + n - 1) % n], idx[found], idx[(found + 1) % n]);
    idx.splice(found, 1);
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
}

/** The vertices and triangles the blend is read from, shared by its
 *  pockets. */
class Tris {
  X: number[] = [];
  Y: number[] = [];
  U: number[] = [];
  tri: number[] = [];
  triPocket: number[] = [];
  /** loop pieces on cut edges: [a, b, corner] */
  cuts: number[] = [];
  vert(x: number, y: number, u: number): number {
    this.X.push(x);
    this.Y.push(y);
    this.U.push(u);
    return this.X.length - 1;
  }
  add(a: number, b: number, c: number, p: number) {
    this.tri.push(a, b, c);
    this.triPocket.push(p);
  }
}

/**
 * One pocket's field on a grid of step h and its triangles, into T; false
 * when a boundary loop lies wholly inside one grid cell (a cell with a hole
 * in it, which the cell triangulation does not handle: the caller retries
 * at h / 2).
 */
function gridPocket(
  pid: number,
  hole: boolean,
  Ls: Loop[],
  h: number,
  T: Tris
): boolean {
  const T0 = { v: T.X.length, t: T.tri.length, p: T.triPocket.length };
  const T0cuts = T.cuts.length;
  let [xa, ya, xb, yb] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const L of Ls)
    for (const [x, y] of L.pts) {
      xa = Math.min(xa, x);
      xb = Math.max(xb, x);
      ya = Math.min(ya, y);
      yb = Math.max(yb, y);
    }
  // the grid's origin off any round number, so a boundary vertex (often on
  // a member's axis) is not on a grid line
  const gx0 = xa - h * 1.3183,
    gy0 = ya - h * 1.2718;
  const nx = Math.ceil((xb - gx0) / h) + 2,
    ny = Math.ceil((yb - gy0) / h) + 2;
  const W = nx + 1;
  const gx = (i: number) => gx0 + i * h,
    gy = (j: number) => gy0 + j * h;
  // ── the boundary's crossings of the grid lines, in loop order ──
  const rows: Cross[][] = Array.from({ length: ny + 1 }, () => []);
  const cols: Cross[][] = Array.from({ length: nx + 1 }, () => []);
  /** per crossing vertex (less T0.v): its line (0 vertical, 1 horizontal)
   *  and index; -1 for a loop vertex */
  const crossLine: number[] = [],
    crossIdx: number[] = [];
  /** each loop as vertex ids, and whether each is a crossing */
  const seqs: { id: number[]; cross: boolean[] }[] = [];
  const cs: {
    t: number;
    x: number;
    y: number;
    line: number;
    li: number;
    dir: number;
  }[] = [];
  const vert = (x: number, y: number, u: number, line: number, li: number) => {
    crossLine.push(line);
    crossIdx.push(li);
    return T.vert(x, y, u);
  };
  for (const L of Ls) {
    const n = L.pts.length;
    const ids = L.pts.map((p, k) => vert(p[0], p[1], L.val[k], -1, -1));
    const seq = { id: [] as number[], cross: [] as boolean[] };
    for (let k = 0; k < n; k++) {
      const a = L.pts[k],
        b = L.pts[(k + 1) % n];
      const ua = L.val[k],
        ub = L.val[(k + 1) % n];
      seq.id.push(ids[k]);
      seq.cross.push(false);
      cs.length = 0;
      if (a[0] !== b[0]) {
        const lo = Math.min(a[0], b[0]),
          hi = Math.max(a[0], b[0]);
        const dir = b[0] > a[0] ? 1 : -1;
        for (let i = Math.ceil((lo - gx0) / h); gx(i) <= hi; i++) {
          const x = gx(i);
          if (a[0] <= x === b[0] <= x) continue;
          const t = (x - a[0]) / (b[0] - a[0]);
          cs.push({ t, x, y: a[1] + t * (b[1] - a[1]), line: 0, li: i, dir });
        }
      }
      if (a[1] !== b[1]) {
        const lo = Math.min(a[1], b[1]),
          hi = Math.max(a[1], b[1]);
        const dir = b[1] > a[1] ? 1 : -1;
        for (let j = Math.ceil((lo - gy0) / h); gy(j) <= hi; j++) {
          const y = gy(j);
          if (a[1] <= y === b[1] <= y) continue;
          const t = (y - a[1]) / (b[1] - a[1]);
          cs.push({ t, x: a[0] + t * (b[0] - a[0]), y, line: 1, li: j, dir });
        }
      }
      if (cs.length > 1) cs.sort((p, q) => p.t - q.t);
      const start = seq.id.length - 1;
      for (const c of cs) {
        const u = ua + c.t * (ub - ua);
        const id = vert(c.x, c.y, u, c.line, c.li);
        if (c.line === 0) cols[c.li].push({ c: c.y, dir: c.dir, id, u });
        else rows[c.li].push({ c: c.x, dir: c.dir, id, u });
        seq.id.push(id);
        seq.cross.push(true);
      }
      // a cut edge's pieces, for its corner
      if (L.kind[k] === 2)
        for (let q = start; q < seq.id.length; q++)
          T.cuts.push(
            seq.id[q],
            q + 1 < seq.id.length ? seq.id[q + 1] : ids[(k + 1) % n],
            L.corner[k]
          );
    }
    seqs.push(seq);
  }

  // ── the nodes inside, and each one's distance to the boundary along the
  // four grid directions (E, W, S, N; th = 1 and reg = 1: a node) ──
  const N = W * (ny + 1);
  const inside = new Uint8Array(N);
  const th = new Float64Array(4 * N),
    gv = new Float64Array(4 * N),
    reg = new Uint8Array(4 * N);
  for (let j = 0; j <= ny; j++) {
    const R = rows[j];
    if (R.length > 1) R.sort((p, q) => p.c - q.c);
    // the winding number of a node: the crossings to its right
    let w = 0;
    let k = R.length - 1;
    for (let i = nx; i >= 0; i--) {
      const x = gx(i);
      while (k >= 0 && R[k].c > x) w += R[k--].dir;
      inside[j * W + i] = w !== 0 ? 1 : 0;
    }
    let q = 0;
    for (let i = 0; i <= nx; i++) {
      const x = gx(i);
      while (q < R.length && R[q].c <= x) q++;
      const v = 4 * (j * W + i);
      if (q < R.length && R[q].c < x + h) {
        th[v] = (R[q].c - x) / h;
        gv[v] = R[q].u;
      } else reg[v] = 1;
      if (q > 0 && R[q - 1].c > x - h) {
        th[v + 1] = (x - R[q - 1].c) / h;
        gv[v + 1] = R[q - 1].u;
      } else reg[v + 1] = 1;
    }
  }
  for (let i = 0; i <= nx; i++) {
    const C = cols[i];
    if (C.length > 1) C.sort((p, q) => p.c - q.c);
    let q = 0;
    for (let j = 0; j <= ny; j++) {
      const y = gy(j);
      while (q < C.length && C[q].c <= y) q++;
      const v = 4 * (j * W + i);
      if (q < C.length && C[q].c < y + h) {
        th[v + 2] = (C[q].c - y) / h;
        gv[v + 2] = C[q].u;
      } else reg[v + 2] = 1;
      if (q > 0 && C[q - 1].c > y - h) {
        th[v + 3] = (y - C[q - 1].c) / h;
        gv[v + 3] = C[q - 1].u;
      } else reg[v + 3] = 1;
    }
  }

  // ── u at the nodes ──
  const uid = new Int32Array(N).fill(-1);
  let m = 0;
  for (let v = 0; v < N; v++) if (inside[v]) uid[v] = m++;
  const sol = new Float64Array(m);
  if (hole) {
    // the distance from the wall over the most
    const G = new SegGrid(segsOf(Ls.map((L) => L.pts)));
    let most = 0;
    for (let v = 0; v < N; v++)
      if (uid[v] >= 0) {
        const d = G.nearest(gx(v % W), gy(Math.floor(v / W)))[0];
        sol[uid[v]] = d;
        most = Math.max(most, d);
      }
    for (let k = 0; k < m; k++) sol[k] /= most || 1;
  } else if (m) solveNodes(W, N, uid, m, th, gv, reg, sol);
  const vid = new Int32Array(N).fill(-1);
  for (let v = 0; v < N; v++)
    if (uid[v] >= 0)
      vid[v] = T.vert(gx(v % W), gy(Math.floor(v / W)), sol[uid[v]]);

  // ── the loops' runs through each cell ──
  const runsOf = new Map<number, Run[]>();
  let island = false;
  const cellOf = (a: number, b: number) =>
    Math.floor(((T.Y[a] + T.Y[b]) / 2 - gy0) / h) * nx +
    Math.floor(((T.X[a] + T.X[b]) / 2 - gx0) / h);
  /** where crossing `id` is on cell `cell`'s perimeter */
  const perim = (id: number, cell: number) => {
    const line = crossLine[id - T0.v],
      li = crossIdx[id - T0.v];
    const ci = cell % nx,
      cj = Math.floor(cell / nx);
    if (line === 0)
      return li === ci
        ? 3 + (gy(cj + 1) - T.Y[id]) / h
        : 1 + (T.Y[id] - gy(cj)) / h;
    return li === cj ? (T.X[id] - gx(ci)) / h : 2 + (gx(ci + 1) - T.X[id]) / h;
  };
  for (const { id, cross } of seqs) {
    const n = id.length;
    const first = cross.indexOf(true);
    if (first < 0) {
      island = true;
      break;
    }
    let k = first;
    do {
      const verts = [id[k]];
      let q = (k + 1) % n;
      while (!cross[q]) {
        verts.push(id[q]);
        q = (q + 1) % n;
      }
      verts.push(id[q]);
      const cell = cellOf(verts[0], verts[1]);
      const l = runsOf.get(cell);
      const run = {
        inT: perim(verts[0], cell),
        outT: perim(verts[verts.length - 1], cell),
        verts,
      };
      if (l) l.push(run);
      else runsOf.set(cell, [run]);
      k = q;
    } while (k !== first);
  }
  if (island) {
    T.X.length = T.Y.length = T.U.length = T0.v;
    T.tri.length = T0.t;
    T.triPocket.length = T0.p;
    T.cuts.length = T0cuts;
    return false;
  }

  // ── the cells: whole ones as two triangles, cut ones as the polygons the
  // runs and the cell's inside corners make, ear clipped ──
  const ear: number[] = [];
  for (let cj = 0; cj < ny; cj++)
    for (let ci = 0; ci < nx; ci++) {
      const cell = cj * nx + ci;
      const corner = [
        vid[cj * W + ci],
        vid[cj * W + ci + 1],
        vid[(cj + 1) * W + ci + 1],
        vid[(cj + 1) * W + ci],
      ];
      const runs = runsOf.get(cell);
      if (!runs) {
        if (
          corner[0] >= 0 &&
          corner[1] >= 0 &&
          corner[2] >= 0 &&
          corner[3] >= 0
        ) {
          T.add(corner[0], corner[1], corner[2], pid);
          T.add(corner[0], corner[2], corner[3], pid);
        }
        continue;
      }
      // chain each run's exit to the next run's entry, counterclockwise
      // around the perimeter, through the corners passed
      const used = new Uint8Array(runs.length);
      for (let r0 = 0; r0 < runs.length; r0++) {
        if (used[r0]) continue;
        const poly: number[] = [];
        let r = r0;
        for (let guard = 0; guard <= runs.length; guard++) {
          used[r] = 1;
          for (const v of runs[r].verts) poly.push(v);
          const t0 = runs[r].outT;
          let best = -1,
            bd = Infinity;
          for (let q = 0; q < runs.length; q++) {
            if (used[q] && q !== r0) continue;
            let d = runs[q].inT - t0;
            while (d <= 0) d += 4;
            while (d > 4) d -= 4;
            if (d < bd) [bd, best] = [d, q];
          }
          for (let k = Math.floor(t0) + 1; k < t0 + bd; k++) {
            const cv = corner[k % 4];
            if (cv >= 0) poly.push(cv);
          }
          if (best === r0 || best < 0) break;
          r = best;
        }
        ear.length = 0;
        earClip(poly, T.X, T.Y, ear);
        for (let k = 0; k < ear.length; k += 3)
          T.add(ear[k], ear[k + 1], ear[k + 2], pid);
      }
    }
  return true;
}

/**
 * The nodes' u: the five-point Laplacian, its arm to a boundary crossing
 * shortened to th · h with the crossing's u (Shortley and Weller), in the
 * symmetric form (Gibou, Fedkiw, Cheng and Kang 2002: the crossing's
 * equation moved to the right-hand side, 1/th on the diagonal), so the matrix
 * is symmetric positive definite and an M-matrix: no u outside [0, 1].
 */
function solveNodes(
  W: number,
  N: number,
  uid: Int32Array,
  m: number,
  th: Float64Array,
  gv: Float64Array,
  reg: Uint8Array,
  sol: Float64Array
): void {
  const nbr = [1, -1, W, -W];
  const rp = new Int32Array(m + 1);
  const ci: number[] = [],
    cv: number[] = [];
  const rhs = new Float64Array(m);
  const row: [number, number][] = [];
  for (let v = 0; v < N; v++) {
    const r = uid[v];
    if (r < 0) continue;
    let diag = 0;
    row.length = 0;
    for (let d = 0; d < 4; d++) {
      const k = 4 * v + d;
      if (reg[k]) {
        diag += 1;
        row.push([uid[v + nbr[d]], -1]);
      } else {
        const t = Math.max(1e-9, th[k]);
        diag += 1 / t;
        rhs[r] += gv[k] / t;
      }
    }
    row.push([r, diag]);
    row.sort((p, q) => p[0] - q[0]);
    for (const [c, x] of row) {
      ci.push(c);
      cv.push(x);
    }
    rp[r + 1] = ci.length;
  }
  const res = pcgIC(rp, Int32Array.from(ci), Float64Array.from(cv), rhs, m);
  for (let k = 0; k < m; k++) sol[k] = Math.min(1, Math.max(0, res.x[k]));
}

/**
 * The blend's field for the spine rings (outer rings winding positive;
 * holes, with `holes`, the other way): each pocket on its own grid, of step
 * BLEND.h or, in a small pocket, its size over BLEND.k (at least BLEND.hMin).
 */
export function buildBlend(spine: Pt[][]): Blend {
  const { clean, hull, mouths, corners, pockets, loops } = pocketsOf(spine);
  const T = new Tris();
  const byPocket = pockets.map(() => [] as Loop[]);
  for (const L of loops) byPocket[L.pocket].push(L);
  pockets.forEach((P, pid) => {
    const Ls = byPocket[pid];
    if (!Ls.length) return;
    let A2 = 0;
    for (const L of Ls) A2 += signedArea2(L.pts);
    // the pocket's own loop (its first) crosses the grid lines
    let h = Math.min(
      BLEND.h,
      Math.max(BLEND.hMin, Math.sqrt(Math.abs(A2) / 2) / BLEND.k),
      boxSize(Ls[0].pts) / 2
    );
    // a wall ring inside one cell: a finer grid, or under hMin / 4 px across,
    // left out
    while (!gridPocket(pid, P.hole, Ls, h, T)) {
      if (h / 2 < BLEND.hMin / 4) {
        const big = Ls.filter((L, k) => k === 0 || boxSize(L.pts) >= 2 * h);
        gridPocket(pid, P.hole, big, h, T);
        break;
      }
      h /= 2;
    }
  });
  // each triangle edge's id, shared by the two triangles on it, numbered in
  // the order first met: a list per lower vertex of (upper vertex, id)
  const nV = T.X.length;
  const nT = T.triPocket.length;
  const head = new Int32Array(nV).fill(-1),
    next = new Int32Array(3 * nT),
    upper = new Int32Array(3 * nT),
    eid = new Int32Array(3 * nT);
  let nE = 0;
  const idOf = (a: number, b: number): number => {
    const lo = a < b ? a : b,
      hi = a < b ? b : a;
    for (let s = head[lo]; s >= 0; s = next[s])
      if (upper[s] === hi) return eid[s];
    return -1;
  };
  const edge = new Int32Array(3 * nT);
  for (let t = 0; t < nT; t++)
    for (let q = 0; q < 3; q++) {
      const a = T.tri[3 * t + q],
        b = T.tri[3 * t + ((q + 1) % 3)];
      let e = idOf(a, b);
      if (e < 0) {
        const lo = a < b ? a : b;
        upper[nE] = a < b ? b : a;
        eid[nE] = e = nE;
        next[nE] = head[lo];
        head[lo] = nE++;
      }
      edge[3 * t + q] = e;
    }
  const cutCorner = new Map<number, number>();
  for (let k = 0; k < T.cuts.length; k += 3) {
    const e = idOf(T.cuts[k], T.cuts[k + 1]);
    if (e >= 0) cutCorner.set(e, T.cuts[k + 2]);
  }

  const X = Float64Array.from(T.X),
    Y = Float64Array.from(T.Y),
    U = Float64Array.from(T.U);
  const tri = Int32Array.from(T.tri),
    triPocket = Int32Array.from(T.triPocket);
  // ── each pocket's triangles, as (a ≤ b ≤ c, area) for the area of {u ≤ ℓ}
  const per = pockets.map(() => [] as number[]);
  for (let t = 0; t < nT; t++) {
    let i = tri[3 * t],
      j = tri[3 * t + 1],
      k = tri[3 * t + 2];
    const ar =
      Math.abs((X[j] - X[i]) * (Y[k] - Y[i]) - (Y[j] - Y[i]) * (X[k] - X[i])) /
      2;
    if (ar === 0) continue;
    if (U[i] > U[j]) [i, j] = [j, i];
    if (U[j] > U[k]) [j, k] = [k, j];
    if (U[i] > U[j]) [i, j] = [j, i];
    const p = triPocket[t];
    pockets[p].area += ar;
    per[p].push(U[i], U[j], U[k], ar);
  }
  pockets.forEach((P, p) => {
    P.tv = Float64Array.from(per[p]);
    P.area += P.cuspArea;
  });
  const cornerPocket = corners.map((C) =>
    pockets.findIndex((P) => P.mouths.includes(C.mouth))
  );
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
    edge,
    nEdge: nE,
    cutCorner,
  };
}

const boxSize = (pts: Pt[]) => {
  let [xa, ya, xb, yb] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) {
    xa = Math.min(xa, x);
    xb = Math.max(xb, x);
    ya = Math.min(ya, y);
    yb = Math.max(yb, y);
  }
  return Math.max(xb - xa, yb - ya);
};

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
    if (Math.sqrt(rn) < BLEND.tol * bn) {
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

/** The area of {u ≤ ℓ} in a pocket: each triangle's in closed form (its
 *  share is a product of two ratios, each at most 1, so it is exact however
 *  near its corners' values are), and the cusps' (filled at the rate ℓ). */
export function blendArea(P: Pocket, l: number): number {
  const tv = P.tv!;
  let s = 0;
  for (let q = 0; q < tv.length; q += 4) {
    const a = tv[q],
      b = tv[q + 1],
      c = tv[q + 2],
      ar = tv[q + 3];
    if (l >= c) s += ar;
    else if (l <= a) continue;
    else if (l <= b) s += ar * ((l - a) / (b - a)) * ((l - a) / (c - a));
    else s += ar * (1 - ((c - l) / (c - a)) * ((c - l) / (c - b)));
  }
  return s + P.cuspArea * Math.max(0, Math.min(1, l));
}

/** A pocket's level for convexity c: the ℓ at which {u ≤ ℓ} holds share c
 *  of its area (regula falsi, Illinois, on the exact area). */
export function blendLevel(P: Pocket, c: number): number {
  const target = c * P.area;
  let [a, fa, b, fb] = [
    0,
    blendArea(P, 0) - target,
    1,
    blendArea(P, 1) - target,
  ];
  if (fa >= 0) return 0;
  if (fb <= 0) return 1;
  let side = 0;
  for (let it = 0; it < 200 && b - a > 1e-15; it++) {
    const m = (a * fb - b * fa) / (fb - fa);
    const fm = blendArea(P, m) - target;
    if (Math.abs(fm) <= 1e-10 * P.area) return m;
    if (fm < 0) {
      [a, fa] = [m, fm];
      if (side === -1) fb /= 2;
      side = -1;
    } else {
      [b, fb] = [m, fm];
      if (side === 1) fa /= 2;
      side = 1;
    }
  }
  return (a + b) / 2;
}

/**
 * The blend's outline at convexity c in (0, 1): in every pocket the level
 * set of u at that pocket's level, run through its cusps to the mouth ends
 * and joined by the spine's runs on the hull; holes' level sets as their own
 * rings. Outer rings wind positive, holes the other way.
 */
export function blendRings(MB: Blend, c: number, holes: boolean): Pt[][] {
  const {
    X: RX,
    Y: RY,
    U: RU,
    tri: rtri,
    triPocket: rtriPocket,
    edge: redge,
    pockets,
    corners,
    mouths,
  } = MB;
  const lv = pockets.map((P) => blendLevel(P, c));
  const nE = MB.nEdge;
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
      throw new Error("blend: level curve ends off a cut");
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
        if (!pc) throw new Error("blend: no level curve from a corner");
        ring.push(...pc.pts);
        const mb = corners[pc.end].mouth;
        const nm = kept[(order.get(mb)! + 1) % kept.length].k;
        const B = mouths[mb].b,
          A = mouths[nm].a;
        if (B.r !== A.r) throw new Error("blend: spine run across rings");
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
