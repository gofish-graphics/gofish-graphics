// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// ── The grid constraint ──────────────────────────────────────────────────────
//
// A grid is the symmetric 2-D layout: cells partitioned into `numCols` columns
// (a track per column on x) and the implied rows (a track per row on y), every
// cell pinned to its (column, row) track intersection. It's the elaboration
// target for `table` — `layer(cells).relate(grid(...))`.
//
// **The sizing rule.** Per axis, a track's extent is set by ONE rule, the
// (max, +) fold every other operator already uses:
//
//   track claim   = Pwl.max(claims of the cells in that track), or σ
//   grid claim    = Pwl.add(track claims) + gaps
//
// A track whose cells claim nothing is a share of its scope, `fr(1)`: σ. A
// cell that fills a share claims one σ (#493 piece 3), so an all-fill grid
// claims `n·σ + gaps`; content-sized tracks size to their widest cell, and
// are fixed parts beside the pixel gaps. A gap may be a percent of the
// table's room or an `fr` weight, a term of the claim (`resolveGridSpacing`).
// The grid claim is the layer's claim on the axis, composed by its plan as
// any chain's is (`placeByClaims`, `gridTracks`), so the scope it is in
// solves σ for it by the one fit, with the one overflow warning and the one
// fallback. Layout lays each track out at its claim at that σ
// (`gridTracksAt`), and the plan places each cell in the middle of its
// track, from the cells' laid-out sizes.
//
// The grid is interpreted by the Layer after `selectGridConstraint` has
// established that there is at most one grid owner for the layer. `gridSpaces`
// gives the categorical track axes (ORDINAL over columns/rows) for axis
// rendering — a categorical axis cannot simultaneously be a SIZE magnitude, so
// the grid's size claim is consumed at layout time (track resolution) rather than
// reported as the axis space.

import * as Pwl from "../solver/pwl";
import { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import { type ConstraintRef } from "./shared";
import {
  ordinalOver,
  type OrdinalKey,
  UNDEFINED,
  type UnderlyingSpace,
} from "../underlyingSpace";
import type { ScopeRegistry } from "../solver/scopes";
import type { PlacementFactEmitter } from "./placementFacts";
import { numbers, type Arith } from "../solver/arith";
import { printLength, type Length, type LengthValue } from "../length";
import { layOutGap } from "./distribute";

/** One gap between tracks: pixels, a percent of the table's room on its
 *  axis, or an `fr` weight in its scope (#1176 step 6). */
export type TrackGap = number | Length | LengthValue;

export interface GridOptions {
  numCols: number;
  /** [x, y] gaps between tracks; a scalar applies to both. Default 0. */
  spacing?: TrackGap | [TrackGap, TrackGap];
  /** The column and row keys, in order: text, or cells for a binned key
   *  (`ORDINAL_TYPE.cells`). */
  colKeys?: OrdinalKey[];
  rowKeys?: OrdinalKey[];
  /** Grouping fields (table's `by.x`/`by.y`) → the col/row ORDINAL measures, so
   *  the table axes name themselves off their own spaces. */
  colMeasure?: string;
  rowMeasure?: string;
  /** The grouping fields' values have an order (`HasOrder`). */
  colHasOrder?: boolean;
  rowHasOrder?: boolean;
}

export interface GridConstraint {
  type: "grid";
  numCols: number;
  /** The gap between tracks on x and on y. */
  spacing: [TrackGap, TrackGap];
  /** Per axis, a length gap laid out in the table's room by its layer's
   *  claim walk (`resolveGridSpacing`), as a value in σ. */
  gaps?: [Pwl.Value | undefined, Pwl.Value | undefined];
  colKeys?: OrdinalKey[];
  rowKeys?: OrdinalKey[];
  colMeasure?: string;
  rowMeasure?: string;
  colHasOrder?: boolean;
  rowHasOrder?: boolean;
  /** Cells in row-major order (index i → column i % numCols, row ⌊i/numCols⌋). */
  children: ConstraintRef[];
}

export const createGridConstraint = (
  options: GridOptions,
  children: ConstraintRef[]
): GridConstraint => {
  const sp = options.spacing ?? 0;
  return {
    type: "grid",
    numCols: options.numCols,
    spacing: (Array.isArray(sp) ? sp : [sp, sp]) as [TrackGap, TrackGap],
    colKeys: options.colKeys,
    rowKeys: options.rowKeys,
    colMeasure: options.colMeasure,
    rowMeasure: options.rowMeasure,
    colHasOrder: options.colHasOrder,
    rowHasOrder: options.rowHasOrder,
    children,
  };
};

export const isGridConstraint = (c: { type: string }): c is GridConstraint =>
  c.type === "grid";

/** Lay the length gaps of `node`'s grids out in its room on each axis
 *  (`layOutGap`, as a chain's spacing is): a percent of its room and an
 *  `fr` weight, each a value in σ. */
export function resolveGridSpacing(node: GoFishNode): void {
  for (const c of node.constraints) {
    if (!isGridConstraint(c)) continue;
    c.gaps = c.spacing.map((g, axis) =>
      typeof g === "number"
        ? undefined
        : layOutGap(node, axis as 0 | 1, g, `table's spacing ${printLength(g)}`)
    ) as [Pwl.Value | undefined, Pwl.Value | undefined];
  }
}

/** The gap between `c`'s tracks on `axis`, a value in σ. */
export const trackGap = (c: GridConstraint, axis: 0 | 1): Pwl.Value => {
  const g = c.spacing[axis];
  if (typeof g === "number") return Pwl.constant(g);
  const v = c.gaps?.[axis];
  if (v === undefined)
    throw new Error(
      `[gofish] table: spacing ${printLength(g)} was read before its layer ` +
        `laid it out in its room.`
    );
  return v;
};

const numRowsOf = (c: GridConstraint): number =>
  Math.ceil(c.children.length / c.numCols);

/** The resolved geometry of one axis's tracks: each track's start (low edge, in
 *  the layer's local pixel frame) and extent. `starts[i] + extents[i]/2` is the
 *  center a cell in track `i` pins to. */
export type TrackLayout<T = number> = { starts: T[]; extents: T[] };

/** A cell's size claim on `axis`: the width of its claim, whatever it is (a
 *  magnitude, a pixel size of its own, or one share σ for a cell that fills
 *  a share), or undefined when it has none. */
const cellClaim = (
  cell: GoFishAST | undefined,
  axis: 0 | 1
): Pwl.Value | undefined =>
  cell instanceof GoFishNode ? cell.resolveExtent()[axis]?.width : undefined;

/**
 * The tracks of `c` on `axis` (columns on x, rows on y): each track's extent
 * is the largest size of its cells (`sizes`, by cell index, undefined for a
 * cell with none), or `share` where no cell has one, a track its content
 * does not size, which is one share of its scope (`fr(1)`). The tracks are
 * laid end to end with `gap` between them. The one track rule: the claim
 * walk reads it in σ (`placeByClaims`), and layout at the σ it lays out at
 * ({@link gridTracksAt}).
 */
export function gridTracks<T>(
  A: Arith<T>,
  c: GridConstraint,
  axis: 0 | 1,
  sizes: readonly (T | undefined)[],
  gap: T,
  share: T
): TrackLayout<T> {
  const numRows = numRowsOf(c);
  const [n, across] = axis === 0 ? [c.numCols, numRows] : [numRows, c.numCols];
  const cellAt = (track: number, k: number) =>
    axis === 0 ? k * c.numCols + track : track * c.numCols + k;
  const extents = Array.from({ length: n }, (_, track) => {
    const own = Array.from(
      { length: across },
      (_, k) => sizes[cellAt(track, k)]
    ).filter((v): v is T => v !== undefined);
    return own.length > 0 ? A.max([A.zero, ...own]) : share;
  });
  return layoutTrack(A, extents, gap);
}

/** Both axes' tracks of `c` laid out at the σ its layer hands its cells
 *  (`sigmas`): each cell's claim at σ ({@link gridTracks}). A claim that no
 *  σ solves has no part that grows with σ, so it is the same at any σ, and
 *  is read at 0. Layout proposes each cell its track's extent. */
export function gridTracksAt(
  c: GridConstraint,
  cells: readonly GoFishAST[],
  sigmas: readonly [number | undefined, number | undefined]
): [TrackLayout, TrackLayout] {
  const at = (axis: 0 | 1): TrackLayout => {
    const s = sigmas[axis];
    const sigma = s !== undefined && Number.isFinite(s) ? s : 0;
    const sizes = cells.map((cell) => {
      const claim = cellClaim(cell, axis);
      return claim === undefined ? undefined : Pwl.at(claim, sigma);
    });
    return gridTracks(
      numbers,
      c,
      axis,
      sizes,
      Pwl.at(trackGap(c, axis), sigma),
      sigma
    );
  };
  return [at(0), at(1)];
}

/** Lay out a run of track extents into `{ starts, extents }`: cumulative starts
 *  with `gap` reserved between adjacent tracks. */
function layoutTrack<T>(A: Arith<T>, extents: T[], gap: T): TrackLayout<T> {
  const starts: T[] = [];
  let cursor = A.zero;
  for (const e of extents) {
    starts.push(cursor);
    cursor = A.add(cursor, A.add(e, gap));
  }
  return { starts, extents };
}

/** Per-cell proposed size `[cellW, cellH]`, keyed by cell name: each cell is
 *  proposed its (column, row) track's extent. A fill cell fills that extent; a
 *  claim cell keeps its own (equal or smaller) size and is centered in it. */
export function gridCellSizeByName(
  c: GridConstraint,
  tracks: [TrackLayout, TrackLayout]
): Map<string, [number, number]> {
  const [cols, rows] = tracks;
  const out = new Map<string, [number, number]>();
  c.children.forEach((child, index) => {
    if (child === undefined) return;
    const col = index % c.numCols;
    const row = Math.floor(index / c.numCols);
    out.set(child.name, [cols.extents[col], rows.extents[row]]);
  });
  return out;
}

export type GridCellPlacement<T = number> = {
  child: ConstraintRef;
  center: [T, T];
};

/** Equal box-division tracks: every column/row gets the same slice of `size`.
 *  The fallback for `gridCellPlacements` when no resolved tracks are handed in. */
function equalTracks<T>(
  A: Arith<T>,
  c: GridConstraint,
  size: readonly [T, T]
): [TrackLayout<T>, TrackLayout<T>] {
  const numRows = numRowsOf(c);
  const track = (axis: 0 | 1, n: number) => {
    const gap = A.fromValue(trackGap(c, axis));
    const extent = A.scale(1 / n, A.sub(size[axis], A.scale(n - 1, gap)));
    return layoutTrack(
      A,
      Array.from({ length: n }, () => extent),
      gap
    );
  };
  return [track(0, c.numCols), track(1, numRows)];
}

/** Cell centers from resolved tracks — or, when `tracks` is omitted, the equal
 *  box-division fallback used by the direct-solver tests. */
export function gridCellPlacements<T>(
  A: Arith<T>,
  c: GridConstraint,
  size: readonly [T, T],
  tracks?: [TrackLayout<T>, TrackLayout<T>]
): GridCellPlacement<T>[] {
  const [cols, rows] = tracks ?? equalTracks(A, c, size);
  return c.children.map((child, index) => {
    const column = index % c.numCols;
    const row = Math.floor(index / c.numCols);
    return {
      child,
      center: [
        A.add(cols.starts[column], A.scale(0.5, cols.extents[column])),
        A.add(rows.starts[row], A.scale(0.5, rows.extents[row])),
      ],
    };
  });
}

/** Emit the per-cell center pins for a grid. A cell whose center on an axis is
 *  claimed by a `position` pin is skipped on that axis — the explicit pin
 *  overrides the track centering (the authoritative-pin pattern). */
export function lowerGridPlacement<T>(
  A: Arith<T>,
  c: GridConstraint,
  owner: string,
  size: readonly [T, T],
  emitter: PlacementFactEmitter<T>,
  tracks?: [TrackLayout<T>, TrackLayout<T>],
  pinnedByPosition?: Map<string, Set<0 | 1>>
): void {
  for (const { child, center } of gridCellPlacements(A, c, size, tracks)) {
    const overridden = pinnedByPosition?.get(child.name);
    if (!overridden?.has(0))
      emitter.pin({
        axis: "x",
        target: { name: child.name, anchor: "middle" },
        value: center[0],
        owner,
      });
    if (!overridden?.has(1))
      emitter.pin({
        axis: "y",
        target: { name: child.name, anchor: "middle" },
        value: center[1],
        owner,
      });
  }
}

/**
 * A grid's axes are categorical: ORDINAL over the columns (x) and rows (y).
 * Keys come from `colKeys`/`rowKeys`, else the representative cells' keys —
 * first-row cells for columns, first-column cells for rows. `cells` are the
 * layer's children in row-major order.
 */
export function gridSpaces(
  c: GridConstraint,
  cells: GoFishAST[]
): [UnderlyingSpace, UnderlyingSpace] {
  const keyAt = (i: number): OrdinalKey | undefined =>
    cells[i] instanceof GoFishNode ? (cells[i] as GoFishNode).key : undefined;
  const colKeys =
    c.colKeys && c.colKeys.length > 0
      ? c.colKeys
      : Array.from({ length: c.numCols }, (_, j) => keyAt(j)).filter(
          (k): k is string => k !== undefined
        );
  const rowKeys =
    c.rowKeys && c.rowKeys.length > 0
      ? c.rowKeys
      : Array.from({ length: numRowsOf(c) }, (_, r) =>
          keyAt(r * c.numCols)
        ).filter((k): k is OrdinalKey => k !== undefined);
  return [
    colKeys.length > 0
      ? ordinalOver(colKeys, c.colMeasure, undefined, c.colHasOrder)
      : UNDEFINED,
    rowKeys.length > 0
      ? ordinalOver(rowKeys, c.rowMeasure, undefined, c.rowHasOrder)
      : UNDEFINED,
  ];
}
