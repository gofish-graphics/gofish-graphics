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
import { describe } from "./calendar";
import { numericRange, RegionCell, round12 } from "./cells";
import { ringExtent } from "./geometry/box";

/** The two columns a key reads, one per axis of the plane. */
export type PlaneFields = { readonly x: string; readonly y: string };

/**
 * One cell of the plane: its id, its outline (a closed polygon in data
 * units, `[x, y]` per corner, the last corner not repeated), and the box that
 * holds the outline. A cell stands for itself as a group key: `String(cell)`
 * is its id.
 */
export class PolygonCell extends RegionCell {
  /** The box that holds the outline: `[min, max]` on x and on y. */
  readonly box: {
    readonly x: readonly [number, number];
    readonly y: readonly [number, number];
  };

  constructor(
    /** The cell's identity: a hexagon's grid coordinates `"q,r"`, or a
     *  Voronoi cell's seed index. */
    readonly id: string,
    readonly outline: readonly Point[]
  ) {
    super();
    const { minX, maxX, minY, maxY } = ringExtent(outline);
    this.box = { x: [minX, maxX], y: [minY, maxY] };
  }

  get label(): undefined {
    return undefined;
  }

  /** The box on `axis`. */
  span(axis: 0 | 1): readonly [number, number] {
    return axis === 0 ? this.box.x : this.box.y;
  }
}

/** The cells of a plane over a domain, and the cell each point falls in. */
export type PolygonCells = {
  readonly cells: readonly PolygonCell[];
  /** The cell the point `(x, y)` falls in, or undefined for a point outside
   *  the cells. */
  cellOf(x: number, y: number): PolygonCell | undefined;
};

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

/** The two slanted edge normals of the unit hexagon, at 60 and 120 degrees
 *  (its third, at 0 degrees, is the box's u axis). */
const SLANTED_NORMALS: readonly Point[] = [60, 120].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)] as const;
});

/** The CLOSED box `[u0, u1] × [v0, v1]` on the unit grid, with its
 *  projection `[lo, hi]` onto each of {@link SLANTED_NORMALS}, for
 *  {@link hexMeetsBox}. */
type UnitBox = {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  slanted: readonly (readonly [number, number])[];
};

function unitBox(u0: number, u1: number, v0: number, v1: number): UnitBox {
  const slanted = SLANTED_NORMALS.map((n) => {
    const at = (p: Point) => p[0] * n[0] + p[1] * n[1];
    const corners = [at([u0, v0]), at([u0, v1]), at([u1, v0]), at([u1, v1])];
    return [Math.min(...corners), Math.max(...corners)] as const;
  });
  return { u0, u1, v0, v1, slanted };
}

/** Whether the OPEN unit hexagon centered at `c` meets the CLOSED box `b`
 *  (both convex, so the axes of their edges decide: the box's two, and the
 *  hexagon's three edge normals at 0°, 60° and 120°). An open hexagon only
 *  touching the box along an edge does not meet it. */
function hexMeetsBox(c: Point, b: UnitBox): boolean {
  const apothem = SQRT3 / 2;
  // The box's own axes: the hexagon spans its center ± apothem on u (its
  // sides are vertical) and ± 1 on v (its top and bottom are corners).
  if (!(c[0] - apothem < b.u1 && b.u0 < c[0] + apothem)) return false;
  if (!(c[1] - 1 < b.v1 && b.v0 < c[1] + 1)) return false;
  for (let i = 0; i < SLANTED_NORMALS.length; i++) {
    const n = SLANTED_NORMALS[i];
    const [lo, hi] = b.slanted[i];
    const mid = c[0] * n[0] + c[1] * n[1];
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
  const xRange = numericRange(xs, where, `the column "${fields.x}"`);
  const yRange = numericRange(ys, where, `the column "${fields.y}"`);
  if (xRange === undefined || yRange === undefined)
    return { cells: [], cellOf: () => undefined };
  // The cells, by grid coordinates.
  const byId = new Map<string, PolygonCell>();
  const add = (q: number, r: number): boolean => {
    const id = `${q},${r}`;
    if (byId.has(id)) return false;
    const [cu, cv] = hexCenter(q, r);
    byId.set(
      id,
      new PolygonCell(
        id,
        UNIT_CORNERS.map(([u, v]) => [
          round12((cu + u) * rx),
          round12((cv + v) * ry),
        ])
      )
    );
    return true;
  };

  // The box of the domain on the unit grid.
  const box = unitBox(
    xRange[0] / rx,
    xRange[1] / rx,
    yRange[0] / ry,
    yRange[1] / ry
  );
  // Rows of hexagons are 1.5 apart on v; along a row they are √3 apart on u,
  // and row r is shifted by r/2. Scan one hexagon past the box each way, rows
  // from the bottom, each from the left: no order is meant, but the draw
  // order is fixed.
  const rMin = Math.floor(box.v0 / 1.5) - 1;
  const rMax = Math.ceil(box.v1 / 1.5) + 1;
  for (let r = rMin; r <= rMax; r++) {
    const qMin = Math.floor(box.u0 / SQRT3 - r / 2) - 1;
    const qMax = Math.ceil(box.u1 / SQRT3 - r / 2) + 1;
    for (let q = qMin; q <= qMax; q++) {
      if (hexMeetsBox(hexCenter(q, r), box)) add(unsign(q), unsign(r));
    }
  }
  // A point inside the box is in a hexagon that meets it. A point on the
  // box's edge may fall in a hexagon that only touches the box: add those.
  let added = false;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = ys[i];
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (
      x !== xRange[0] &&
      x !== xRange[1] &&
      y !== yRange[0] &&
      y !== yRange[1]
    )
      continue;
    const [q, r] = hexAt(x / rx, y / ry);
    if (add(q, r)) added = true;
  }
  const cellOf = (x: number, y: number): PolygonCell | undefined => {
    const [q, r] = hexAt(x / rx, y / ry);
    return byId.get(`${q},${r}`);
  };
  if (!added) return { cells: [...byId.values()], cellOf };
  // Back in draw order: by row, then along it.
  const coords = (c: PolygonCell) => c.id.split(",").map(Number);
  const cells = [...byId.values()].sort((a, b) => {
    const [qa, ra] = coords(a);
    const [qb, rb] = coords(b);
    return ra - rb || qa - qb;
  });
  return { cells, cellOf };
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
  // Each seed's point (the first seed at each point), and the box that
  // holds the seeds.
  const points: Point[] = [];
  const seen = new Set<string>();
  let [xLo, xHi, yLo, yHi] = [Infinity, -Infinity, Infinity, -Infinity];
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
    xLo = Math.min(xLo, sx);
    xHi = Math.max(xHi, sx);
    yLo = Math.min(yLo, sy);
    yHi = Math.max(yHi, sy);
  });
  // The box that holds the seeds and the domain.
  const xData = numericRange(xs, where, `the column "${fields.x}"`);
  const yData = numericRange(ys, where, `the column "${fields.y}"`);
  const xRange = [
    Math.min(xLo, xData?.[0] ?? Infinity),
    Math.max(xHi, xData?.[1] ?? -Infinity),
  ];
  const yRange = [
    Math.min(yLo, yData?.[0] ?? Infinity),
    Math.max(yHi, yData?.[1] ?? -Infinity),
  ];
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
      .map(([x, y]) => [round12(x), round12(y)] as const);
    return new PolygonCell(String(i), outline);
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
