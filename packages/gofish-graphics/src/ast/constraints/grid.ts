// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// ── The grid constraint ──────────────────────────────────────────────────────
//
// A grid is the symmetric 2-D layout: cells partitioned into `numCols` columns
// (a track per column on x) and the implied rows (a track per row on y), every
// cell filling its (column, row) track intersection. It's the elaboration
// target for `table` — `layer(cells).constrain(grid(...))`.
//
// The per-axis size equation is the flex-track form from layout-synthesis.md:
//
//   W = numCols · cellW + sx·(numCols−1)        →  cellW = (W − sx·(numCols−1)) / numCols
//   H = numRows · cellH + sy·(numRows−1)        →  cellH = (H − sy·(numRows−1)) / numRows
//
// For a uniform grid every track is one flex unit, so solving the equation is
// the box-division `cellExtent` below — the table is the flex scope root (it
// solves its tracks against its own box; nothing bubbles). The general
// Σ-over-max-of-cells (content-sized tracks, variable flex) is a later
// generalization; v1 is equal tracks with the cells filling them.
//
// The grid is interpreted by the Layer: `gridSpaces` gives the ORDINAL axes
// (categorical columns/rows, for axis rendering), the Layer's budget sizes each
// cell to `cellExtent`, and `placementSolver.ts` centers each cell in its track.

import { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import { type ConstraintRef } from "./shared";
import { sliceExtent } from "./folds";
import { ORDINAL, UNDEFINED, type UnderlyingSpace } from "../underlyingSpace";

export interface GridOptions {
  numCols: number;
  /** [x, y] gaps between tracks; a scalar applies to both. Default 0. */
  spacing?: number | [number, number];
  colKeys?: string[];
  rowKeys?: string[];
}

export interface GridConstraint {
  type: "grid";
  numCols: number;
  xSpacing: number;
  ySpacing: number;
  colKeys?: string[];
  rowKeys?: string[];
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
    xSpacing: Array.isArray(sp) ? sp[0] : sp,
    ySpacing: Array.isArray(sp) ? sp[1] : sp,
    colKeys: options.colKeys,
    rowKeys: options.rowKeys,
    children,
  };
};

export const isGridConstraint = (c: { type: string }): c is GridConstraint =>
  c.type === "grid";

const numRowsOf = (c: GridConstraint): number =>
  Math.ceil(c.children.length / c.numCols);

/** Per-cell proposed size `[cellW, cellH]` for a grid laid into `size` — each
 *  axis split into equal flex tracks via the shared `sliceExtent` (folds.ts). */
export const gridCellSize = (
  c: GridConstraint,
  size: readonly [number, number]
): [number, number] => [
  sliceExtent(size[0], c.xSpacing, c.numCols),
  sliceExtent(size[1], c.ySpacing, numRowsOf(c)),
];

/**
 * A grid's axes are categorical: ORDINAL over the columns (x) and rows (y).
 * Keys come from `colKeys`/`rowKeys`, else the representative cells' keys —
 * first-row cells for columns, first-column cells for rows (matching the legacy
 * table). `cells` are the layer's children in row-major order.
 */
export function gridSpaces(
  c: GridConstraint,
  cells: GoFishAST[]
): [UnderlyingSpace, UnderlyingSpace] {
  const keyAt = (i: number): string | undefined =>
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
        ).filter((k): k is string => k !== undefined);
  return [
    colKeys.length > 0 ? ORDINAL(colKeys) : UNDEFINED,
    rowKeys.length > 0 ? ORDINAL(rowKeys) : UNDEFINED,
  ];
}
