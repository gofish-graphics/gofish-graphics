// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

/**
 * Polygon cells (#1059, #48): what `struct({ x, y }).bin(b)` turns a row into,
 * for a `Bin` strategy `b` (families/bin.ts).
 *
 * A cell system of the plane divides the plane of two fields into cells that
 * do not overlap. A {@link PolygonCell} is one cell: an id, its outline (a
 * polygon in data units, `[x, y]` per corner), and the box that holds the
 * outline. Unlike a 1D {@link Cell} (cells.ts), a polygon cell has no order.
 *
 * As in 1D, the cells are defined over a DOMAIN, the chart's data
 * (`domainRows`, schema.ts), not over the rows of one group, so every group
 * of a split sees the same cells and an empty cell is kept:
 *
 *  - `Bin.hex({ radius })`: the hexagons of a fixed grid that cover the box
 *    of the two columns' values (each column's range, as the 1D domain is).
 *  - `Bin.voronoi({ seeds })`: one cell per seed, clipped to the box that
 *    holds the columns' values and the seeds, so every seed has a cell.
 */
import { Delaunay } from "d3-delaunay";
import type { Frontend } from "gofish-ir";
import type { Point } from "./geometry";

/** The two columns a key reads, one per axis of the plane. */
export type PlaneFields = { readonly x: string; readonly y: string };

/**
 * One cell of the plane: its id, its outline (a closed polygon in data
 * units, `[x, y]` per corner, the last corner not repeated), and the box that
 * holds the outline. A cell stands for itself as a group key: `String(cell)`
 * is its id.
 */
export class PolygonCell {
  /** The box that holds the outline: `[min, max]` on x and on y. */
  readonly box: {
    readonly x: readonly [number, number];
    readonly y: readonly [number, number];
  };

  constructor(
    /** The cell's identity: a hexagon's grid coordinates `"q,r"`, or a
     *  Voronoi cell's seed index. */
    readonly id: string,
    readonly outline: readonly Point[],
    /** For a Voronoi cell, the seed row whose cell it is. */
    readonly seed?: unknown
  ) {
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    this.box = {
      x: [Math.min(...xs), Math.max(...xs)],
      y: [Math.min(...ys), Math.max(...ys)],
    };
  }

  toString(): string {
    return this.id;
  }
}

/** The cells of a plane over a domain, and the cell each point falls in. */
export type PolygonCells = {
  readonly cells: readonly PolygonCell[];
  /** The cell the point `(x, y)` falls in, or undefined for a point outside
   *  the cells. */
  cellOf(x: number, y: number): PolygonCell | undefined;
};

/** `x` rounded to 12 significant digits, as 1D cell edges are (cells.ts). */
const round = (x: number): number => +x.toPrecision(12);

/** `v` as an error message shows it. */
const describe = (v: unknown): string => {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};

/** The `[min, max]` of a column's values (missing values skipped), or
 *  undefined when it has none. A value that is not a number is an error. */
function range(
  values: readonly unknown[],
  name: string,
  where: string
): [number, number] | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null) continue;
    if (typeof v !== "number" || Number.isNaN(v))
      throw new Error(
        `${where}: the column "${name}" must hold numbers, but it has the ` +
          `value ${describe(v)}.`
      );
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo > hi ? undefined : [lo, hi];
}

// ---------------------------------------------------------------------------
// Hexagons
// ---------------------------------------------------------------------------

const SQRT3 = Math.sqrt(3);

/** The corners of the unit pointy-top hexagon (center to corner 1), from the
 *  top corner, clockwise when y grows upward. */
const UNIT_CORNERS: readonly Point[] = [
  [0, 1],
  [SQRT3 / 2, 0.5],
  [SQRT3 / 2, -0.5],
  [0, -1],
  [-SQRT3 / 2, -0.5],
  [-SQRT3 / 2, 0.5],
];

/** `-0` as `0`, so a grid coordinate prints as "0". */
const unsign = (n: number): number => (n === 0 ? 0 : n);

/**
 * The grid coordinates `(q, r)` of the hexagon a point falls in, on the unit
 * pointy-top grid (in units of the radius): axial coordinates, as the
 * hexagon whose center is nearest (cube rounding). A point on an edge
 * between two hexagons goes to one of them, the same one every time.
 */
export function hexAt(u: number, v: number): [number, number] {
  const fq = (SQRT3 / 3) * u - v / 3;
  const fr = (2 / 3) * v;
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [unsign(q), unsign(r)];
}

/** The center of the hexagon `(q, r)` on the unit grid. */
export const hexCenter = (q: number, r: number): Point => [
  SQRT3 * (q + r / 2),
  1.5 * r,
];

/** Whether the OPEN unit hexagon centered at `c` meets the CLOSED box
 *  `[u0, u1] × [v0, v1]` (both convex, so the axes of their edges decide:
 *  the box's two, and the hexagon's three edge normals at 0°, 60° and 120°).
 *  An open hexagon only touching the box along an edge does not meet it. */
function hexMeetsBox(
  c: Point,
  u0: number,
  u1: number,
  v0: number,
  v1: number
): boolean {
  const apothem = SQRT3 / 2;
  // The box's own axes: the hexagon spans its center ± apothem on u (its
  // sides are vertical) and ± 1 on v (its top and bottom are corners).
  if (!(c[0] - apothem < u1 && u0 < c[0] + apothem)) return false;
  if (!(c[1] - 1 < v1 && v0 < c[1] + 1)) return false;
  for (const deg of [60, 120]) {
    const a = (deg * Math.PI) / 180;
    const n: Point = [Math.cos(a), Math.sin(a)];
    const at = (p: Point) => p[0] * n[0] + p[1] * n[1];
    const corners = [at([u0, v0]), at([u0, v1]), at([u1, v0]), at([u1, v1])];
    const lo = Math.min(...corners);
    const hi = Math.max(...corners);
    const mid = at(c);
    if (!(mid - apothem < hi && lo < mid + apothem)) return false;
  }
  return true;
}

/** A hex radius per axis: a number (both axes) or `{ x, y }`. */
const radii = (
  radius: Extract<Frontend.BinIR, { kind: "hex" }>["radius"]
): [number, number] =>
  typeof radius === "number" ? [radius, radius] : [radius.x, radius.y];

/**
 * The hexagons of `Bin.hex({ radius })` over the domain `xs × ys` (every value
 * each column has in the chart's data). The grid is pointy-top, with a
 * hexagon centered on (0, 0); the radius is per axis, so a hexagon is the
 * unit hexagon scaled by the x radius on x and the y radius on y.
 *
 * The cells are every hexagon whose inside meets the box of the domain, plus
 * the hexagon of each domain point (a point on the box's edge may fall in a
 * hexagon that only touches the box). An empty domain has no cells.
 */
export function hexCells(
  bin: Extract<Frontend.BinIR, { kind: "hex" }>,
  fields: PlaneFields,
  xs: readonly unknown[],
  ys: readonly unknown[],
  where: string
): PolygonCells {
  const [rx, ry] = radii(bin.radius);
  const xRange = range(xs, fields.x, where);
  const yRange = range(ys, fields.y, where);
  const byId = new Map<string, PolygonCell>();
  const cellAt = (q: number, r: number): PolygonCell => {
    const id = `${q},${r}`;
    let cell = byId.get(id);
    if (cell === undefined) {
      const [cu, cv] = hexCenter(q, r);
      cell = new PolygonCell(
        id,
        UNIT_CORNERS.map(([u, v]) => [
          round((cu + u) * rx),
          round((cv + v) * ry),
        ])
      );
      byId.set(id, cell);
    }
    return cell;
  };
  const cellOf = (x: number, y: number): PolygonCell => {
    const [q, r] = hexAt(x / rx, y / ry);
    return cellAt(q, r);
  };
  if (xRange === undefined || yRange === undefined)
    return { cells: [], cellOf: () => undefined };

  // The box of the domain on the unit grid.
  const [u0, u1] = [xRange[0] / rx, xRange[1] / rx];
  const [v0, v1] = [yRange[0] / ry, yRange[1] / ry];
  const keep = new Set<PolygonCell>();
  // Rows of hexagons are 1.5 apart on v; along a row they are √3 apart on u,
  // and row r is shifted by r/2. Scan one hexagon past the box each way.
  const rMin = Math.floor(v0 / 1.5) - 1;
  const rMax = Math.ceil(v1 / 1.5) + 1;
  for (let r = rMin; r <= rMax; r++) {
    const qMin = Math.floor(u0 / SQRT3 - r / 2) - 1;
    const qMax = Math.ceil(u1 / SQRT3 - r / 2) + 1;
    for (let q = qMin; q <= qMax; q++) {
      if (hexMeetsBox(hexCenter(q, r), u0, u1, v0, v1))
        keep.add(cellAt(unsign(q), unsign(r)));
    }
  }
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = ys[i];
    if (typeof x === "number" && typeof y === "number") keep.add(cellOf(x, y));
  }
  // Rows from the bottom, each from the left: no order is meant, but the
  // draw order is fixed.
  const coords = (c: PolygonCell) => c.id.split(",").map(Number);
  const cells = [...keep].sort((a, b) => {
    const [qa, ra] = coords(a);
    const [qb, rb] = coords(b);
    return ra - rb || qa - qb;
  });
  const kept = new Set(cells);
  return {
    cells,
    cellOf: (x, y) => {
      const c = cellOf(x, y);
      return kept.has(c) ? c : undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// Voronoi cells
// ---------------------------------------------------------------------------

/**
 * The cells of `Bin.voronoi({ seeds })`: one per seed, the points nearer to
 * it than to any other seed, clipped to the box that holds the domain
 * (`xs × ys`) and the seeds, so every seed has a cell. Seeds at the same point
 * share one cell, that of the first. A point goes to its nearest seed.
 *
 * Built with d3-delaunay (a Delaunay triangulation by Delaunator, and its
 * dual Voronoi diagram clipped to a box).
 */
export function voronoiCells(
  bin: Extract<Frontend.BinIR, { kind: "voronoi" }>,
  fields: PlaneFields,
  xs: readonly unknown[],
  ys: readonly unknown[],
  where: string
): PolygonCells {
  const seeds = bin.seeds;
  if (!Array.isArray(seeds) || seeds.length === 0)
    throw new Error(`${where}: Bin.voronoi needs at least one seed.`);
  // Each seed's point, and the first seed at each point.
  const points: Point[] = [];
  const rows: unknown[] = [];
  const seen = new Set<string>();
  seeds.forEach((row, i) => {
    const sx = (row as Record<string, unknown>)?.[fields.x];
    const sy = (row as Record<string, unknown>)?.[fields.y];
    if (
      typeof sx !== "number" ||
      typeof sy !== "number" ||
      !Number.isFinite(sx) ||
      !Number.isFinite(sy)
    )
      throw new Error(
        `${where}: seed ${i} must have numbers in "${fields.x}" and ` +
          `"${fields.y}", the fields of the key; got ${describe(row)}.`
      );
    const key = `${sx},${sy}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push([sx, sy]);
    rows.push(row);
  });
  const xRange = range([...xs, ...points.map((p) => p[0])], fields.x, where)!;
  const yRange = range([...ys, ...points.map((p) => p[1])], fields.y, where)!;
  if (xRange[0] === xRange[1] || yRange[0] === yRange[1])
    throw new Error(
      `${where}: Bin.voronoi needs the data and seeds to spread out on both ` +
        `"${fields.x}" and "${fields.y}"; they lie on one line, so the cells ` +
        `would have no area.`
    );
  const delaunay = Delaunay.from(points as [number, number][]);
  const voronoi = delaunay.voronoi([
    xRange[0],
    yRange[0],
    xRange[1],
    yRange[1],
  ]);
  const cells = points.map((_, i) => {
    const ring = voronoi.cellPolygon(i);
    if (ring == null)
      throw new Error(`${where}: seed ${i} has no Voronoi cell.`);
    // The ring repeats its first corner at its end.
    const outline = ring
      .slice(0, -1)
      .map(([x, y]) => [round(x), round(y)] as const);
    return new PolygonCell(String(i), outline, rows[i]);
  });
  let last = 0;
  return {
    cells,
    cellOf: (x, y) => {
      if (x < xRange[0] || x > xRange[1] || y < yRange[0] || y > yRange[1])
        return undefined;
      last = delaunay.find(x, y, last);
      return cells[last];
    },
  };
}

/** The cells of `bin` (a `Bin` strategy) over the domain `xs × ys`. */
export function planeCells(
  bin: Frontend.BinIR,
  fields: PlaneFields,
  xs: readonly unknown[],
  ys: readonly unknown[],
  where: string
): PolygonCells {
  return bin.kind === "hex"
    ? hexCells(bin, fields, xs, ys, where)
    : voronoiCells(bin, fields, xs, ys, where);
}
