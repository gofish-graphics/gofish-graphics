// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import type {
  AlignAnchor,
  AlignValue,
  Axis,
  ConstraintPosScales,
  ConstraintRef,
} from "./shared";
import { axisIndex } from "./shared";
import type { UnderlyingSpace } from "../underlyingSpace";
import { isUNDEFINED } from "../underlyingSpace";
import { resolveAlignmentSpace } from "../graphicalOperators/alignment";
import type { PlacementFactEmitter } from "./placementFacts";

/**
 * PROTOTYPE (issue #475): the align constraint's *space-resolution*
 * contribution — the cross-axis half of the spread reduction. Defers entirely
 * to spread's own `resolveAlignmentSpace`, so the fold is the same one spread
 * uses (anchored for start/end/baseline; `middle` drops the anchor → unanchored;
 * union otherwise). `AlignAnchor` and spread's `Alignment` share the same string
 * vocabulary, so the anchor passes through unchanged.
 *
 * Only the uniform-anchor form is handled (a single string, not a per-child
 * array): a heterogeneous anchor array has no single spread equivalent.
 */
export function alignSpaceFold(
  targetSpaces: UnderlyingSpace[],
  anchor: AlignAnchor
): UnderlyingSpace {
  return resolveAlignmentSpace(targetSpaces, anchor);
}

/**
 * Value spec for one axis of an `align` constraint. A single anchor
 * is shared by every child (the common case). An array gives each child its
 * own anchor positionally — `align({x: ["middle", "start"]}, [A, B])` aligns
 * A's center with B's start. The array length must equal `children.length`.
 * `"span"`/`"size"` (#726) are whole-constraint values, not per-child — a
 * heterogeneous array of point anchors has no span/size equivalent, so they
 * are rejected inside an array (see `normalizedAnchors`).
 */
export type AlignAxisSpec = AlignValue | AlignAnchor[];

export interface AlignConstraint {
  type: "align";
  x?: AlignAxisSpec;
  y?: AlignAxisSpec;
  children: ConstraintRef[];
}

export interface AlignOptions {
  x?: AlignAxisSpec;
  y?: AlignAxisSpec;
}

export const createAlignConstraint = (
  { x, y }: AlignOptions,
  children: ConstraintRef[]
): AlignConstraint => {
  if (x === undefined && y === undefined) {
    throw new Error(
      "Constraint.align: at least one of `x` or `y` must be specified"
    );
  }
  return { type: "align", x, y, children };
};

function normalizedAnchors(
  spec: AlignAnchor | AlignAnchor[],
  count: number
): AlignAnchor[] {
  if (!Array.isArray(spec)) return new Array<AlignAnchor>(count).fill(spec);
  if (spec.length !== count) {
    throw new Error(
      `Constraint.align: anchor array length ${spec.length} must match number of children ${count}`
    );
  }
  return spec;
}

/**
 * "Is this align target already positioned by a data scale on this axis?" —
 * the guard that leaves self-positioned children (a scatter facet panel) where
 * their own data scale puts them, instead of moving them to the shared baseline.
 *
 * Stage 6f: this no longer reconstructs the space-pass `free/determined/conflict`
 * lattice by calling a `placementOn` method on the target during lowering. The
 * fact "this (node, axis) is anchored to a POSITION scope" is collected ONCE at
 * the layer boundary (a member of the shared data→pixel map — its baseline is
 * `posScale(0)`, not free to slide) and handed to the ownership plan, which is
 * the single authority the align guard now consults (`isDataPositioned`). It is
 * only meaningful where a data scale exists on the axis (`posScales[axis]`) and
 * the anchor is not `middle` (a center alignment resolves against the box, not a
 * scale origin).
 */
function isDataPositionedAlignTarget(
  name: string,
  anchor: AlignAnchor,
  axis: 0 | 1,
  posScales: ConstraintPosScales | undefined,
  isDataPositioned: (axis: 0 | 1, name: string) => boolean
): boolean {
  if (anchor === "middle" || posScales?.[axis] === undefined) return false;
  return isDataPositioned(axis, name);
}

export function lowerAlignPlacement(
  constraint: AlignConstraint,
  owner: string,
  {
    emitter,
    targets,
    posScales,
    isPinned,
    isDataPositioned,
  }: {
    emitter: PlacementFactEmitter;
    targets: Map<string, Placeable>;
    posScales: ConstraintPosScales | undefined;
    isPinned: (axis: Axis, name: string) => boolean;
    isDataPositioned: (axis: 0 | 1, name: string) => boolean;
  }
): void {
  /**
   * `"span"`/`"size"` (#726): equate an interval statistic against the first
   * PINNED (already-placed) child — the source — rather than a point anchor.
   * Scope: the unbound-target case only (§3.5 of
   * operators-over-placed-nodes.md) — a target with no intrinsic size on this
   * axis (`isUNDEFINED` on its resolved space). A target that already has an
   * intrinsic size is an ownership conflict (two writers for one cell): report
   * it, don't clobber or silently skip.
   */
  const emitSpanOrSize = (axis: Axis, kind: "span" | "size") => {
    const idx = axisIndex(axis);
    const children = constraint.children.filter((child) =>
      targets.has(child.name)
    );
    if (children.length < 2) return;
    const sourceRef = children.find((child) => isPinned(axis, child.name));
    if (!sourceRef) {
      throw new Error(
        `Constraint.align: "${kind}" on axis "${axis}" (${owner}) needs an ` +
          `already-placed source — none of [${children
            .map((c) => c.name)
            .join(", ")}] is placed yet.`
      );
    }
    const source = targets.get(sourceRef.name)!;
    const sourceMin = source.dims[idx].min;
    const sourceSize = source.dims[idx].size;
    if (sourceMin === undefined || sourceSize === undefined) {
      throw new Error(
        `Constraint.align: "${kind}" on axis "${axis}" (${owner}) source ` +
          `"${sourceRef.name}" has no resolved extent yet.`
      );
    }
    for (const child of children) {
      if (child.name === sourceRef.name) continue;
      const target = targets.get(child.name)!;
      const space = target.spaceOn?.(idx);
      if (space === undefined || !isUNDEFINED(space)) {
        throw new Error(
          `Constraint.align: "${kind}" on axis "${axis}" (${owner}) cannot ` +
            `set "${child.name}"'s ${
              kind === "size" ? "size" : "position and size"
            } — it already has an intrinsic ${
              axis === "x" ? "width" : "height"
            } (writer: "${child.name}"'s own size option). "${kind}" only ` +
            `applies to a target with no intrinsic size on that axis.`
        );
      }
      if (kind === "span") {
        emitter.pin({
          axis,
          target: { name: child.name, anchor: "start" },
          value: sourceMin,
          owner,
        });
        emitter.pin({
          axis,
          target: { name: child.name, anchor: "end" },
          value: sourceMin + sourceSize,
          owner,
        });
      } else {
        emitter.pinSize({ axis, name: child.name, value: sourceSize, owner });
      }
    }
  };

  const emit = (axis: Axis, spec: AlignAxisSpec | undefined) => {
    if (spec === undefined) return;
    if (spec === "span" || spec === "size") {
      emitSpanOrSize(axis, spec);
      return;
    }
    const children = constraint.children.filter((child) =>
      targets.has(child.name)
    );
    if (children.length === 0) return;
    const anchors = normalizedAnchors(spec, children.length);

    const entries = children.map((child, index) => ({
      child,
      anchor: anchors[index],
    }));
    const idx = axisIndex(axis);

    // Preserve legacy align's two-phase semantics:
    // 1. the first already-placed target can define the shared baseline;
    // 2. already-placed or data-positioned targets are not themselves moved.
    //
    // Keeping these separate matters for chart+legend layers: the chart may
    // be the baseline source while the legend is the only target align
    // writes. Faceted scatter panels, where every panel is already
    // data-positioned, still contribute no write targets.
    const source = entries.find(({ child }) => isPinned(axis, child.name));
    const nonPinned = entries.filter(
      ({ child }) => !isPinned(axis, child.name)
    );
    const movable = nonPinned.filter(({ child, anchor }) => {
      return !isDataPositionedAlignTarget(
        child.name,
        anchor,
        idx,
        posScales,
        isDataPositioned
      );
    });
    if (movable.length === 0) {
      // Nothing this constraint can write is either the deliberate
      // data-positioned skip (scatter facets — stay silent, `align` never
      // fights a self-scaled panel) or a genuine "every operand is already
      // placed" no-op, which is worth an honest diagnostic (#725 item 6)
      // rather than a silent nothing.
      const allDataPositioned =
        nonPinned.length > 0 &&
        nonPinned.every(({ child, anchor }) => {
          return isDataPositionedAlignTarget(
            child.name,
            anchor,
            idx,
            posScales,
            isDataPositioned
          );
        });
      if (!allDataPositioned) {
        console.warn(
          `[align] ${owner} on axis "${axis}": nothing movable — every ` +
            `operand [${children.map((c) => c.name).join(", ")}] is ` +
            `already placed.`
        );
      }
      return;
    }

    if (source) {
      for (const target of movable) {
        emitter.relate({
          axis,
          from: { name: source.child.name, anchor: source.anchor },
          to: { name: target.child.name, anchor: target.anchor },
          gap: 0,
          owner,
        });
      }
      return;
    }

    const aligned = movable;
    for (let i = 1; i < aligned.length; i++) {
      emitter.relate({
        axis,
        from: { name: aligned[0].child.name, anchor: aligned[0].anchor },
        to: { name: aligned[i].child.name, anchor: aligned[i].anchor },
        gap: 0,
        owner,
      });
    }
    emitter.include({
      axis,
      name: aligned[0].child.name,
      owner,
    });
  };
  emit("x", constraint.x);
  emit("y", constraint.y);
}
