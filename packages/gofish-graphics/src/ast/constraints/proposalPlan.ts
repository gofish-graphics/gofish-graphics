// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { type Size } from "../dims";
import { isValue } from "../data";
import { posScaleFromSpace } from "../domain";
import {
  isBaselineMagnitude,
  isCONTINUOUS,
  isPOSITION,
  type UnderlyingSpace,
} from "../underlyingSpace";
import { allocateSlices } from "./folds";
import type { ConstraintSpec } from ".";
import type { GridConstraint } from "./grid";
import type { ConstraintPosScales } from "./shared";
import type * as Monotonic from "../../util/monotonic";
import { buildNestPlan, type NestPlan, type NestPlanChild } from "./nestPlan";
import { isNestConstraint } from "./nest";
import { isZOrderConstraint } from "./zorder";

export type SliceSegment = {
  dAxis: 0 | 1;
  spacing: number;
  order: string[];
};

/**
 * The set of names whose position or extent is owned by geometric constraints
 * (`align` / `distribute` / `position` / `span` / `nest` / `grid`). Used by
 * `layer.tsx` to decide which children skip phase-1 baseline placement. z-order
 * constraints don't position, so they are excluded.
 *
 * `nest` is special: only the inner child (`children[1]`) skips baseline
 * placement. The outer child (`children[0]`) is baseline-placed first; the
 * placement solver reads that position to center the inner child inside it. */
export function getPositioningConstraintRefs(
  constraints: readonly ConstraintSpec[]
): Set<string> {
  const names = new Set<string>();
  for (const c of constraints) {
    if (isZOrderConstraint(c)) continue;
    if (isNestConstraint(c)) {
      names.add(c.children[1].name);
      continue;
    }
    // grid: every cell is placed by the placement solver, so all skip phase-1
    // baseline.
    for (const ref of c.children) if (ref) names.add(ref.name);
  }
  return names;
}

export type LayerConstraintLayoutPlan = {
  /** Children skipped by phase-1 baseline placement because a positioning
   *  constraint owns their placement/extent. */
  constrainedNames: Set<string>;
  /** Nest dependency/order plan, if any nest derives size. */
  nestPlan: NestPlan | undefined;
  /** Child layout order, source-before-derived for nest dependencies. */
  layoutOrder: number[];
  /** Per-child datum-position target axes; those axes consume a posScale. */
  positionTargetDims: Map<string, Set<0 | 1>>;
};

/** Build the declaration-order-independent child layout plan for a constrained
 *  layer. This packages the pure planning artifacts that the layer executes:
 *  phase-1 placement skipping, nest source-before-derived order, and
 *  datum-position scale consumption. */
export function buildLayerConstraintLayoutPlan(
  childNodes: NestPlanChild[],
  constraints: readonly ConstraintSpec[]
): LayerConstraintLayoutPlan {
  const nestPlan = buildNestPlan([...childNodes], [...constraints]);
  return {
    constrainedNames:
      constraints.length > 0
        ? getPositioningConstraintRefs(constraints)
        : new Set<string>(),
    nestPlan,
    layoutOrder:
      nestPlan?.order ?? Array.from({ length: childNodes.length }, (_, i) => i),
    positionTargetDims: buildPositionTargetDims(constraints),
  };
}

/** Build per-child size proposals from distribute budget segments.
 *
 * This is the top-down adjoint of the distribute SIZE fold: once a layer has a
 * concrete pixel budget, each unambiguous distribute segment slices that axis
 * among its covered children. Overlapping segments on the same axis are a
 * placement-relation graph rather than a spread-like flex slice; skip their
 * size proposals so fixed-size relational diagrams can still solve placement
 * without declaration-order-sensitive proposal ownership. */
export function buildDistributeSliceMap(
  segments: SliceSegment[],
  size: Size
): Map<string, Size> | undefined {
  if (segments.length === 0) return undefined;

  const out = new Map<string, Size>();
  const seen = new Set<string>();
  const ambiguousAxes = new Set<0 | 1>();
  for (const segment of segments) {
    for (const name of segment.order) {
      const key = `${segment.dAxis}:${name}`;
      if (seen.has(key)) ambiguousAxes.add(segment.dAxis);
      seen.add(key);
    }
  }

  for (const segment of segments) {
    if (ambiguousAxes.has(segment.dAxis)) continue;
    const slices = allocateSlices(
      size[segment.dAxis],
      segment.spacing,
      segment.order.length
    );
    segment.order.forEach((name, i) => {
      const cur = out.get(name) ?? ([size[0], size[1]] as Size);
      cur[segment.dAxis] = slices[i];
      out.set(name, cur);
    });
  }

  return out.size === 0 ? undefined : out;
}

/** Choose the concrete size proposed to one child in a layer.
 *
 * Priority is explicit and single-owner:
 *   1. grid: owns the whole layer proposal, so every child gets the cell size;
 *   2. distribute: owns only the named child axes it sliced;
 *   3. default layer box: unconstrained/fill proposal is the full layer size.
 *
 * Nest proposals apply after this, because they derive a child from an already
 * laid-out source and therefore override only the derived axes. */
export function childLayoutSizeProposal(
  childName: string | undefined,
  layerSize: Size,
  gridCell: Size | undefined,
  sliceByName: Map<string, Size> | undefined
): Size {
  if (gridCell !== undefined) return gridCell;
  if (
    sliceByName === undefined ||
    childName === undefined ||
    !sliceByName.has(childName)
  ) {
    return layerSize;
  }
  return sliceByName.get(childName)!;
}

type ScaleBudget = {
  sizeDomain: [
    Monotonic.Monotonic | undefined,
    Monotonic.Monotonic | undefined,
  ];
};

export type ChildScalePlan = {
  basePosScales: ConstraintPosScales;
  childScaleFactors: Size<number | undefined>;
  budgetFailures: { axis: 0 | 1; budget: number }[];
  sharedScaleChecks: {
    axis: 0 | 1;
    space: UnderlyingSpace;
    sigma: number | undefined;
  }[];
};

/** Build the scales a layer hands to child layout.
 *
 * The plan is ordered to match runtime ownership:
 *   1. inherited scales are copied into fresh child arrays;
 *   2. explicit self-scaled axes override with a local position scale or σ;
 *   3. composed constraint SIZE budgets override child σ on their axes;
 *   4. shared-scale scopes solve σ from the layer's own/scoped space.
 *
 * Diagnostics stay with the caller: budget failures are reported so `layer`
 * can warn with context, and shared-scale checks are returned for the solver
 * shadow hook. */
export function buildChildScalePlan(
  selfScaledSpaces: Size<UnderlyingSpace | undefined>,
  layerSpace: Size<UnderlyingSpace> | undefined,
  layerSize: Size,
  inheritedScaleFactors: Size<number | undefined> | undefined,
  inheritedPosScales: ConstraintPosScales,
  constraintBudget: ScaleBudget | undefined,
  shared: Size<boolean>
): ChildScalePlan {
  const basePosScales: ConstraintPosScales = [
    inheritedPosScales[0],
    inheritedPosScales[1],
  ];
  const childScaleFactors: Size<number | undefined> = [
    inheritedScaleFactors?.[0],
    inheritedScaleFactors?.[1],
  ];
  const budgetFailures: ChildScalePlan["budgetFailures"] = [];
  const sharedScaleChecks: ChildScalePlan["sharedScaleChecks"] = [];

  for (const axis of [0, 1] as const) {
    const stashed = selfScaledSpaces[axis];
    if (stashed === undefined || !Number.isFinite(layerSize[axis])) continue;
    if (isPOSITION(stashed)) {
      basePosScales[axis] =
        posScaleFromSpace(stashed, layerSize[axis]) ?? inheritedPosScales[axis];
    }
    if (isBaselineMagnitude(stashed)) {
      childScaleFactors[axis] =
        stashed.width.inverse(layerSize[axis]) ?? inheritedScaleFactors?.[axis];
    }
  }

  if (constraintBudget !== undefined) {
    for (const axis of [0, 1] as const) {
      const dom = constraintBudget.sizeDomain[axis];
      if (dom === undefined || !Number.isFinite(layerSize[axis])) continue;
      const sf = dom.inverse(layerSize[axis], {
        upperBoundGuess: layerSize[axis],
      });
      if (sf !== undefined) childScaleFactors[axis] = sf;
      else budgetFailures.push({ axis, budget: layerSize[axis] });
    }
  }

  for (const axis of [0, 1] as const) {
    if (!shared[axis] || !Number.isFinite(layerSize[axis])) continue;
    const sp = selfScaledSpaces[axis] ?? layerSpace?.[axis];
    if (sp === undefined) continue;
    const sf = isCONTINUOUS(sp)
      ? (sp.width.inverse(layerSize[axis], {
          upperBoundGuess: layerSize[axis],
        }) ?? 0)
      : undefined;
    if (sf !== undefined) childScaleFactors[axis] = sf;
    sharedScaleChecks.push({ axis, space: sp, sigma: sf });
  }

  return {
    basePosScales,
    childScaleFactors,
    budgetFailures,
    sharedScaleChecks,
  };
}

/** A grid owns the whole two-axis proposal scope for its layer. Multiple grids
 * would otherwise be source-order-sensitive because space resolution and
 * proposal sizing can only choose one track partition while placement would see
 * all pins. */
export function selectGridConstraint(
  constraints: readonly ConstraintSpec[]
): GridConstraint | undefined {
  let selected: GridConstraint | undefined;
  for (const constraint of constraints) {
    if (constraint.type !== "grid") continue;
    if (selected !== undefined) {
      throw new Error(
        "Constraint.grid proposal conflict: a layer may have at most one grid constraint"
      );
    }
    selected = constraint;
  }
  return selected;
}

/** Per-child axes whose placement is owned by datum-valued position
 * constraints. Those children must not also receive the same posScale from the
 * enclosing layer: the constraint consumes the scale to place them. Literal
 * pixel positions are deliberately excluded because they do not consume a data
 * scale, so the child may still need that scale for its own geometry. */
export function buildPositionTargetDims(
  constraints: readonly ConstraintSpec[]
): Map<string, Set<0 | 1>> {
  const collected = new Map<string, Set<0 | 1>>();
  for (const constraint of constraints) {
    if (constraint.type !== "position") continue;
    for (const ref of constraint.children) {
      const dims = collected.get(ref.name) ?? new Set<0 | 1>();
      if (constraint.x !== undefined && isValue(constraint.x)) dims.add(0);
      if (constraint.y !== undefined && isValue(constraint.y)) dims.add(1);
      if (dims.size > 0) collected.set(ref.name, dims);
    }
  }
  return new Map(
    [...collected.entries()].sort(([a], [b]) => a.localeCompare(b))
  );
}

export type PositionScalePlan = {
  ownsAxis: [boolean, boolean];
  effectivePosScales: ConstraintPosScales;
};

/** Decide the scales used by this layer's datum-valued position constraints.
 *
 * If the layer owns no datum-position axis, the effective scales are just the
 * inherited/self-scaled base. Once it owns any axis, each axis gets the base
 * scale when one exists, otherwise a local scale from the layer's resolved
 * POSITION space and pixel size. This mirrors the runtime rule that
 * `applyConstraints` consumes a layer-local scale while child forwarding is
 * handled separately by `childPosScalesFor`. */
export function buildPositionScalePlan(
  ownsAxis: [boolean, boolean],
  layerSpace: Size<UnderlyingSpace> | undefined,
  layerSize: Size,
  basePosScales: ConstraintPosScales
): PositionScalePlan {
  const ownsPositionAxis = ownsAxis[0] || ownsAxis[1];
  return {
    ownsAxis,
    effectivePosScales: ownsPositionAxis
      ? [
          basePosScales[0] ?? posScaleFromSpace(layerSpace?.[0], layerSize[0]),
          basePosScales[1] ?? posScaleFromSpace(layerSpace?.[1], layerSize[1]),
        ]
      : [basePosScales[0], basePosScales[1]],
  };
}

/** Decide which data→pixel scales a child receives from an enclosing layer.
 *
 * On axes the layer does not own, forward the inherited/local base scale. On
 * axes the layer owns, forward only to children whose own space is POSITION and
 * whose placement is not already owned by a datum-valued position constraint.
 * This keeps constrained ticks from seeing the scale that placed them while
 * still giving content marks the scale they need for their own geometry. */
export function childPosScalesFor(
  childSpace: Size<UnderlyingSpace> | undefined,
  targetDims: Set<0 | 1> | undefined,
  ownsAxis: readonly [boolean, boolean],
  basePosScales: ConstraintPosScales,
  effectivePosScales: ConstraintPosScales
): ConstraintPosScales {
  const pick = (dim: 0 | 1) => {
    if (!ownsAxis[dim]) return basePosScales[dim];
    if (targetDims?.has(dim)) return undefined;
    return childSpace && isPOSITION(childSpace[dim])
      ? effectivePosScales[dim]
      : undefined;
  };
  return [pick(0), pick(1)];
}
