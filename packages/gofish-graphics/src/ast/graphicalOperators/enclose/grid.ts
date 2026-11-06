// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * Rings' segments on grids, for the outlines' exact distance and winding
 * queries: the blend's field (`blend.ts`), the keep-out cut (`separate.ts`)
 * and the smoothing (`smooth.ts`).
 */
import type { Pt } from "./prims";

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

  /** The distance from (x, y) to the grid's nearest segment. */
  nearest(x: number, y: number): number {
    return this.capped(x, y, Infinity);
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
