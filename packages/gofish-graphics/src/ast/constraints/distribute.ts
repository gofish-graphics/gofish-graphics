// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { Axis, ConstraintRef } from "./shared";
import { getMeasure, getValue, isValue, type MaybeValue } from "../data";
import {
  ORDINAL,
  POSITION,
  SIZE,
  UNDEFINED,
  UnderlyingSpace,
  forgetAllMeasures,
  isPOSITION,
  isSIZE,
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
}

export interface DistributeConstraint {
  type: "distribute";
  dir: Axis;
  spacing: number;
  mode: "edge" | "center";
  order: "forward" | "reverse";
  glue: boolean;
  children: ConstraintRef[];
}

export const createDistributeConstraint = (
  options: DistributeOptions,
  children: ConstraintRef[]
): DistributeConstraint => ({
  type: "distribute",
  dir: options.dir,
  // Glue pins spacing ≡ 0 — both for the space fold and for `applyDistribute`'s
  // post-layout placement (which reads this `spacing`), so glued children touch.
  spacing: options.glue ? 0 : (options.spacing ?? 8),
  mode: options.mode ?? "edge",
  order: options.order ?? "forward",
  glue: options.glue ?? false,
  children,
});

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
  }
): UnderlyingSpace {
  const n = targetSpaces.length;
  if (n === 0) return UNDEFINED;
  const measure = forgetAllMeasures(targetSpaces.map((s) => spaceMeasure(s)));

  // Explicit size on the stack axis dominates the children-derived claim.
  if (opts.size !== undefined && isValue(opts.size)) {
    return SIZE(
      Monotonic.linear(getValue(opts.size)!, 0),
      getMeasure(opts.size)
    );
  }

  const namedKeys = keys.filter((k): k is string => k !== undefined);
  const spacing = opts.glue ? 0 : opts.spacing;
  const allSize = targetSpaces.every(isSIZE);
  const allPosition = targetSpaces.every((s) => isPOSITION(s) && s.domain);
  const sumWidths = (): number =>
    targetSpaces
      .map((s) => Interval.width((s as any).domain))
      .reduce((a, b) => a + b, 0);

  if (opts.glue) {
    // STACK semantics: collapse children into a single POSITION at this level
    // using their intrinsic extent at scale = 1.
    if (allPosition)
      return POSITION(Interval.interval(0, sumWidths()), measure);
    if (allSize) {
      const total = targetSpaces
        .map((s) => (s as any).domain.run(1) as number)
        .reduce((a, b) => a + b, 0);
      return POSITION(Interval.interval(0, total), measure);
    }
    if (namedKeys.length > 0) return ORDINAL(namedKeys);
    return UNDEFINED;
  }

  const childDomains = allSize
    ? targetSpaces.map((s) => (s as any).domain as Monotonic.Monotonic)
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

  if (dataDriven) return SIZE(composeSize(), measure);
  if (namedKeys.length > 0) return ORDINAL(namedKeys);
  if (allSize) return SIZE(composeSize(), measure);
  if (allPosition) return POSITION(Interval.interval(0, sumWidths()), measure);
  return UNDEFINED;
}

export {
  applyDistribute,
  emitDistribute,
  type DistributeInconsistencyReporter,
  type DistributePlacement,
  type DistributeWalkOptions,
} from "./distributePlacement";
