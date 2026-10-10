// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { type Size } from "../dims";
import { isValue } from "../data";
import { originIs, type UnderlyingSpace } from "../underlyingSpace";
import { type Extent } from "../extent";
import type { AxisMap } from "../domain";
import { sliceExtent } from "./folds";
import {
  frameOf,
  scopeFrame,
  seatInScope,
  type ScopeRegistry,
} from "../solver/scopes";
import type { ConstraintSpec } from ".";
import type { GridConstraint } from "./grid";
import type { ConstraintPosScales } from "./shared";
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

export type LayerScales = {
  /** Per axis: the layer's frame, the map its children sit in
   *  (`seatInScope`) and its datum positions resolve against. */
  frames: ConstraintPosScales;
  /** Per axis: the σ the layer hands its children. */
  sigmas: Size<number | undefined>;
  /** Axes whose solve was attempted and failed (a claim with no σ in it). */
  failures: { axis: 0 | 1; budget: number }[];
  /** Every solve, for the solver shadow hook. */
  checks: {
    axis: 0 | 1;
    extent: Extent | undefined;
    sigma: number | undefined;
  }[];
};

/**
 * The scales a layer hands its children, under the one rule of #1114: a
 * SIZED node solves σ, and every other node inherits it. A layer is sized on
 * an axis when its size there is given to it rather than computed from σ:
 *
 *   - it has a size of its own (`ownSize`): a literal `w`/`h`, or a
 *     data-valued one, whose box its parent's σ sizes and whose content it
 *     maps into that box;
 *   - or it is handed no frame and has data of its own to place: a layer
 *     handed no σ at all (nothing above it could solve one), or a pinned
 *     layer handed σ but no frame (a facet panel in its spread slot, a child
 *     nested at a datum). Its box is the slot its parent gives it.
 *
 * A sized node maps its keyed domain (the domain of its content's unit in its
 * space, see `keyedDomains.ts`) into its size: `scope` widens its claim to
 * the domain and nices it when an axis is drawn over it
 * (`KeyedDomains.scope`), and the result is solved once through the registry
 * (`solveScope`). Its frame is the solved
 * scope's. Every other axis inherits σ, and its frame follows from its type
 * ({@link frameOf}).
 */
export function solveLayerScales(
  ownSize: Size<boolean>,
  // The layer's content: the types its children compose to and their claim.
  // For a data-valued size this is the content inside the box, not the
  // magnitude the layer reports.
  contentSpaces: Size<UnderlyingSpace> | undefined,
  contentExtents: Size<Extent | undefined>,
  // What the layer reports upward, whose frame it has when it inherits.
  reported: Size<UnderlyingSpace> | undefined,
  layerSize: Size,
  handedSigmas: Size<number | undefined>,
  handedMaps: ConstraintPosScales,
  scope: (
    axis: 0 | 1,
    space: UnderlyingSpace | undefined,
    claim: Extent
  ) => [UnderlyingSpace | undefined, Extent | undefined],
  scopes: ScopeRegistry,
  rootKey: string
): LayerScales {
  const frames: [AxisMap | undefined, AxisMap | undefined] = [
    undefined,
    undefined,
  ];
  const sigmas: Size<number | undefined> = [handedSigmas[0], handedSigmas[1]];
  const failures: LayerScales["failures"] = [];
  const checks: LayerScales["checks"] = [];

  for (const axis of [0, 1] as const) {
    const content = contentSpaces?.[axis];
    const sized =
      ownSize[axis] ||
      (handedMaps[axis] === undefined &&
        (handedSigmas[axis] === undefined || originIs(content, "pinned")));
    const claim = contentExtents[axis];
    if (sized && Number.isFinite(layerSize[axis]) && claim !== undefined) {
      const [space, nicedClaim] = scope(axis, content, claim);
      const solved = scopes.solveScope(
        { kind: "sized", rootKey, axis },
        space,
        nicedClaim,
        layerSize[axis]
      );
      checks.push({ axis, extent: nicedClaim, sigma: solved?.sigma });
      if (solved !== undefined) {
        sigmas[axis] = solved.sigma;
        frames[axis] = scopeFrame(solved);
        continue;
      }
      failures.push({ axis, budget: layerSize[axis] });
    }
    frames[axis] = frameOf(reported?.[axis], {
      sigma: sigmas[axis],
      map: handedMaps[axis],
    });
  }
  return { frames, sigmas, failures, checks };
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

/** Decide which data→pixel scales a child receives from an enclosing layer:
 * the map the one seating rule hands it in the layer's frame
 * (`seatInScope`). A child whose placement a datum-valued position
 * constraint owns gets none, so a constrained tick never sees the scale that
 * placed it. */
export function childPosScalesFor(
  childSpace: Size<UnderlyingSpace> | undefined,
  targetDims: Set<0 | 1> | undefined,
  ownsAxis: readonly [boolean, boolean],
  frames: ConstraintPosScales
): ConstraintPosScales {
  const pick = (dim: 0 | 1) => {
    if (ownsAxis[dim] && targetDims?.has(dim)) return undefined;
    return seatInScope(frames[dim], childSpace?.[dim]).childMap;
  };
  return [pick(0), pick(1)];
}
