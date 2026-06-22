// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Axis, AlignAnchor, ConstraintRef } from "./shared";
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
  mode?: "edge" | "center";
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
  mode: "edge" | "center";
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
  mode: options.mode ?? "edge",
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
  mode: DistributeConstraint["mode"]
): {
  from: AlignAnchor;
  to: AlignAnchor;
} {
  return mode === "center"
    ? { from: "middle", to: "middle" }
    : { from: "end", to: "start" };
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
    targets: Pick<Map<string, unknown>, "has">;
    isInitiallyPlaced: (axis: Axis, name: string) => boolean;
  }
): void {
  const children = constraint.children.filter((child) =>
    targets.has(child.name)
  );
  const ordered = distributeChildrenInPlacementOrder(constraint, children);
  if (ordered.length === 0) return;
  const anchors = distributePlacementAnchors(constraint.mode);
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
 *    unknown-Monotonic center form for "center"), so a parent can solve a scale
 *    factor via Monotonic.inverse (auto-fit).
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
    mode: "edge" | "center";
    glue?: boolean;
    /** Explicit size on the spread/layer's stack axis; overrides children. */
    size?: MaybeValue<number>;
    /** The measure for an ORDINAL result — the grouping field (spread's `by`),
     *  so a category axis names itself off its own space, just as a continuous
     *  axis's measure is its field. (Distinct from `childMeasure` below, which
     *  is the continuous measure composed from the children for a SIZE/POSITION
     *  result.) */
    measure?: string;
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
    if (namedKeys.length > 0) return ORDINAL(namedKeys, opts.measure);
    return UNDEFINED;
  }

  const childDomains = allSize
    ? targetSpaces.map((s) => (s as CONTINUOUS_TYPE).width)
    : [];
  const dataDriven =
    allSize && childDomains.some((d) => !Monotonic.isConstant(d));
  const composeSize = (): Monotonic.Monotonic =>
    opts.mode === "center"
      ? Monotonic.unknown(
          (scaleFactor: number) =>
            childDomains[0].run(scaleFactor) / 2 +
            spacing * (n - 1) +
            childDomains[childDomains.length - 1].run(scaleFactor) / 2
        )
      : Monotonic.adds(Monotonic.add(...childDomains), spacing * (n - 1));

  if (dataDriven) return SIZE(composeSize(), childMeasure);
  if (namedKeys.length > 0) return ORDINAL(namedKeys, opts.measure);
  if (allSize) return SIZE(composeSize(), childMeasure);
  if (allPosition)
    return POSITION(Interval.interval(0, sumWidths()), childMeasure);
  return UNDEFINED;
}
