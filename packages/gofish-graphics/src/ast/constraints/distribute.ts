// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Axis, AlignAnchor, ConstraintRef } from "./shared";
import type { Placeable } from "../_node";
import { getMeasure, getValue, isValue, type MaybeValue } from "../data";
import type { PlacementFactEmitter } from "./placementFacts";
import {
  CONTINUOUS_TYPE,
  ORDINAL,
  POSITION,
  SIZE,
  UNDEFINED,
  UnderlyingSpace,
  forgetAllMeasures,
  isBaselineMagnitude,
  isPOSITION,
  spaceMeasure,
} from "../underlyingSpace";
import * as Monotonic from "../../util/monotonic";
import * as Interval from "../../util/interval";

export interface DistributeOptions {
  dir: Axis;
  spacing?: number;
  /** How adjacent children in the chain relate:
   *  - `"edge"` (default): `start[i+1] = end[i] + spacing` — spacing is the gap
   *    between facing edges (content-dependent).
   *  - `"start" | "middle" | "end" | "baseline"`: fixed-pitch anchor chaining —
   *    `anchor[i+1] = anchor[i] + spacing` — spacing is a fixed,
   *    content-independent anchor-to-anchor pitch. `"middle"` is the old
   *    center-to-center mode. */
  anchor?: AlignAnchor | "edge";
  order?: "forward" | "reverse";
  /** Stack semantics: glue children together (sizes sum into a POSITION at the
   *  layer) instead of slicing a budget. Forces `spacing` to 0. Mirrors
   *  spread's `glue`. */
  glue?: boolean;
  /** The measure for an ORDINAL fold — the grouping field (spread's `by`) — so a
   *  category axis names itself off its own space, like a continuous axis does. */
  measure?: string;
}

export interface DistributeConstraint {
  type: "distribute";
  dir: Axis;
  spacing: number;
  anchor: AlignAnchor | "edge";
  order: "forward" | "reverse";
  glue: boolean;
  children: ConstraintRef[];
  measure?: string;
}

export const createDistributeConstraint = (
  options: DistributeOptions,
  children: ConstraintRef[]
): DistributeConstraint => ({
  type: "distribute",
  dir: options.dir,
  // Glue pins spacing ≡ 0 for both the space fold and placement-solver
  // relations, so glued children touch.
  spacing: options.glue ? 0 : (options.spacing ?? 8),
  anchor: options.anchor ?? "edge",
  order: options.order ?? "forward",
  glue: options.glue ?? false,
  children,
  measure: options.measure,
});

export function distributeChildrenInPlacementOrder(
  constraint: DistributeConstraint,
  children: readonly ConstraintRef[] = constraint.children
): ConstraintRef[] {
  return constraint.order === "reverse"
    ? [...children].reverse()
    : [...children];
}

export function distributePlacementAnchors(
  anchor: DistributeConstraint["anchor"]
): {
  from: AlignAnchor;
  to: AlignAnchor;
} {
  // Fixed-pitch anchors (start/middle/end/baseline) relate the SAME anchor on
  // both sides of the chain edge (anchor[i+1] = anchor[i] + spacing); "edge"
  // relates the facing edges (end of prev → start of cur).
  return anchor === "edge"
    ? { from: "end", to: "start" }
    : { from: anchor, to: anchor };
}

export function lowerDistributePlacement(
  constraint: DistributeConstraint,
  owner: string,
  {
    emitter,
    targets,
    isInitiallyPlaced,
  }: {
    emitter: PlacementFactEmitter;
    targets: Pick<Map<string, Placeable>, "has" | "get">;
    isInitiallyPlaced: (axis: Axis, name: string) => boolean;
  }
): void {
  const children = constraint.children.filter((child) =>
    targets.has(child.name)
  );
  const ordered = distributeChildrenInPlacementOrder(constraint, children);
  if (ordered.length === 0) return;
  const anchors = distributePlacementAnchors(constraint.anchor);
  // A fixed-pitch chain on y is an OVERLAY, not a tiling: the targets' allocated
  // y bands are just leftover slices, unrelated to where the chained anchor
  // sits. Stamp the chained anchor on each target so a target that later opens
  // its own y-up flip scope mirrors about that anchor (see `Placeable.
  // pitchAnchorY` and `scopeBox` in coordinateTransforms/bake.ts) — keeping the
  // painted anchors exactly where this chain solved them, at exact pitch.
  if (constraint.anchor !== "edge" && constraint.dir === "y") {
    for (const child of ordered) {
      const target = targets.get(child.name);
      if (target) target.pitchAnchorY = constraint.anchor;
    }
  }
  for (let i = 1; i < ordered.length; i++) {
    // A chain edge whose endpoints both arrived pre-positioned was a
    // consistency check/no-op in the legacy walk (not an owning relation).
    // Preserve that boundary: confluence governs the unknown positions.
    if (
      isInitiallyPlaced(constraint.dir, ordered[i - 1].name) &&
      isInitiallyPlaced(constraint.dir, ordered[i].name)
    )
      continue;
    emitter.relate({
      axis: constraint.dir,
      from: { name: ordered[i - 1].name, anchor: anchors.from },
      to: { name: ordered[i].name, anchor: anchors.to },
      gap: constraint.spacing,
      owner,
    });
  }
  emitter.include({
    axis: constraint.dir,
    name: ordered[0].name,
    owner,
  });
}

/**
 * The distribute constraint's *space-resolution* contribution — the bottom-up
 * half that makes `layer + distribute` claim the same underlying space a
 * `spread` does. Mirrors spread.tsx's stack-axis dispatch exactly (spread's
 * `resolveUnderlyingSpace`), including the explicit-size override and the glue
 * (stack) variant, so phase-3 spread can delegate to it wholesale:
 *
 *  - explicit `opts.size` (a value) → SIZE(linear(value, 0)) — the spread's own
 *    size wins over any children-derived claim.
 *  - glue → POSITION([0, Σ widths]) when all-POSITION; POSITION([0, Σ run(1)])
 *    when all-SIZE; ORDINAL(keys) when any child is keyed; else UNDEFINED.
 *  - non-glue, all-SIZE & data-driven (some non-constant Monotonic) → SIZE
 *    composition (Monotonic.add + spacing·(n−1) for "edge"; the
 *    unknown-Monotonic fixed-pitch form for start/middle/end/baseline), so a
 *    parent can solve a scale factor via Monotonic.inverse (auto-fit).
 *  - non-glue, any child keyed → ORDINAL.
 *  - non-glue, all-SIZE constant → SIZE composition.
 *  - non-glue, all-POSITION → POSITION([0, Σ widths]).
 *  - anything else → UNDEFINED (caller falls back to its default union).
 *
 * Measures forget-merge on conflict, like spread. `keys` are the targets'
 * ordinal keys (node.key) in the same order as `targetSpaces`; only used to
 * pick the ORDINAL branch. This is ref-independent (plain arrays) so spread can
 * call it with its positional children and the layer with its name-resolved
 * targets.
 */
export function distributeSpaceFold(
  targetSpaces: UnderlyingSpace[],
  keys: (string | undefined)[],
  opts: {
    spacing: number;
    anchor: AlignAnchor | "edge";
    glue?: boolean;
    /** Explicit size on the spread/layer's stack axis; overrides children. */
    size?: MaybeValue<number>;
    /** The measure for an ORDINAL result — the grouping field (spread's `by`),
     *  so a category axis names itself off its own space, just as a continuous
     *  axis's measure is its field. (Distinct from `childMeasure` below, which
     *  is the continuous measure composed from the children for a SIZE/POSITION
     *  result.) */
    measure?: string;
    /** True when every contributing child was POSITIONALLY keyed (a `spread`
     *  with no `by`): the folded ORDINAL is anonymous and renders no axis. */
    anonymous?: boolean;
  }
): UnderlyingSpace {
  const n = targetSpaces.length;
  if (n === 0) return UNDEFINED;
  const childMeasure = forgetAllMeasures(
    targetSpaces.map((s) => spaceMeasure(s))
  );

  // Explicit size on the stack axis dominates the children-derived claim.
  if (opts.size !== undefined && isValue(opts.size)) {
    return SIZE(
      Monotonic.linear(getValue(opts.size)!, 0),
      getMeasure(opts.size)
    );
  }

  const namedKeys = keys.filter((k): k is string => k !== undefined);
  const spacing = opts.glue ? 0 : opts.spacing;
  // A "free" baseline magnitude (old SIZE) composes its Monotonic + spacing; an
  // anchored data-positioned child (old POSITION) sums its data widths WITHOUT
  // spacing. They are kept distinct — collapsing both into the magnitude path
  // wrongly injected spacing into already-positioned extents.
  const allSize = targetSpaces.every(isBaselineMagnitude);
  const allPosition = targetSpaces.every(isPOSITION);
  const widthAt1 = (s: UnderlyingSpace): number =>
    (s as CONTINUOUS_TYPE).width.run(1);
  const sumWidths = (): number =>
    targetSpaces.map(widthAt1).reduce((a, b) => a + b, 0);

  if (opts.glue) {
    // STACK semantics: collapse children into a single anchored POSITION
    // [0, Σ extent@σ=1] (same total whether they were magnitudes or positioned).
    if (allSize || allPosition) {
      return POSITION(Interval.interval(0, sumWidths()), childMeasure);
    }
    if (namedKeys.length > 0)
      return ORDINAL(namedKeys, opts.measure, opts.anonymous);
    return UNDEFINED;
  }

  const childDomains = allSize
    ? targetSpaces.map((s) => (s as CONTINUOUS_TYPE).width)
    : [];
  const dataDriven =
    allSize && childDomains.some((d) => !Monotonic.isConstant(d));
  // Fixed-pitch extents: `(n−1)·spacing` of chain plus an amplitude ALLOWANCE
  // attributed to the side of the chain where content actually extends,
  // relative to the chained anchor (the painted side — a fixed-pitch chain's
  // rows mirror about their chained anchor at paint, see `pitchAnchorY`):
  //  - "middle": content extends half above / half below every anchor — the
  //    EXACT symmetric form `h_first/2 + (n−1)·s + h_last/2` (unchanged; the
  //    original center mode).
  //  - "baseline" / "start": content rises entirely ABOVE each anchor, so the
  //    allowance sits above the chain HEAD: `max_k(h_k − k·s)⁺ + (n−1)·s`
  //    (k in chain order — the binding row is whichever peak clears the rows
  //    chained above it).
  //  - "end": the mirror image — content hangs BELOW each anchor, allowance
  //    below the chain TAIL: `max_k(h_k − (n−1−k)·s)⁺ + (n−1)·s`.
  // The per-k max assumes each child's extent lies wholly on one side of its
  // anchor (true for SIZE claims — baseline magnitudes) and that the fold's
  // child order is the chain order (compose.ts passes placement order).
  const composeSize = (): Monotonic.Monotonic => {
    if (opts.anchor === "edge")
      return Monotonic.adds(Monotonic.add(...childDomains), spacing * (n - 1));
    if (opts.anchor === "middle")
      return Monotonic.unknown(
        (scaleFactor: number) =>
          childDomains[0].run(scaleFactor) / 2 +
          spacing * (n - 1) +
          childDomains[childDomains.length - 1].run(scaleFactor) / 2
      );
    const anchor = opts.anchor;
    return Monotonic.unknown((scaleFactor: number) => {
      let allowance = 0;
      for (let k = 0; k < n; k++) {
        const pitchesFromAnchoredEnd = anchor === "end" ? n - 1 - k : k;
        allowance = Math.max(
          allowance,
          childDomains[k].run(scaleFactor) - spacing * pitchesFromAnchoredEnd
        );
      }
      return Math.max(0, allowance) + spacing * (n - 1);
    });
  };

  if (dataDriven) return SIZE(composeSize(), childMeasure);
  if (namedKeys.length > 0)
    return ORDINAL(namedKeys, opts.measure, opts.anonymous);
  if (allSize) return SIZE(composeSize(), childMeasure);
  if (allPosition)
    return POSITION(Interval.interval(0, sumWidths()), childMeasure);
  return UNDEFINED;
}
