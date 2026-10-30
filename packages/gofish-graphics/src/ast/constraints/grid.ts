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
//   track claim   = Pwl.max(boxes of the cells in that track), or σ
//   grid claim    = Pwl.add(track claims) + gaps
//
// A track whose cells claim nothing is a share of its scope, `fr(1)`: σ. A
// cell that fills a share claims one σ (#493 piece 3), so an all-fill grid
// claims `n·σ + gaps`; content-sized tracks size to their widest cell, and
// are fixed parts beside the pixel gaps. A gap may be a percent of the
// table's room or an `fr` weight, a term of the claim, which the layer
// reads where it lays the tracks out (`GoFishNode.gapOf`).
// The grid claim is the layer's claim on the axis, composed by its plan as
// any chain's is (`placeByClaims`, `gridTracks`), so the scope it is in
// solves σ for it by the one fit, with the one overflow warning and the one
// fallback. A track is sized by its cells' boxes, both in the claim walk
// and in layout: what a cell draws past its box (an outline, a label, an
// offset part) overhangs its track. Layout proposes each cell its track's
// extent at that σ, from the same boxes, the forms of the layer's plan
// (`cellBoxesOf`, `gridCellSizesAt`), and the plan places each cell in
// the middle of its track, from the cells' laid-out sizes. Where the layer
// has no σ on an axis (an unsized root, where shares have no room), a
// track its cells' boxes do not size has no extent to propose, and its
// cells keep their default size there, as a spread's bands do.
//
// Every reader finds a cell through the grid's own refs (`CellOf`), in the
// grid's row-major order, never by the layer's child order.
//
// The grid is interpreted by the Layer after `selectGridConstraint` has
// established that there is at most one grid owner for the layer. `gridSpaces`
// gives the categorical track axes (ORDINAL over columns/rows) for axis
// rendering: the layer reports those as its type, and its size claim as its
// claim.

import * as Pwl from "../solver/pwl";
import { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import { buildNameIndex, type ConstraintRef } from "./shared";
import {
  ordinalOver,
  type OrdinalKey,
  UNDEFINED,
  type UnderlyingSpace,
} from "../underlyingSpace";
import type { PlacementFactEmitter } from "./placementFacts";
import { numbers, type Arith } from "../solver/arith";
import type { Gap } from "./gap";

export interface GridOptions {
  numCols: number;
  /** [x, y] gaps between tracks; a scalar applies to both. Default 0. */
  spacing?: Gap | [Gap, Gap];
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
  /** The gap between tracks on x and on y: pixels, or a length the table
   *  lays out in its room (`GoFishNode.gapOf`). */
  spacing: [Gap, Gap];
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
    spacing: (Array.isArray(sp) ? sp : [sp, sp]) as [Gap, Gap],
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

const numRowsOf = (c: GridConstraint): number =>
  Math.ceil(c.children.length / c.numCols);

/** The layer's child a grid ref names, or undefined for none. Every reader
 *  of a grid's cells finds them this way, by the grid's own refs. */
export type CellOf = (ref: ConstraintRef) => GoFishAST | undefined;

/** {@link CellOf} over a layer's `children`, by their names. */
export const cellsByName = (children: readonly GoFishAST[]): CellOf => {
  const index = buildNameIndex(children);
  return (ref) => {
    const i = index.get(ref.name);
    return i === undefined ? undefined : children[i];
  };
};

/** The number of tracks of `c` on `axis`: its columns on x, its rows on y. */
const trackCount = (c: GridConstraint, axis: 0 | 1): number =>
  axis === 0 ? c.numCols : numRowsOf(c);

/** The indices into `c.children` of the cells in track `track` on `axis`. */
const cellsOfTrack = (
  c: GridConstraint,
  axis: 0 | 1,
  track: number
): number[] => {
  const across = trackCount(c, axis === 0 ? 1 : 0);
  return Array.from({ length: across }, (_, k) =>
    axis === 0 ? k * c.numCols + track : track * c.numCols + k
  ).filter((i) => i < c.children.length);
};

/** The resolved geometry of one axis's tracks: each track's start (low edge, in
 *  the layer's local pixel frame) and extent. `starts[i] + extents[i]/2` is the
 *  center a cell in track `i` pins to. */
export type TrackLayout<T = number> = { starts: T[]; extents: T[] };

/** A grid's resolved tracks on x (columns) and y (rows), where known. */
export type GridTracks<T = number> = readonly [
  TrackLayout<T> | undefined,
  TrackLayout<T> | undefined,
];

/** A cell's box on `axis`, by the grid's ref, or undefined for a cell with
 *  no size there. */
export type CellBox = (
  ref: ConstraintRef,
  axis: 0 | 1
) => Pwl.Value | undefined;

/**
 * Each cell's box in `layer`'s plan (`buildPlan`'s forms): the width of its
 * box, in σ, which is what the claim walk sizes its track by
 * (`placeByClaims`). A cell that draws past its box (an outline, a label,
 * an offset part) sizes its track by its box, and what it draws past it
 * overhangs the track. A cell with no claim has no box. It reads the plan
 * the layer's claim made (`ClaimMemo.plans`), so it is read once that claim
 * is made: in layout, and in the checks the claim runs at its end
 * (`warnFlexibleSizes`).
 */
export const cellBoxesOf = (layer: GoFishNode): CellBox => {
  const index = buildNameIndex(layer.children);
  return (ref, axis) => {
    const i = index.get(ref.name);
    return i === undefined
      ? undefined
      : layer._claimMemo.plans[axis]?.forms[i]?.box.width;
  };
};

/**
 * Each track's extent on `axis` (columns on x, rows on y): the largest size
 * of its cells (`sizeOf`, by the grid's ref, undefined for a cell with
 * none), or `share` where no cell has one, a track its content does not
 * size, which is one share of its scope (`fr(1)`).
 */
function trackExtents<T, S extends T | undefined>(
  A: Arith<T>,
  c: GridConstraint,
  axis: 0 | 1,
  sizeOf: (ref: ConstraintRef) => T | undefined,
  share: S
): (T | S)[] {
  return Array.from({ length: trackCount(c, axis) }, (_, track) => {
    const own = cellsOfTrack(c, axis, track)
      .map((i) => sizeOf(c.children[i]))
      .filter((v): v is T => v !== undefined);
    return own.length > 0 ? A.max([A.zero, ...own]) : share;
  });
}

/**
 * The tracks of `c` on `axis` ({@link trackExtents}), laid end to end with
 * `gap` between them. The one track rule: the claim walk reads it in σ
 * (`placeByClaims`), and layout proposes each cell its track's extent at
 * the σ it lays out at ({@link gridCellSizesAt}).
 */
export function gridTracks<T>(
  A: Arith<T>,
  c: GridConstraint,
  axis: 0 | 1,
  sizeOf: (ref: ConstraintRef) => T | undefined,
  gap: T,
  share: T
): TrackLayout<T> {
  return layoutTrack(A, trackExtents(A, c, axis, sizeOf, share), gap);
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

/**
 * Per-cell proposed size `[cellW, cellH]`, keyed by cell name, at the σ its
 * layer hands its cells (`sigmas`): each cell is proposed its (column, row)
 * track's extent ({@link trackExtents}), its cells' boxes (`boxOf`, the
 * boxes the claim walk sized the tracks by, {@link cellBoxesOf}) at σ. A
 * fill cell fills that extent; a cell with a size of its own keeps its own
 * (equal or smaller) size and is centered in it.
 *
 * Where the layer has no σ on an axis (an unsized root, where shares have
 * no room: `GoFishNode.sharesHaveNoRoom`), a box that grows with σ has
 * no size there, as the layer proposes a child of a spread no size from
 * its claim. A box with no σ in it is the same at any σ, so it still
 * sizes its track. A track no box sizes then has no extent, and its
 * cells are proposed none on that axis: they keep their default size, as
 * a spread's bands do.
 */
export function gridCellSizesAt(
  c: GridConstraint,
  boxOf: CellBox,
  sigmas: readonly [number | undefined, number | undefined]
): Map<string, [number | undefined, number | undefined]> {
  const extentsOn = (axis: 0 | 1): (number | undefined)[] => {
    const s = sigmas[axis];
    const sigma = s !== undefined && Number.isFinite(s) ? s : undefined;
    return trackExtents(
      numbers,
      c,
      axis,
      (ref) => {
        const box = boxOf(ref, axis);
        if (box === undefined) return undefined;
        if (sigma !== undefined) return Pwl.at(box, sigma);
        return Pwl.isConstant(box) ? Pwl.at(box, 0) : undefined;
      },
      sigma
    );
  };
  const [cols, rows] = [extentsOn(0), extentsOn(1)];
  const out = new Map<string, [number | undefined, number | undefined]>();
  c.children.forEach((child, index) => {
    out.set(child.name, [
      cols[index % c.numCols],
      rows[Math.floor(index / c.numCols)],
    ]);
  });
  return out;
}

/** The tracks of `c` on `axis` that no cell's box sizes (`boxOf`), by
 *  index: each is one share of its scope (`fr(1)`), a flexible size
 *  (`warnFlexibleSizes`). */
export const shareTracks = (
  c: GridConstraint,
  axis: 0 | 1,
  boxOf: CellBox
): number[] =>
  Array.from({ length: trackCount(c, axis) }, (_, t) => t).filter((t) =>
    cellsOfTrack(c, axis, t).every(
      (i) => boxOf(c.children[i], axis) === undefined
    )
  );

/** Emit the per-cell center pins for a grid, on each axis it has the
 *  resolved `tracks` of (the claim walk solves one axis at a time, so it
 *  hands only that axis's): each cell is pinned to the middle of its
 *  (column, row) track. A cell whose center on an axis is claimed by a
 *  `position` pin is skipped on that axis — the explicit pin overrides the
 *  track centering (the authoritative-pin pattern). */
export function lowerGridPlacement<T>(
  A: Arith<T>,
  c: GridConstraint,
  owner: string,
  emitter: PlacementFactEmitter<T>,
  tracks: GridTracks<T>,
  pinnedByPosition?: Map<string, Set<0 | 1>>
): void {
  const center = (t: TrackLayout<T>, i: number) =>
    A.add(t.starts[i], A.scale(0.5, t.extents[i]));
  c.children.forEach((child, index) => {
    const at = [index % c.numCols, Math.floor(index / c.numCols)] as const;
    const overridden = pinnedByPosition?.get(child.name);
    for (const axis of [0, 1] as const) {
      const t = tracks[axis];
      if (t === undefined || overridden?.has(axis)) continue;
      emitter.pin({
        axis: axis === 0 ? "x" : "y",
        target: { name: child.name, anchor: "middle" },
        value: center(t, at[axis]),
        owner,
      });
    }
  });
}

/**
 * A grid's axes are categorical: ORDINAL over the columns (x) and rows (y).
 * Keys come from `colKeys`/`rowKeys`, else the representative cells' keys —
 * first-row cells for columns, first-column cells for rows, found by the
 * grid's refs (`cellOf`).
 */
export function gridSpaces(
  c: GridConstraint,
  cellOf: CellOf
): [UnderlyingSpace, UnderlyingSpace] {
  const keyAt = (i: number): OrdinalKey | undefined => {
    const ref = c.children[i];
    const cell = ref === undefined ? undefined : cellOf(ref);
    return cell instanceof GoFishNode ? cell.key : undefined;
  };
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
