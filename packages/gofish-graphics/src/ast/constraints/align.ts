// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Placeable } from "../_node";
import type {
  AlignAnchor,
  Axis,
  ConstraintPosScales,
  ConstraintRef,
} from "./shared";
import { axisIndex } from "./shared";
import type { UnderlyingSpace } from "../underlyingSpace";
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
 * Anchor spec for one axis of an `align` constraint. A single anchor
 * is shared by every child (the common case). An array gives each child its
 * own anchor positionally — `align({x: ["middle", "start"]}, [A, B])` aligns
 * A's center with B's start. The array length must equal `children.length`.
 */
export type AlignAxisSpec = AlignAnchor | AlignAnchor[];

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

function normalizedAnchors(spec: AlignAxisSpec, count: number): AlignAnchor[] {
  if (!Array.isArray(spec)) return new Array<AlignAnchor>(count).fill(spec);
  if (spec.length !== count) {
    throw new Error(
      `Constraint.align: anchor array length ${spec.length} must match number of children ${count}`
    );
  }
  return spec;
}

function isDataPositionedAlignTarget(
  target: Placeable | undefined,
  anchor: AlignAnchor,
  axis: 0 | 1,
  posScales: ConstraintPosScales | undefined
): boolean {
  if (anchor === "middle" || posScales?.[axis] === undefined) return false;
  const placement =
    typeof target?.placementOn === "function"
      ? target.placementOn(axis)
      : undefined;
  return placement !== undefined && placement.tag !== "free";
}

export function lowerAlignPlacement(
  constraint: AlignConstraint,
  owner: string,
  {
    emitter,
    targets,
    posScales,
    isPinned,
  }: {
    emitter: PlacementFactEmitter;
    targets: Map<string, Placeable>;
    posScales: ConstraintPosScales | undefined;
    isPinned: (axis: Axis, name: string) => boolean;
  }
): void {
  const emit = (axis: Axis, spec: AlignAxisSpec | undefined) => {
    if (spec === undefined) return;
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
    const movable = entries.filter(({ child, anchor }) => {
      if (isPinned(axis, child.name)) return false;
      const target = targets.get(child.name);
      return !isDataPositionedAlignTarget(target, anchor, idx, posScales);
    });
    if (movable.length === 0) return;

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
