/**
 * Shadow assertions for the σ-affine solver (#39 endgame, Phase 1).
 *
 * Runs the solver alongside the legacy engine and checks they agree, WITHOUT
 * the solver driving anything — the observe→assert discipline that landed the
 * ledger (stages 0–2). Guarded by `GOFISH_SOLVER_CHECK` (env or `globalThis`);
 * zero-cost and silent when off, so production behavior is unchanged.
 *
 * Coverage = PLACEMENT COMPOSITION (does the box-key model reproduce the engine's
 * absolute positions given each child's size?) plus the σ-SCOPE frame equation
 * (does content(σ)=allocated close where σ is solved?). The placement checks span
 * `distribute` (edge AND center, including pre-placed/data-positioned chains via
 * the pack/consistency-check boundary), `align`, `position`, `nest`
 * (inner centered in outer), and `grid` (equal-track cell centers). The frame check
 * runs at every σ-scope root: the render root (`gofish.tsx`), a shared/self-scaled
 * layer axis (`layer.tsx`), and a coord boundary (`coord.tsx` fitAxis). A clean
 * run means "every covered case agrees", not "everything".
 */
import * as M from "../../util/monotonic";
import { SolverBox } from "./index";
import type { Placeable } from "../_node";
import { axisIndex, isPlacedOn, type Axis } from "../constraints/shared";
import { getValue, isValue, type MaybeValue } from "../data";
import { computeAesthetic, envFlag } from "../../util";
import { pxOf } from "../domain";
import { localAnchorPoint } from "../dims";
import type { ConstraintSpec, ConstraintPosScales } from "../constraints";
import { distributePlacementAnchors } from "../constraints/distribute";
import { isCONTINUOUS, type UnderlyingSpace } from "../underlyingSpace";

/** Whether the solver shadow assertions run. Off (and zero-cost) in prod, so the
 *  per-constraint pre-state capture the checks need is only built when set. */
export const solverCheckEnabled = (): boolean => envFlag("GOFISH_SOLVER_CHECK");
const enabled = solverCheckEnabled;

// Report each (tag) once so a story's output stays readable (mirrors the ledger
// check). A gate cares about "any divergence", not the count.
const _reported = new Set<string>();
function report(tag: string, solver: number, engine: number): void {
  if (_reported.has(tag)) return;
  _reported.add(tag);
  console.warn(
    `[solver-check] ${tag}: solver=${solver} engine=${engine} (Δ=${solver - engine})`
  );
}

/** The subset of a distribute constraint the shadow reads. */
interface DistributeLike {
  type?: string;
  dir: Axis;
  spacing: number;
  mode: "edge" | "center";
  order: "forward" | "reverse";
}

/**
 * Check the distribute SPACING relation the engine enforces on its output. Every
 * distribute lowers to a chain of anchored relations (`distribute.ts`): between
 * consecutive targets in placement order, the `to`-anchor of the later child
 * equals the `from`-anchor of the earlier one plus `spacing`. The two anchors
 * are mode-dependent — `edge` uses `prev.max → cur.min` (contiguity), `center`
 * uses `prev.center → cur.center` (center-to-center) — read here through the
 * same box-key model (`anchorCoord`) `align`/`position` use, so this covers BOTH
 * modes with one relation.
 *
 * The consistency-check-not-pack boundary (the violin case). Distribute only
 * PACKS children it places; a chain edge whose BOTH endpoints arrived
 * pre-positioned on the stack axis (e.g. the violin's `stackY` over rects pinned
 * at `y: data`) was a no-op in the lowering (`distribute.ts` skips it) — the
 * spacing relation does NOT hold there, those two keep their data positions.
 * Every other edge (≥1 unplaced endpoint) is packed, so the relation must hold.
 * Validating exactly that boundary is the point of this check: it asserts the
 * relation on packed edges and deliberately does not on the pre-placed ones,
 * matching the engine's own pack/check split.
 */
export function shadowCheckDistribute(
  constraint: DistributeLike,
  targets: Placeable[],
  /** Per-target: was it already placed on the stack axis BEFORE distribute? */
  prePlaced: boolean[]
): void {
  if (!enabled() || constraint.type !== "distribute") return;
  const idx = axisIndex(constraint.dir);

  // Placement order (`reverse` reverses the chain — mirror it index-wise so the
  // pre-placed flags travel with their targets).
  const order = targets.map((_, i) => i);
  if (constraint.order === "reverse") order.reverse();
  if (order.length < 2) return;

  // Mode picks the anchor pair the lowering relates: edge = prev.max→cur.min,
  // center = prev.center→cur.center.
  const anchors = distributePlacementAnchors(constraint.mode);

  for (let k = 1; k < order.length; k++) {
    const pi = order[k - 1];
    const ci = order[k];
    // Both pre-placed → the lowering emits no relation (consistency check, not a
    // pack); the spacing relation is not asserted here. See docstring.
    if (prePlaced[pi] && prePlaced[ci]) continue;
    const from = anchorCoord(targets[pi], idx, anchors.from);
    const to = anchorCoord(targets[ci], idx, anchors.to);
    if (from === undefined || to === undefined) continue; // unplaced/unsized link
    // `to.anchor == from.anchor + spacing` (the relation direction proved in
    // placementSolver.reduceToAxisProblem: `to.min = from.min + fromOff + gap −
    // toOff`, i.e. anchor-point + gap).
    if (Math.abs(to - (from + constraint.spacing)) > 1e-6) {
      report(
        `distribute.${constraint.mode} dir=${constraint.dir}`,
        to,
        from + constraint.spacing
      );
    }
  }
}

/** The subset of a nest constraint the shadow reads. `x`/`y` are the paddings on
 *  the constrained axes; `children` is `[outer, inner]`. */
interface NestLike {
  type?: string;
  x?: number;
  y?: number;
  children: { name: string }[];
}

/**
 * Check the `nest` composition. On each constrained axis `nest` emits ONE
 * placement relation to the solver (`nest.ts` `lowerNestPlacement`): the inner is
 * CENTERED in the outer (`outer.center == inner.center`, the middle-to-middle
 * relate with gap 0). That center coincidence is the hard, placed-geometry
 * invariant, read here through the box-key model.
 *
 * The padded-extent relation (`|outer| == |inner| + 2·padding`) is deliberately
 * NOT asserted here: it is a size PROPOSAL — the space fold `nestedSpace` plus the
 * layer's nest layout proposal — that COMPOSES WITH and YIELDS TO other size
 * claims. In the OUTSIDE_IN direction (`inner = outer − 2·padding`) a
 * larger-natural-content inner overflows the derived size, so the placed sizes do
 * not satisfy the wrap relation even though the layout is correct (observed on
 * GoTree `combine({x:"nest"})` stories). The pad relation is thus validated at the
 * space-fold layer, not at placed geometry; Stage 6 folds it in as a size
 * equation, where authority tiers make the override explicit.
 */
export function shadowCheckNest(
  constraint: NestLike,
  outer: Placeable | undefined,
  inner: Placeable | undefined
): void {
  if (!enabled() || constraint.type !== "nest" || !outer || !inner) return;
  const axes: [Axis, number | undefined][] = [
    ["x", constraint.x],
    ["y", constraint.y],
  ];
  for (const [axis, padding] of axes) {
    if (padding === undefined) continue; // axis left unconstrained
    const idx = axisIndex(axis);
    // Centered placement: outer and inner share a center line (the emitted relate).
    const oc = anchorCoord(outer, idx, "middle");
    const ic = anchorCoord(inner, idx, "middle");
    if (oc !== undefined && ic !== undefined && Math.abs(oc - ic) > 1e-6)
      report(`nest.center ${axis}`, oc, ic);
  }
}

/** The subset of a grid constraint the shadow reads. */
interface GridLike {
  type?: string;
  numCols: number;
  xSpacing: number;
  ySpacing: number;
  children: { name: string }[];
}

/**
 * Check the `grid` composition — cells centered in their (column, row) tracks
 * (`grid.ts`). Stage 6e: tracks are content-sized under the unified max rule, so
 * the gap between two adjacent cells is no longer a uniform `cellExtent+spacing`
 * — it is `extent(col)/2 + spacing + extent(col+1)/2`, where a track's extent is
 * the max laid-out size of its cells (a cell that fills equals the extent; a
 * smaller claim cell is centered, and the column's widest cell pins the extent).
 * Recovering the track extents from the placed cell sizes and asserting the
 * center-to-center gaps is the ORIGIN-INDEPENDENT invariant (differences cancel
 * the unknown layer origin). Cell EXTENT is deliberately not asserted; a cell
 * whose center is overridden by a `position` pin is skipped on that axis.
 */
export function shadowCheckGrid(
  constraint: GridLike,
  targetByName: Map<string, Placeable>,
  layerSize: [number, number]
): void {
  if (!enabled() || constraint.type !== "grid") return;
  void layerSize;
  const numCols = constraint.numCols;
  const numRows = Math.ceil(constraint.children.length / numCols);
  const targetOf = (i: number): Placeable | undefined =>
    targetByName.get(constraint.children[i]?.name);
  const centerOf = (i: number, idx: 0 | 1): number | undefined => {
    const t = targetOf(i);
    return t ? anchorCoord(t, idx, "middle") : undefined;
  };
  const sizeOf = (i: number, idx: 0 | 1): number | undefined => {
    const t = targetOf(i);
    const s = t?.dims[idx].size;
    return s === undefined ? undefined : Math.abs(s);
  };
  // A track's extent is the max laid-out cell size across the track.
  const colExtent = (col: number): number => {
    let m = 0;
    for (let row = 0; row < numRows; row++)
      m = Math.max(m, sizeOf(row * numCols + col, 0) ?? 0);
    return m;
  };
  const rowExtent = (row: number): number => {
    let m = 0;
    for (let col = 0; col < numCols; col++)
      m = Math.max(m, sizeOf(row * numCols + col, 1) ?? 0);
    return m;
  };
  for (let i = 0; i < constraint.children.length; i++) {
    const col = i % numCols;
    // Adjacent column in the same row → centers half-extents + spacing apart.
    if (col + 1 < numCols && i + 1 < constraint.children.length) {
      const a = centerOf(i, 0);
      const b = centerOf(i + 1, 0);
      if (a !== undefined && b !== undefined) {
        const gap =
          colExtent(col) / 2 + constraint.xSpacing + colExtent(col + 1) / 2;
        if (Math.abs(b - a - gap) > 1e-6) report(`grid.col`, b - a, gap);
      }
    }
    // Adjacent row in the same column → centers half-extents + spacing apart.
    const row = Math.floor(i / numCols);
    if (i + numCols < constraint.children.length) {
      const a = centerOf(i, 1);
      const b = centerOf(i + numCols, 1);
      if (a !== undefined && b !== undefined) {
        const gap =
          rowExtent(row) / 2 + constraint.ySpacing + rowExtent(row + 1) / 2;
        if (Math.abs(b - a - gap) > 1e-6) report(`grid.row`, b - a, gap);
      }
    }
  }
}

/** The subset of an align constraint the shadow reads. */
interface AlignLike {
  type?: string;
  x?: string | string[];
  y?: string | string[];
}

/**
 * The coordinate `align` lands at a target's `anchor`, via the solver's box-key
 * model. `start`/`middle`/`end` are box keys (min/center/max) — computed
 * through a `SolverBox` from the engine's (min, size), validating the box-key
 * arithmetic. `baseline` is the box's ORIGIN — the intercept — which is the
 * placed translate, not a function of (min, size) alone (a negative bar's origin
 * is its max, not its min), so read it directly.
 */
function anchorCoord(
  t: Placeable,
  idx: 0 | 1,
  anchor: string
): number | undefined {
  if (anchor === "baseline")
    return t.projectedTranslate?.(idx) ?? t.transform?.translate?.[idx];
  const min = t.dims[idx].min;
  const size = t.dims[idx].size;
  if (min === undefined || size === undefined) return undefined;
  // start/middle/end are the box keys — the same single derivation every other
  // anchor read uses (negative-size safe).
  const key = anchor === "start" ? "min" : anchor === "end" ? "max" : "center";
  return localAnchorPoint(key, min, size);
}

/**
 * Check the `align` composition: every target the constraint PLACED on an axis
 * shares one anchor coordinate (`spread`'s default alignment is `baseline`, so
 * this directly tests that aligned origins coincide — the intercept thesis).
 *
 * Only validate targets align actually placed: a target pre-placed on the axis
 * is left untouched (it may define or differ from the baseline), and align
 * leaves a self-positioned child unplaced (it skips a target whose own
 * `placement` is already determined, so it stays unplaced). Both are detected
 * via `prePlaced` (captured before the placement solver) + a post-check that the
 * rest are now placed; heterogeneous per-child anchor arrays are skipped (no
 * single shared line).
 */
export function shadowCheckAlign(
  constraint: AlignLike,
  targets: Placeable[],
  /** Per-target [x, y]: already placed on that axis BEFORE align ran. */
  prePlaced: [boolean, boolean][]
): void {
  if (!enabled() || constraint.type !== "align") return;
  // Across all 189 stories this covers 2751 aligns with zero divergences; 959
  // are single-target (nothing to compare), 49 leave a self-positioned child
  // unplaced, 2 use heterogeneous per-child anchor arrays — all deferred here.
  for (const axis of ["x", "y"] as const) {
    const spec = constraint[axis];
    if (spec === undefined || Array.isArray(spec)) continue; // uniform anchor only
    const idx = axisIndex(axis);

    const placedByAlign: Placeable[] = [];
    let guardOrPartial = false;
    targets.forEach((t, i) => {
      if (prePlaced[i][idx]) return; // pre-placed: align leaves it untouched
      if (!isPlacedOn(t, idx)) {
        guardOrPartial = true; // align skipped it (self-positioned) or partial
        return;
      }
      placedByAlign.push(t);
    });
    if (guardOrPartial || placedByAlign.length < 2) continue;

    const coords = placedByAlign.map((t) => anchorCoord(t, idx, spec));
    if (coords.some((c) => c === undefined)) continue; // can't model
    const base = coords[0]!;
    for (const c of coords) {
      if (Math.abs(c! - base) > 1e-6) report(`align.${spec} ${axis}`, c!, base);
    }
  }
}

/** The subset of a position constraint the shadow reads. */
interface PositionLike {
  type?: string;
  x?: MaybeValue<number>;
  y?: MaybeValue<number>;
  anchor: string;
}

/**
 * Check the data→position mapping. A `position` constraint pins a target's anchor
 * at `posScale(datum)`; in the solver model the POSITION scale is the affine
 * `screen = origin + σ·data`. This validates BOTH:
 *   1. the posScale is actually affine — probe it at d, d+1, d+2 and assert equal
 *      slopes (the POSITION-frame assumption the solver is built on);
 *   2. the target's anchor landed at `scale(datum)` (placement correctness, read
 *      through the same `anchorCoord` box-key model).
 * Literal (non-datum) coords are pure pixel pins (no data→position), skipped here.
 */
export function shadowCheckPosition(
  constraint: PositionLike,
  targets: Placeable[],
  posScales: ConstraintPosScales | undefined
): void {
  if (!enabled() || constraint.type !== "position") return;
  // Across all 189 stories this covers 5753 datum→position mappings with zero
  // divergences; 627 literal (pixel) pins are skipped (no data→position).
  const axes: [Axis, MaybeValue<number> | undefined][] = [
    ["x", constraint.x],
    ["y", constraint.y],
  ];
  for (const [axis, coord] of axes) {
    if (coord === undefined || !isValue(coord)) continue; // datum only
    const idx = axisIndex(axis);
    const map = posScales?.[idx];
    if (map === undefined) continue; // datum w/o scale is an engine no-op
    const scale = (v: number) => pxOf(map, v);
    const d = getValue(coord)!;

    // 1. POSITION scale must be affine (origin + σ·data).
    const s1 = scale(d + 1) - scale(d);
    const s2 = scale(d + 2) - scale(d + 1);
    if (Math.abs(s1 - s2) > 1e-6) {
      report(`position.nonaffine-scale ${axis}`, s1, s2);
    }

    // 2. Each target's anchor landed at the mapped pixel. Use the engine's own
    // computeAesthetic so a per-datum pixel offset (datum(v).offset(px), applied
    // AFTER the scale) is included — origin + σ·data + offset, still affine.
    const px = computeAesthetic(coord, scale, undefined)!;
    for (const t of targets) {
      const got = anchorCoord(t, idx, constraint.anchor);
      if (got !== undefined && Math.abs(got - px) > 1e-6) {
        report(`position.${constraint.anchor} ${axis}`, px, got);
      }
    }
  }
}

/**
 * Check the σ-SCOPE solve — the heart of the affine model. A `scaleRoot` (a
 * `shared` layer axis) resolves σ from its box by the frame equation
 * `content(σ) = allocated`: the engine solves it backward (`width.inverse(size)`
 * for every continuous extent; `layer.tsx`). The shadow
 * checks it FORWARD — evaluate the scope's σ-affine content at the engine's
 * solved σ and assert it equals the allocated box. This validates the frame
 * equation actually closes, and notably catches σ-resolution that DEGENERATED
 * (the `?? 0` fallback when `inverse` fails → content(0) ≠ allocated), which the
 * affine solver must handle as under/over-determined rather than silently zero.
 */
export function shadowCheckScaleRoot(
  sp: UnderlyingSpace,
  allocated: number,
  sigma: number | undefined,
  axisIdx: 0 | 1
): void {
  if (!enabled() || sigma === undefined || !Number.isFinite(allocated)) return;
  // Every continuous σ-scope closes the same frame equation: the extent at σ is
  // `width.run(σ)` (anchored or not — a former POSITION/DIFFERENCE width is just
  // `linear(extent, 0)`, so `run(σ) = extent·σ`).
  let content: number | undefined;
  if (isCONTINUOUS(sp)) content = sp.width.run(sigma);
  if (content === undefined) return;
  if (Math.abs(content - allocated) > 1e-6) {
    report(`scaleRoot.frame axis=${axisIdx}`, content, allocated);
  }
}

/**
 * Single per-constraint shadow hook for `applyConstraints` — one call that
 * dispatches by constraint type, so this disposable observe→assert scaffolding
 * lifts out cleanly when the solver lands. `prePlaced` is the per-target `[x, y]`
 * placement snapshot the caller takes BEFORE the placement solve (only when the
 * check is enabled); it's `undefined` (and this no-ops) in production.
 * `nameToPlaceable`/`layerSize` are the layer's resolved children and pixel box,
 * used by the `nest` and `grid` checks (which read placeables by name and the
 * grid's track sizes).
 */
export function shadowCheckConstraint(
  constraint: ConstraintSpec,
  targets: Placeable[],
  posScales: ConstraintPosScales | undefined,
  prePlaced: [boolean, boolean][] | undefined,
  nameToPlaceable: Map<string, Placeable>,
  layerSize: [number, number]
): void {
  if (!enabled() || !prePlaced) return;
  const c = constraint as { type?: string; dir?: Axis };
  if (c.type === "align") {
    shadowCheckAlign(constraint as AlignLike, targets, prePlaced);
  } else if (c.type === "distribute") {
    const idx = axisIndex(c.dir!);
    shadowCheckDistribute(
      constraint as DistributeLike,
      targets,
      prePlaced.map((p) => p[idx])
    );
  } else if (c.type === "position") {
    shadowCheckPosition(constraint as PositionLike, targets, posScales);
  } else if (c.type === "nest") {
    const nest = constraint as NestLike;
    shadowCheckNest(
      nest,
      nameToPlaceable.get(nest.children[0]?.name),
      nameToPlaceable.get(nest.children[1]?.name)
    );
  } else if (c.type === "grid") {
    shadowCheckGrid(constraint as GridLike, nameToPlaceable, layerSize);
  }
}
