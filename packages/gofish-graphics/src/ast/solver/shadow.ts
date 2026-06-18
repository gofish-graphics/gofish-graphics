/**
 * Shadow assertions for the σ-affine solver (#39 endgame, Phase 1).
 *
 * Runs the solver alongside the legacy engine and checks they agree, WITHOUT
 * the solver driving anything — the observe→assert discipline that landed the
 * ledger (stages 0–2). Guarded by `GOFISH_SOLVER_CHECK` (env or `globalThis`);
 * zero-cost and silent when off, so production behavior is unchanged.
 *
 * Phase-1 coverage = PLACEMENT COMPOSITION before data→size: given each child's
 * engine-computed size, does the solver's facet machinery reproduce the engine's
 * absolute positions? Start with the `distribute` constraint (the composition
 * `spread`/`stack`/`scatter` all elaborate to), edge mode, no pre-placed anchor —
 * the stacked/edge-spread core. Other modes/anchors are skipped (not yet
 * modeled), so a clean run means "every covered case agrees", not "everything".
 */
import * as M from "../../util/monotonic";
import { SolverBox } from "./index";
import type { Placeable } from "../_node";
import { axisIndex, isPlacedOn, type Axis } from "../constraints/shared";
import { getValue, isValue, type MaybeValue } from "../data";
import { computeAesthetic, envFlag } from "../../util";
import { localAnchorPoint } from "../dims";
import type { ConstraintSpec, ConstraintPosScales } from "../constraints";
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
 * Check the edge-distribute CONTIGUITY invariant the engine enforces on its
 * output: consecutive targets satisfy `child[i+1].min == child[i].max + spacing`.
 * This is anchor-agnostic — which child anchored the walk only sets the absolute
 * offset, not the spacing relation — which matters because the shadow runs AFTER
 * `applyDistribute`, by which point every target is placed (so the pre-placement
 * anchor distinction is gone).
 *
 * The solver expresses it as an origin chain: seed the first target at its real
 * position (boundary condition), then predict each subsequent child's `min` via
 * `SolverBox` — `baseline = previous.max + spacing`, size pinned — and compare to
 * the engine. Agreement validates the solver representation reproduces the engine
 * composition on real story data (and that target/order/axis extraction is right).
 */
export function shadowCheckDistribute(
  constraint: DistributeLike,
  targets: Placeable[],
  /** Per-target: was it already placed on the stack axis BEFORE distribute? */
  prePlaced: boolean[]
): void {
  if (!enabled() || constraint.type !== "distribute") return;
  // Center mode (center-to-center spacing) is not yet modeled; only edge.
  if (constraint.mode !== "edge") return;
  const idx = axisIndex(constraint.dir);

  // Distribute only PACKS children it places. A child already placed on the
  // stack axis (e.g. the violin's `stackY` over rects pinned at `y: data`) is
  // data-positioned — distribute consistency-checks it, doesn't pack it — so the
  // contiguity invariant doesn't apply. Validate only pure packing (nothing
  // pre-placed); mixed/data-positioned distributes are deferred (honest
  // coverage, not silently passed). Across all 189 stories this covers 2560
  // edge-distributes; 934 are skipped here as data-positioned, 3 as center mode.
  if (prePlaced.some(Boolean)) return;

  const ordered =
    constraint.order === "reverse" ? [...targets].reverse() : targets;
  if (ordered.length < 2) return;

  let prevMax: M.Monotonic | undefined;
  for (let i = 0; i < ordered.length; i++) {
    const size = ordered[i].dims[idx].size;
    const engineMin = ordered[i].dims[idx].min;
    // Bail the whole chain if any link is unplaced/unsized — can't model it.
    if (size === undefined || engineMin === undefined) return;

    const box = new SolverBox(0); // edge targets are min-anchored (baseline ≡ min)
    box.add(
      "baseline",
      i === 0 ? engineMin : M.adds(prevMax!, constraint.spacing)
    );
    box.add("size", size);

    const solverMin = box.read("min", 0)!;
    if (i > 0 && Math.abs(solverMin - engineMin) > 1e-6) {
      report(`distribute.edge dir=${constraint.dir}`, solverMin, engineMin);
    }
    prevMax = box.facetMono("max");
  }
}

/** The subset of an align constraint the shadow reads. */
interface AlignLike {
  type?: string;
  x?: string | string[];
  y?: string | string[];
}

/**
 * The coordinate `align` lands at a target's `anchor`, via the solver's facet
 * model. `start`/`middle`/`end` are box facets (min/center/max) — computed
 * through a `SolverBox` from the engine's (min, size), validating the facet
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
  // start/middle/end are the box facets — the same single derivation every other
  // anchor read uses (negative-size safe).
  const facet =
    anchor === "start" ? "min" : anchor === "end" ? "max" : "center";
  return localAnchorPoint(facet, min, size);
}

/**
 * Check the `align` composition: every target the constraint PLACED on an axis
 * shares one anchor coordinate (`spread`'s default alignment is `baseline`, so
 * this directly tests that aligned origins coincide — the intercept thesis).
 *
 * Only validate targets align actually placed: a target pre-placed on the axis
 * is left untouched (it may define or differ from the baseline), and the
 * data-positioned guard can make align a no-op (it returns without placing, so
 * the not-pre-placed targets stay unplaced). Both are detected via `prePlaced`
 * (captured before `applyAlign`) + a post-check that the rest are now placed;
 * heterogeneous per-child anchor arrays are skipped (no single shared line).
 */
export function shadowCheckAlign(
  constraint: AlignLike,
  targets: Placeable[],
  /** Per-target [x, y]: already placed on that axis BEFORE align ran. */
  prePlaced: [boolean, boolean][]
): void {
  if (!enabled() || constraint.type !== "align") return;
  // Across all 189 stories this covers 2751 aligns with zero divergences; 959
  // are single-target (nothing to compare), 49 hit the data-positioned guard
  // no-op, 2 use heterogeneous per-child anchor arrays — all deferred here.
  for (const axis of ["x", "y"] as const) {
    const spec = constraint[axis];
    if (spec === undefined || Array.isArray(spec)) continue; // uniform anchor only
    const idx = axisIndex(axis);

    const placedByAlign: Placeable[] = [];
    let guardOrPartial = false;
    targets.forEach((t, i) => {
      if (prePlaced[i][idx]) return; // pre-placed: align leaves it untouched
      if (!isPlacedOn(t, idx)) {
        guardOrPartial = true; // align didn't place it → data-positioned guard no-op
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
 *      through the same `anchorCoord` facet model).
 * Literal (non-datum) coords are pure pixel pins (no data→position), skipped here.
 */
export function shadowCheckPosition(
  constraint: PositionLike,
  targets: Placeable[],
  posScales: (((v: number) => number) | undefined)[] | undefined
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
    const scale = posScales?.[idx];
    if (scale === undefined) continue; // datum w/o scale is an engine no-op
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
 * Single per-constraint shadow hook for the constraint dispatcher — one line in
 * `applyConstraints` instead of three interleaved calls with bespoke pre-state
 * capture, so this disposable observe→assert scaffolding lifts out cleanly when
 * the solver lands. `prePlaced` is the per-target `[x, y]` placement snapshot the
 * caller takes BEFORE applying the constraint (only when the check is enabled);
 * it's `undefined` (and this no-ops) in production.
 */
export function shadowCheckConstraint(
  constraint: ConstraintSpec,
  targets: Placeable[],
  posScales: ConstraintPosScales | undefined,
  prePlaced: [boolean, boolean][] | undefined
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
  }
}
