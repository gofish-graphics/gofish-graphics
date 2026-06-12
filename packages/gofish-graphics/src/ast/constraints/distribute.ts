import type { Placeable } from "../_node";
import { Axis, ConstraintRef, axisIndex, isPlacedOn } from "./shared";
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
}

export interface DistributeConstraint {
  type: "distribute";
  dir: Axis;
  spacing: number;
  mode: "edge" | "center";
  order: "forward" | "reverse";
  children: ConstraintRef[];
}

export const createDistributeConstraint = (
  options: DistributeOptions,
  children: ConstraintRef[]
): DistributeConstraint => ({
  type: "distribute",
  dir: options.dir,
  spacing: options.spacing ?? 8,
  mode: options.mode ?? "edge",
  order: options.order ?? "forward",
  children,
});

/**
 * PROTOTYPE (issue #475): the distribute constraint's *space-resolution*
 * contribution — the missing half that makes `layer + distribute` claim the
 * same underlying space a `spread` does. Mirrors spread.tsx's non-glue stack
 * dispatch exactly (resolveUnderlyingSpace, ~lines 174-223):
 *   - all-SIZE & data-driven (some non-constant Monotonic) → SIZE composition
 *     (Monotonic.add of the children + spacing·(n−1) for "edge"; the
 *     unknown-Monotonic center form for "center"), so a parent can solve a
 *     scale factor via Monotonic.inverse (auto-fit).
 *   - all-SIZE constant + named (carry a `key`) → ORDINAL.
 *   - all-SIZE constant + unnamed → SIZE composition.
 *   - all-POSITION → POSITION([0, Σ widths]).
 *   - anything else → UNDEFINED (caller falls back to its default union).
 * Measures forget-merge on conflict, like spread.
 *
 * `keys` are the targets' ordinal keys (node.key) in the same order as
 * `targetSpaces`; only used to pick the ORDINAL branch.
 */
export function distributeSpaceFold(
  targetSpaces: UnderlyingSpace[],
  constraint: Pick<DistributeConstraint, "spacing" | "mode">,
  keys: (string | undefined)[] = []
): UnderlyingSpace {
  const n = targetSpaces.length;
  if (n === 0) return UNDEFINED;
  const namedKeys = keys.filter((k): k is string => k !== undefined);
  const measure = forgetAllMeasures(targetSpaces.map((s) => spaceMeasure(s)));

  const allSize = targetSpaces.every(isSIZE);
  const childDomains = allSize
    ? targetSpaces.map((s) => (s as any).domain as Monotonic.Monotonic)
    : [];
  const dataDriven =
    allSize && childDomains.some((d) => !Monotonic.isConstant(d));
  const composeSize = (): Monotonic.Monotonic =>
    constraint.mode === "center"
      ? Monotonic.unknown(
          (scaleFactor: number) =>
            childDomains[0].run(scaleFactor) / 2 +
            constraint.spacing * (n - 1) +
            childDomains[childDomains.length - 1].run(scaleFactor) / 2
        )
      : Monotonic.adds(
          Monotonic.add(...childDomains),
          constraint.spacing * (n - 1)
        );

  if (dataDriven) return SIZE(composeSize(), measure);
  if (namedKeys.length === n && n > 0) return ORDINAL(namedKeys);
  if (allSize) return SIZE(composeSize(), measure);
  if (targetSpaces.every((s) => isPOSITION(s) && s.domain)) {
    const total = targetSpaces
      .map((s) => Interval.width((s as any).domain))
      .reduce((a, b) => a + b, 0);
    return POSITION(Interval.interval(0, total), measure);
  }
  return UNDEFINED;
}

export function applyDistribute(
  constraint: DistributeConstraint,
  targets: Placeable[]
): void {
  const idx = axisIndex(constraint.dir);
  const ordered =
    constraint.order === "reverse" ? [...targets].reverse() : targets;

  // Find the first already-placed child (the anchor)
  const anchorIdx = ordered.findIndex((t) => isPlacedOn(t, idx));

  if (anchorIdx === -1) {
    // No pre-placed items — start from 0, walk forward
    let pos = 0;
    for (const target of ordered) {
      if (constraint.mode === "center") {
        target.place(constraint.dir, pos, "center");
        pos += constraint.spacing;
      } else {
        target.place(constraint.dir, pos);
        pos += (target.dims[idx].size ?? 0) + constraint.spacing;
      }
    }
    return;
  }

  if (constraint.mode === "edge") {
    // Walk forward from anchor (items after it)
    let pos = ordered[anchorIdx].dims[idx].max! + constraint.spacing;
    for (let i = anchorIdx + 1; i < ordered.length; i++) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        pos = t.dims[idx].max! + constraint.spacing;
      } else {
        t.place(constraint.dir, pos);
        pos += (t.dims[idx].size ?? 0) + constraint.spacing;
      }
    }
    // Walk backward from anchor (items before it), placing via "max" anchor
    pos = ordered[anchorIdx].dims[idx].min! - constraint.spacing;
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        pos = t.dims[idx].min! - constraint.spacing;
      } else {
        t.place(constraint.dir, pos, "max");
        pos -= (t.dims[idx].size ?? 0) + constraint.spacing;
      }
    }
  } else {
    // center-to-center: same bidirectional pattern using center anchor
    let pos = ordered[anchorIdx].dims[idx].center! + constraint.spacing;
    for (let i = anchorIdx + 1; i < ordered.length; i++) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        pos = t.dims[idx].center! + constraint.spacing;
      } else {
        t.place(constraint.dir, pos, "center");
        pos += constraint.spacing;
      }
    }
    pos = ordered[anchorIdx].dims[idx].center! - constraint.spacing;
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const t = ordered[i];
      if (isPlacedOn(t, idx)) {
        pos = t.dims[idx].center! - constraint.spacing;
      } else {
        t.place(constraint.dir, pos, "center");
        pos -= constraint.spacing;
      }
    }
  }
}
