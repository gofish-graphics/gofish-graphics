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
// **The unified sizing rule.** Per axis, a track's extent is set by
// ONE rule — the (max, +) fold every other operator already uses:
//
//   track claim   = Pwl.max(claims of the cells in that track)
//   grid claim    = Pwl.add(track claims) + gaps          (the σ-frame LHS)
//
// A claim-less ("fill") cell contributes nothing to its track. This subsumes
// equal-flex box-division: an all-fill grid has no track claims, so the leftover
// (allocated − gaps) splits equally among the tracks. Content-sized tracks
// emerge automatically when cells carry size claims (a track sizes to its widest
// cell). Fill tracks share whatever the claimed tracks leave over, equally.
//
// `resolveGridTracks` is the single site that runs this rule; both the layout
// budget (each cell is proposed its track's extent) and the placement (each cell
// pinned to its track-intersection center) read the SAME resolved tracks, so the
// two cannot drift. When every track carries a σ-dependent claim (no fill to
// absorb slack) the grid claim is inverted against the allocated size by the
// scope registry, exactly like any other frame equation; the common all-constant
// case (fixed-px cells) is σ-independent and reads back its intercept.
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
import { sliceExtent } from "./folds";
import {
  ordinalOver,
  type OrdinalKey,
  UNDEFINED,
  type UnderlyingSpace,
  originIs,
} from "../underlyingSpace";
import type { ScopeRegistry } from "../solver/scopes";
import type { PlacementFactEmitter } from "./placementFacts";
import { numbers, type Arith } from "../solver/arith";

export interface GridOptions {
  numCols: number;
  /** [x, y] gaps between tracks; a scalar applies to both. Default 0. */
  spacing?: number | [number, number];
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
  xSpacing: number;
  ySpacing: number;
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
    xSpacing: Array.isArray(sp) ? sp[0] : sp,
    ySpacing: Array.isArray(sp) ? sp[1] : sp,
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

/** The resolved geometry of one axis's tracks: each track's start (low edge, in
 *  the layer's local pixel frame) and extent. `starts[i] + extents[i]/2` is the
 *  center a cell in track `i` pins to. */
export type TrackLayout<T = number> = { starts: T[]; extents: T[] };

/** A cell's size claim on `axis`: the SIZE-magnitude width value it reports,
 *  or undefined when the cell fills (no size claim — a plain `rect({fill})`, a
 *  literal-pixel cell, or an ORDINAL/POSITION axis). */
const cellClaim = (
  cell: GoFishAST | undefined,
  axis: 0 | 1
): Pwl.Value | undefined => {
  if (!(cell instanceof GoFishNode)) return undefined;
  const sp = cell._underlyingSpace?.[axis];
  return originIs(sp, "free") ? cell.resolveExtent()[axis]!.width : undefined;
};

/** Per-axis track claims: for each track (a column on x, a row on y), the max
 *  over its cells' claims — the (max, +) rule. A track with no claiming cell is
 *  `undefined` (a fill track). */
export function gridTrackClaims(
  c: GridConstraint,
  cells: readonly GoFishAST[]
): [(Pwl.Value | undefined)[], (Pwl.Value | undefined)[]] {
  const numRows = numRowsOf(c);
  const colClaims = Array.from({ length: c.numCols }, (_, col) => {
    const claims: Pwl.Value[] = [];
    for (let row = 0; row < numRows; row++) {
      const claim = cellClaim(cells[row * c.numCols + col], 0);
      if (claim !== undefined) claims.push(claim);
    }
    return claims.length > 0 ? Pwl.max(...claims) : undefined;
  });
  const rowClaims = Array.from({ length: numRows }, (_, row) => {
    const claims: Pwl.Value[] = [];
    for (let col = 0; col < c.numCols; col++) {
      const claim = cellClaim(cells[row * c.numCols + col], 1);
      if (claim !== undefined) claims.push(claim);
    }
    return claims.length > 0 ? Pwl.max(...claims) : undefined;
  });
  return [colClaims, rowClaims];
}

/** Solve one axis of tracks against `allocated` pixels under the unified rule.
 *
 *  - No claims (all fill): the leftover after gaps splits equally — today's
 *    `sliceExtent`, bit-identical.
 *  - Some claims: each claimed track takes its claim (evaluated at the solved σ,
 *    or its constant intercept when σ-independent); the remaining fill tracks
 *    share whatever is left, equally. When EVERY track is claimed and a claim is
 *    σ-dependent, σ is solved by inverting `Σ claims + gaps = allocated` through
 *    the scope registry (the same frame equation as any other size scope). */
function resolveAxisTracks(
  claims: (Pwl.Value | undefined)[],
  allocated: number,
  spacing: number,
  scopes?: ScopeRegistry,
  meta?: { rootKey: string; axis: 0 | 1 }
): TrackLayout {
  const n = claims.length;
  const gaps = spacing * Math.max(0, n - 1);
  const nFill = claims.filter((c) => c === undefined).length;

  let extents: number[];
  if (nFill === n) {
    const e = sliceExtent(allocated, spacing, n);
    extents = claims.map(() => e);
  } else {
    // Solve σ only when every track is claimed (no fill absorbs the slack) and a
    // claim is genuinely σ-dependent; otherwise claims are constants and σ is
    // irrelevant (read back the intercept at σ=0).
    let sigma = 0;
    if (nFill === 0 && scopes !== undefined && meta !== undefined) {
      const claimed = claims.filter((c): c is Pwl.Value => c !== undefined);
      const gridClaim = Pwl.addConstant(Pwl.add(...claimed), gaps);
      if (!Pwl.isConstant(gridClaim)) {
        sigma =
          scopes.solveSize(
            { kind: "grid", rootKey: meta.rootKey, axis: meta.axis },
            gridClaim,
            allocated
          ) ?? 0;
      }
    }
    const claimedExtents = claims.map((c) =>
      c === undefined ? undefined : Math.max(0, Pwl.at(c, sigma))
    );
    const claimedTotal =
      claimedExtents.reduce((s: number, e) => s + (e ?? 0), 0) + gaps;
    const fillShare =
      nFill > 0 ? Math.max(0, (allocated - claimedTotal) / nFill) : 0;
    extents = claims.map((c, i) =>
      c === undefined ? fillShare : claimedExtents[i]!
    );
  }

  return layoutTrack(numbers, extents, spacing);
}

/** Resolve both axes' tracks for a grid laid into `size`, under the unified
 *  (max, +) sizing rule. The one site the rule runs; the layout budget and the
 *  placement both read the result, so cell proposals and cell centers agree by
 *  construction. */
export function resolveGridTracks(
  c: GridConstraint,
  cells: readonly GoFishAST[],
  size: readonly [number, number],
  scopes?: ScopeRegistry,
  rootKey = "grid"
): [TrackLayout, TrackLayout] {
  const [colClaims, rowClaims] = gridTrackClaims(c, cells);
  return [
    resolveAxisTracks(colClaims, size[0], c.xSpacing, scopes, {
      rootKey,
      axis: 0,
    }),
    resolveAxisTracks(rowClaims, size[1], c.ySpacing, scopes, {
      rootKey,
      axis: 1,
    }),
  ];
}

/** Lay out a run of track extents into `{ starts, extents }`: cumulative starts
 *  with `spacing` reserved between adjacent tracks. */
function layoutTrack<T>(
  A: Arith<T>,
  extents: T[],
  spacing: number
): TrackLayout<T> {
  const starts: T[] = [];
  let cursor = A.zero;
  for (const e of extents) {
    starts.push(cursor);
    cursor = A.add(cursor, A.add(e, A.constant(spacing)));
  }
  return { starts, extents };
}

/** The AUTHORITATIVE placement tracks: each track's extent is the max of its
 *  cells' ACTUAL laid-out sizes (a filled cell equals the budgeted extent; a
 *  claim cell equals its content). Computed post-layout so the cell centers pin
 *  to the real geometry — this is the single source both the placement and the
 *  solver shadow read, so they cannot drift from what rendered. */
export function gridTracksFromSizes<T>(
  A: Arith<T>,
  c: GridConstraint,
  cellSizes: (readonly [T, T] | undefined)[]
): [TrackLayout<T>, TrackLayout<T>] {
  const numRows = numRowsOf(c);
  const colExtents = Array.from({ length: c.numCols }, (_, col) =>
    A.max([
      A.zero,
      ...Array.from(
        { length: numRows },
        (_, row) => cellSizes[row * c.numCols + col]?.[0] ?? A.zero
      ),
    ])
  );
  const rowExtents = Array.from({ length: numRows }, (_, row) =>
    A.max([
      A.zero,
      ...Array.from(
        { length: c.numCols },
        (_, col) => cellSizes[row * c.numCols + col]?.[1] ?? A.zero
      ),
    ])
  );
  return [
    layoutTrack(A, colExtents, c.xSpacing),
    layoutTrack(A, rowExtents, c.ySpacing),
  ];
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
  const slice = (budget: T, spacing: number, n: number) =>
    A.scale(1 / n, A.sub(budget, A.constant(spacing * (n - 1))));
  const colExtent = slice(size[0], c.xSpacing, c.numCols);
  const rowExtent = slice(size[1], c.ySpacing, numRows);
  return [
    layoutTrack(
      A,
      Array.from({ length: c.numCols }, () => colExtent),
      c.xSpacing
    ),
    layoutTrack(
      A,
      Array.from({ length: numRows }, () => rowExtent),
      c.ySpacing
    ),
  ];
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
