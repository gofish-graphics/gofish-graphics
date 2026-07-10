// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// ── The grid constraint ──────────────────────────────────────────────────────
//
// A grid is the symmetric 2-D layout: cells partitioned into `numCols` columns
// (a track per column on x) and the implied rows (a track per row on y), every
// cell pinned to its (column, row) track intersection. It's the elaboration
// target for `table` — `layer(cells).constrain(grid(...))`.
//
// **The unified sizing rule (Stage 6e).** Per axis, a track's extent is set by
// ONE rule — the (max, +) fold every other operator already uses:
//
//   track claim   = Monotonic.max(claims of the cells in that track)
//   grid claim    = Monotonic.add(track claims) + gaps          (the σ-frame LHS)
//
// A claim-less ("fill") cell contributes nothing to its track. This subsumes
// today's equal-flex box-division: an all-fill grid has no track claims, so the
// leftover (allocated − gaps) splits equally among the tracks — bit-identical to
// the former `sliceExtent`. Content-sized tracks emerge automatically when cells
// carry size claims (a track sizes to its widest cell). Fill tracks share
// whatever the claimed tracks leave over, equally.
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

import * as Monotonic from "../../util/monotonic";
import { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import { type ConstraintRef } from "./shared";
import { sliceExtent } from "./folds";
import {
  ORDINAL,
  UNDEFINED,
  isBaselineMagnitude,
  type UnderlyingSpace,
} from "../underlyingSpace";
import type { ScopeRegistry } from "../solver/scopes";
import type { PlacementFactEmitter } from "./placementFacts";

export interface GridOptions {
  numCols: number;
  /** [x, y] gaps between tracks; a scalar applies to both. Default 0. */
  spacing?: number | [number, number];
  colKeys?: string[];
  rowKeys?: string[];
  /** Grouping fields (table's `by.x`/`by.y`) → the col/row ORDINAL measures, so
   *  the table axes name themselves off their own spaces. */
  colMeasure?: string;
  rowMeasure?: string;
}

export interface GridConstraint {
  type: "grid";
  numCols: number;
  xSpacing: number;
  ySpacing: number;
  colKeys?: string[];
  rowKeys?: string[];
  colMeasure?: string;
  rowMeasure?: string;
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
export type TrackLayout = { starts: number[]; extents: number[] };

/** A cell's size claim on `axis`: the SIZE-magnitude width Monotonic it reports,
 *  or undefined when the cell fills (no size claim — a plain `rect({fill})`, a
 *  literal-pixel cell, or an ORDINAL/POSITION axis). */
const cellClaim = (
  cell: GoFishAST | undefined,
  axis: 0 | 1
): Monotonic.Monotonic | undefined => {
  if (!(cell instanceof GoFishNode)) return undefined;
  const sp = cell._underlyingSpace?.[axis];
  return sp !== undefined && isBaselineMagnitude(sp) ? sp.width : undefined;
};

/** Per-axis track claims: for each track (a column on x, a row on y), the max
 *  over its cells' claims — the (max, +) rule. A track with no claiming cell is
 *  `undefined` (a fill track). */
export function gridTrackClaims(
  c: GridConstraint,
  cells: readonly GoFishAST[]
): [(Monotonic.Monotonic | undefined)[], (Monotonic.Monotonic | undefined)[]] {
  const numRows = numRowsOf(c);
  const colClaims = Array.from({ length: c.numCols }, (_, col) => {
    const claims: Monotonic.Monotonic[] = [];
    for (let row = 0; row < numRows; row++) {
      const claim = cellClaim(cells[row * c.numCols + col], 0);
      if (claim !== undefined) claims.push(claim);
    }
    return claims.length > 0 ? Monotonic.max(...claims) : undefined;
  });
  const rowClaims = Array.from({ length: numRows }, (_, row) => {
    const claims: Monotonic.Monotonic[] = [];
    for (let col = 0; col < c.numCols; col++) {
      const claim = cellClaim(cells[row * c.numCols + col], 1);
      if (claim !== undefined) claims.push(claim);
    }
    return claims.length > 0 ? Monotonic.max(...claims) : undefined;
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
  claims: (Monotonic.Monotonic | undefined)[],
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
      const claimed = claims.filter(
        (c): c is Monotonic.Monotonic => c !== undefined
      );
      const gridClaim = Monotonic.adds(Monotonic.add(...claimed), gaps);
      if (!Monotonic.isConstant(gridClaim)) {
        sigma =
          scopes.solveSize(
            { kind: "grid", rootKey: meta.rootKey, axis: meta.axis },
            gridClaim,
            allocated,
            { upperBoundGuess: allocated }
          ) ?? 0;
      }
    }
    const claimedExtents = claims.map((c) =>
      c === undefined ? undefined : Math.max(0, c.run(sigma))
    );
    const claimedTotal =
      claimedExtents.reduce((s: number, e) => s + (e ?? 0), 0) + gaps;
    const fillShare =
      nFill > 0 ? Math.max(0, (allocated - claimedTotal) / nFill) : 0;
    extents = claims.map((c, i) =>
      c === undefined ? fillShare : claimedExtents[i]!
    );
  }

  const starts: number[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    starts.push(cursor);
    cursor += extents[i] + spacing;
  }
  return { starts, extents };
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
function layoutTrack(extents: number[], spacing: number): TrackLayout {
  const starts: number[] = [];
  let cursor = 0;
  for (const e of extents) {
    starts.push(cursor);
    cursor += e + spacing;
  }
  return { starts, extents };
}

/** The AUTHORITATIVE placement tracks: each track's extent is the max of its
 *  cells' ACTUAL laid-out sizes (a filled cell equals the budgeted extent; a
 *  claim cell equals its content). Computed post-layout so the cell centers pin
 *  to the real geometry — this is the single source both the placement and the
 *  solver shadow read, so they cannot drift from what rendered. */
export function gridTracksFromSizes(
  c: GridConstraint,
  cellSizes: (readonly [number, number] | undefined)[]
): [TrackLayout, TrackLayout] {
  const numRows = numRowsOf(c);
  const colExtents = Array.from({ length: c.numCols }, (_, col) => {
    let m = 0;
    for (let row = 0; row < numRows; row++)
      m = Math.max(m, cellSizes[row * c.numCols + col]?.[0] ?? 0);
    return m;
  });
  const rowExtents = Array.from({ length: numRows }, (_, row) => {
    let m = 0;
    for (let col = 0; col < c.numCols; col++)
      m = Math.max(m, cellSizes[row * c.numCols + col]?.[1] ?? 0);
    return m;
  });
  return [
    layoutTrack(colExtents, c.xSpacing),
    layoutTrack(rowExtents, c.ySpacing),
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

export type GridCellPlacement = {
  child: ConstraintRef;
  center: [number, number];
};

/** Cell centers from resolved tracks (Stage 6e) — or, when `tracks` is omitted,
 *  the equal box-division fallback used by the direct-solver tests. */
export function gridCellPlacements(
  c: GridConstraint,
  size: readonly [number, number],
  tracks?: [TrackLayout, TrackLayout]
): GridCellPlacement[] {
  const [cols, rows] =
    tracks ??
    ([
      {
        extents: Array.from({ length: c.numCols }, () =>
          sliceExtent(size[0], c.xSpacing, c.numCols)
        ),
        starts: Array.from(
          { length: c.numCols },
          (_, j) =>
            j * (sliceExtent(size[0], c.xSpacing, c.numCols) + c.xSpacing)
        ),
      },
      {
        extents: Array.from({ length: numRowsOf(c) }, () =>
          sliceExtent(size[1], c.ySpacing, numRowsOf(c))
        ),
        starts: Array.from(
          { length: numRowsOf(c) },
          (_, r) =>
            r * (sliceExtent(size[1], c.ySpacing, numRowsOf(c)) + c.ySpacing)
        ),
      },
    ] as [TrackLayout, TrackLayout]);
  return c.children.map((child, index) => {
    const column = index % c.numCols;
    const row = Math.floor(index / c.numCols);
    return {
      child,
      center: [
        cols.starts[column] + cols.extents[column] / 2,
        rows.starts[row] + rows.extents[row] / 2,
      ],
    };
  });
}

/** Emit the per-cell center pins for a grid. A cell whose center on an axis is
 *  claimed by a `position` pin is skipped on that axis — the explicit pin
 *  overrides the track centering (the authoritative-pin pattern). */
export function lowerGridPlacement(
  c: GridConstraint,
  owner: string,
  size: readonly [number, number],
  emitter: PlacementFactEmitter,
  tracks?: [TrackLayout, TrackLayout],
  pinnedByPosition?: Map<string, Set<0 | 1>>
): void {
  for (const { child, center } of gridCellPlacements(c, size, tracks)) {
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
    colKeys.length > 0 ? ORDINAL(colKeys, c.colMeasure) : UNDEFINED,
    rowKeys.length > 0 ? ORDINAL(rowKeys, c.rowMeasure) : UNDEFINED,
  ];
}
