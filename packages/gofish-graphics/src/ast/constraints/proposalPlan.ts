// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { type Size } from "../dims";
import { isValue } from "../data";
import { type UnderlyingSpace, originIs } from "../underlyingSpace";
import { niceScope, type Extent } from "../extent";
import { sliceExtent } from "./folds";
import { scopeMap, type ScopeRegistry } from "../solver/scopes";
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
 * (`align` / `distribute` / `position` / `nest` / `grid`). Used by
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
    const slice = sliceExtent(
      size[segment.dAxis],
      segment.spacing,
      segment.order.length
    );
    for (const name of segment.order) {
      const cur = out.get(name) ?? ([size[0], size[1]] as Size);
      cur[segment.dAxis] = slice;
      out.set(name, cur);
    }
  }

  return out.size === 0 ? undefined : out;
}

/** Choose the concrete size proposed to one child in a layer.
 *
 * Priority is explicit and single-owner:
 *   1. grid: each cell is proposed ITS (column, row) track's extent (resolved by
 *      the unified max rule in `resolveGridTracks`), keyed by name;
 *   2. distribute: owns only the named child axes it sliced;
 *   3. default layer box: unconstrained/fill proposal is the full layer size.
 *
 * Nest proposals apply after this, because they derive a child from an already
 * laid-out source and therefore override only the derived axes. */
export function childLayoutSizeProposal(
  childName: string | undefined,
  layerSize: Size,
  gridCellByName: Map<string, Size> | undefined,
  sliceByName: Map<string, Size> | undefined
): Size {
  if (
    gridCellByName !== undefined &&
    childName !== undefined &&
    gridCellByName.has(childName)
  ) {
    return gridCellByName.get(childName)!;
  }
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
  /** Per axis: the pixel of data 0 in a self-scaled stash's scope, where the
   *  layer seats its free children's baselines. */
  stashOriginPx: Size<number | undefined>;
  budgetFailures: { axis: 0 | 1; budget: number }[];
  sharedScaleChecks: {
    axis: 0 | 1;
    extent: Extent | undefined;
    sigma: number | undefined;
  }[];
};

/** Build the scales a layer hands to child layout.
 *
 * The plan is ordered to match runtime ownership:
 *   1. inherited scales are copied into fresh child arrays;
 *   2. explicit self-scaled axes solve their own scope: σ, and a local map
 *      when the stash is pinned;
 *   3. composed constraint SIZE budgets override child σ on their axes;
 *   4. shared-scale scopes solve σ from the layer's own/scoped space.
 *
 * Diagnostics stay with the caller: budget failures are reported so `layer`
 * can warn with context, and shared-scale checks are returned for the solver
 * shadow hook. */
export function buildChildScalePlan(
  selfScaledSpaces: Size<UnderlyingSpace | undefined>,
  selfScaledExtents: Size<Extent | undefined>,
  layerSpace: Size<UnderlyingSpace> | undefined,
  layerExtent: Size<Extent | undefined> | undefined,
  layerSize: Size,
  inheritedScaleFactors: Size<number | undefined> | undefined,
  inheritedPosScales: ConstraintPosScales,
  constraintBudget: ScaleBudget | undefined,
  shared: Size<boolean>,
  // Demand-driven nicing (issue #659): per-dim "some node in this scope renders
  // an axis" (`GoFishNode.scopeRendersAxis`). A scope this plan roots nices its
  // anchored POSITION domain iff the dim's demand is true — nicing is a
  // presentation adjustment whose demand comes from axis views, so axis-less
  // content stays at the honest raw scale.
  axisDemand: (axis: 0 | 1) => boolean,
  // The ONE σ-solve site. Every scale this plan roots is derived
  // through the registry (so `GOFISH_DUMP_SCOPES` sees it and the numbers have a
  // single source); `rootKey` labels the owning layer node in the dump.
  scopes: ScopeRegistry,
  rootKey: string
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

  // Nice each axis-demanded self-scaled stash up front (issue #659): a
  // self-scaled region is a σ-scope root, so when its scope renders an axis on
  // the dim, its anchored POSITION domain is niced AT this solve — the same
  // operation the render root applies. The original bug was precisely that this
  // stash sidestepped the (now-deleted) pre-layout nice walk, so the panel's
  // content sized against the RAW domain while a niced width solved an orphan
  // scope. Nicing here (or, without axis demand, leaving the raw domain here)
  // makes the ONE scope's type and claim the single source of its solve
  // (`solveScope`, which yields σ and, for a pinned type, the map). The
  // shared step below reads the stash again, so transform a local copy.
  const nicedSelfScaled = ([0, 1] as const).map((axis) =>
    niceScope(selfScaledSpaces[axis], selfScaledExtents[axis], axisDemand(axis))
  ) as [UnderlyingSpace | undefined, Extent | undefined][];

  // A self-scaled stash roots its own scope, exactly like the chart root:
  // σ for every stash, and, for a pinned one, the local map its children share
  // (a free stash seats its children's baselines at `originPx` instead).
  const stashOriginPx: Size<number | undefined> = [undefined, undefined];
  for (const axis of [0, 1] as const) {
    const [stashed, stashedExtent] = nicedSelfScaled[axis];
    if (stashed === undefined || !Number.isFinite(layerSize[axis])) continue;
    const scope = scopes.solveScope(
      { kind: "self-scaled", rootKey, axis },
      stashed,
      stashedExtent,
      layerSize[axis]
    );
    if (scope === undefined) continue;
    childScaleFactors[axis] = scope.sigma;
    stashOriginPx[axis] = scope.originPx;
    // The stash's scope replaces the inherited one on this axis: a pinned
    // stash hands its children its own map; a free one hands them none (it
    // seats their baselines at `originPx` itself), never the ancestor's map,
    // whose σ is another scope's.
    basePosScales[axis] = scopeMap(stashed, scope);
  }

  if (constraintBudget !== undefined) {
    for (const axis of [0, 1] as const) {
      const dom = constraintBudget.sizeDomain[axis];
      if (dom === undefined || !Number.isFinite(layerSize[axis])) continue;
      // Structural σ-scope rule: ONLY A SCOPE ROOT SOLVES. This budget roots a
      // scope on the axis unless an ancestor scope already owns it — i.e. an
      // inherited σ is present AND this layer introduced no pixel scope of its
      // own (no self-scaled space). In that INTERMEDIATE case the inherited σ has
      // already been copied into `childScaleFactors`, so inherit it: do NOT
      // re-root by inverting the local σ-fold against the allocated size. The
      // re-derive-equal cases produce the same σ (no-op); the divergent case is
      // an equal-slice budget under a coord, where the distribute axis IS the
      // σ-scaled axis — a nested group would otherwise silently re-derive a
      // smaller σ.
      const rootsScope =
        inheritedScaleFactors?.[axis] === undefined ||
        selfScaledSpaces[axis] !== undefined;
      if (!rootsScope) continue;
      const sf = scopes.solveSize(
        { kind: "constraint-budget", rootKey, axis },
        dom,
        layerSize[axis],
        { upperBoundGuess: layerSize[axis] }
      );
      if (sf !== undefined) childScaleFactors[axis] = sf;
      else budgetFailures.push({ axis, budget: layerSize[axis] });
    }
  }

  for (const axis of [0, 1] as const) {
    if (!shared[axis] || !Number.isFinite(layerSize[axis])) continue;
    // The same structural rule as the budget above: only a scope root
    // solves. A shared-scale node under an ancestor that already owns σ on
    // the axis (a chart nested in another chart's mark) inherits it.
    if (
      inheritedScaleFactors?.[axis] !== undefined &&
      selfScaledSpaces[axis] === undefined
    )
      continue;
    // A shared-scale scope root: when the scope renders an axis on this dim,
    // nice its anchored POSITION domain at the solve (issue #659), so the SIZE
    // σ it derives agrees with the niced position map. The self-scaled stash is
    // already demand-niced above; the layer's own space is transformed here
    // (identity without axis demand). The solve reads the claim: a spread of
    // magnitudes is ordinal but still claims σ-dependent room.
    const [sp, ext] =
      nicedSelfScaled[axis][0] !== undefined
        ? nicedSelfScaled[axis]
        : niceScope(layerSpace?.[axis], layerExtent?.[axis], axisDemand(axis));
    if (sp === undefined) continue;
    const sf =
      ext !== undefined
        ? (scopes.solveScope(
            { kind: "shared", rootKey, axis },
            sp,
            ext,
            layerSize[axis]
          )?.sigma ?? 0)
        : undefined;
    if (sf !== undefined) childScaleFactors[axis] = sf;
    sharedScaleChecks.push({ axis, extent: ext, sigma: sf });
  }

  // A free layer's own frame has its baseline, data 0, at local 0. So where
  // no map reaches it, it hands its children the map of that frame: a pinned
  // child (a rule at `y: "amount"` among free bars) places its data through
  // it, as it would in any frame with data coordinates.
  for (const axis of [0, 1] as const) {
    const sigma = childScaleFactors[axis];
    if (
      basePosScales[axis] === undefined &&
      sigma !== undefined &&
      selfScaledSpaces[axis] === undefined &&
      originIs(layerSpace?.[axis], "free")
    )
      basePosScales[axis] = { sigma, originPx: 0 };
  }

  return {
    basePosScales,
    childScaleFactors,
    stashOriginPx,
    budgetFailures,
    sharedScaleChecks,
  };
}

/** Select the layer's single grid constraint, if any.
 *
 * A grid resolves its tracks under the unified max rule (`resolveGridTracks`)
 * composes with sibling constraints: its per-track claim participates in
 * sizing, and its cell-center pins solve jointly with any align/position/z-order
 * on the same layer. At most one grid per layer: two track partitions on one
 * layer would be source-order-sensitive, so a second one is an error. */
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

/** Per-child axes whose placement is owned by datum-valued *point* position
 * constraints. Those children must not also receive the same posScale from the
 * enclosing layer: the constraint consumes the scale to place them. Literal
 * pixel positions are deliberately excluded because they do not consume a data
 * scale, so the child may still need that scale for its own geometry. Interval
 * (`[min, max]`) coordinates are also excluded — `isValue` is false for the
 * array — matching the pre-unification span behavior, where the target still
 * received the layer scale for its own geometry. */
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
 * scale when one exists, otherwise a local scale the registry solves from the
 * layer's resolved POSITION space, its size claim, and its pixel size. This mirrors the runtime rule that
 * `applyConstraints` consumes a layer-local scale while child forwarding is
 * handled separately by `childPosScalesFor`. */
export function buildPositionScalePlan(
  ownsAxis: [boolean, boolean],
  layerSpace: Size<UnderlyingSpace> | undefined,
  layerExtent: Size<Extent | undefined> | undefined,
  layerSize: Size,
  basePosScales: ConstraintPosScales,
  // Demand-driven nicing (issue #659): nice the local domain only when the
  // scope renders an axis on that dim, so datum positions land on the same
  // rounded scale as the ticks — and stay at the honest raw scale otherwise.
  axisDemand: (axis: 0 | 1) => boolean,
  scopes: ScopeRegistry,
  rootKey: string
): PositionScalePlan {
  const ownsPositionAxis = ownsAxis[0] || ownsAxis[1];
  // A layer that owns a datum-position axis roots a local POSITION scope for
  // it; the domain is niced at this solve iff the dim has axis demand.
  const localMap = (axis: 0 | 1) => {
    const [space, extent] = niceScope(
      layerSpace?.[axis],
      layerExtent?.[axis],
      axisDemand(axis)
    );
    const scope = scopes.solveScope(
      { kind: "datum-position", rootKey, axis },
      space,
      extent,
      layerSize[axis]
    );
    return scopeMap(space, scope);
  };
  return {
    ownsAxis,
    effectivePosScales: ownsPositionAxis
      ? [basePosScales[0] ?? localMap(0), basePosScales[1] ?? localMap(1)]
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
    return childSpace && originIs(childSpace[dim], "pinned")
      ? effectivePosScales[dim]
      : undefined;
  };
  return [pick(0), pick(1)];
}
