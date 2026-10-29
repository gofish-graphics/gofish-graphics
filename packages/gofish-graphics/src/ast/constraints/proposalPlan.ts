// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import { type Size } from "../dims";
import { isValue } from "../data";
import { isPositionInterval, type PositionRegion } from "./position";
import { compilePlacementCoordinate } from "./placementLowering";
import { originIs, type UnderlyingSpace } from "../underlyingSpace";
import { mapsDomain, type Extent } from "../extent";
import type { AxisMap } from "../domain";
import { sliceExtent } from "./folds";
import {
  frameOf,
  scopeFrame,
  seatInScope,
  type FixedSolve,
  type ScopeRegistry,
  type ScopeSolution,
} from "../solver/scopes";
import type { ConstraintSpec } from ".";
import type { GridConstraint } from "./grid";
import { keyOf, type ConstraintPosScales } from "./shared";
import { buildNestPlan, type NestPlan, type NestPlanChild } from "./nestPlan";
import { isNestConstraint } from "./nest";
import { isZOrderConstraint } from "./zorder";

export type SliceSegment = {
  dAxis: 0 | 1;
  spacing: number;
  order: string[];
};

/**
 * The set of operand keys whose position or extent is owned by geometric constraints
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
  const keys = new Set<string>();
  for (const c of constraints) {
    if (isZOrderConstraint(c)) continue;
    if (isNestConstraint(c)) {
      keys.add(keyOf(c.children[1]));
      continue;
    }
    // grid: every cell is placed by the placement solver, so all skip phase-1
    // baseline.
    for (const ref of c.children) if (ref) keys.add(keyOf(ref));
  }
  return keys;
}

export type LayerConstraintLayoutPlan = {
  /** Children skipped by phase-1 baseline placement because a positioning
   *  constraint owns their placement/extent. */
  constrainedKeys: Set<string>;
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
    constrainedKeys:
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
    // Spacing larger than the budget leaves no room: the parts are then
    // sliced as if it took none, so they stay visible and the chain
    // overflows (the layer warns, `spacingOverflow`).
    const n = segment.order.length;
    const fitted = sliceExtent(size[segment.dAxis], segment.spacing, n);
    const slice = fitted >= 0 ? fitted : size[segment.dAxis] / n;
    for (const name of segment.order) {
      const cur = out.get(name) ?? ([size[0], size[1]] as Size);
      cur[segment.dAxis] = slice;
      out.set(name, cur);
    }
  }

  return out.size === 0 ? undefined : out;
}

/**
 * The span each child is laid out in, per axis, from a layer's `position`
 * constraints, in one walk of them: the pixel length of each interval that
 * pins it there, and of the cell a `region` gives it there (a
 * {@link PositionRegion}: a `partition`'s cell). `posScales` are the scales
 * the layer resolves its position constraints against; a datum edge with no
 * scale gives nothing.
 *
 * An interval coordinate `[min, max]` pins both edges of its target, so it
 * DETERMINES the target's extent on that axis (`lowerPositionPlacement`).
 * This is the top-down side of that pin: the target is laid out in the span
 * it will be pinned across, so its content fills the span (a scatter's
 * range), rather than being laid out in the whole layer and then stretched
 * or shrunk by the pins. A cell is not a pin: the target is laid out in its
 * length and then centered in it (`lowerPositionPlacement`), so a mark with
 * no size of its own there fills it and one with a size of its own sits in
 * its middle.
 */
export function buildChildSpans(
  constraints: readonly ConstraintSpec[],
  posScales: ConstraintPosScales
): Map<string, Size<number | undefined>> | undefined {
  const spanByName = new Map<string, Size<number | undefined>>();
  for (const c of constraints) {
    if (c.type !== "position") continue;
    for (const axis of [0, 1] as const) {
      const coord = axis === 0 ? c.x : c.y;
      const edges = isPositionInterval(coord) ? coord : c.region?.spans[axis];
      if (edges === undefined) continue;
      const a = compilePlacementCoordinate(edges[0], posScales[axis]);
      const b = compilePlacementCoordinate(edges[1], posScales[axis]);
      if (a === undefined || b === undefined) continue;
      for (const ref of c.children) {
        if (!ref) continue;
        const cur = spanByName.get(keyOf(ref)) ?? [undefined, undefined];
        cur[axis] = Math.abs(b - a);
        spanByName.set(keyOf(ref), cur);
      }
    }
  }
  return spanByName.size === 0 ? undefined : spanByName;
}

/** Choose the concrete size proposed to one child in a layer.
 *
 * Priority is explicit and single-owner:
 *   1. grid: each cell is proposed ITS (column, row) track's extent (resolved by
 *      the unified max rule in `resolveGridTracks`), keyed by name;
 *   2. the child's own room in a share scope (`own`, where defined): its
 *      claim at the layer's σ, when σ is the size of a share
 *      (`GoFishNode.sharesRoom`), so a band is one σ and what hangs off it
 *      keeps the room the scope solved for it;
 *   3. distribute: owns only the named child axes it sliced;
 *   4. default layer box: unconstrained/fill proposal is the full layer size.
 *
 * A span (`spanByName`, {@link buildChildSpans}) then owns the axes it
 * spans: an interval's pins set the child's extent there, and a cell is the
 * room the child is laid out in, whatever else proposed one.
 *
 * Nest proposals apply after this, because they derive a child from an already
 * laid-out source and therefore override only the derived axes. */
export function childLayoutSizeProposal(
  childName: string | undefined,
  layerSize: Size,
  gridCellByName: Map<string, Size> | undefined,
  sliceByName: Map<string, Size> | undefined,
  spanByName?: Map<string, Size<number | undefined>>,
  own: Size<number | undefined> = [undefined, undefined]
): Size {
  let proposal: Size = layerSize;
  if (
    gridCellByName !== undefined &&
    childName !== undefined &&
    gridCellByName.has(childName)
  ) {
    proposal = gridCellByName.get(childName)!;
  } else {
    if (
      sliceByName !== undefined &&
      childName !== undefined &&
      sliceByName.has(childName)
    )
      proposal = sliceByName.get(childName)!;
    if (own[0] !== undefined || own[1] !== undefined)
      proposal = [own[0] ?? proposal[0], own[1] ?? proposal[1]];
  }
  const span = childName !== undefined ? spanByName?.get(childName) : undefined;
  if (span !== undefined)
    proposal = [span[0] ?? proposal[0], span[1] ?? proposal[1]];
  return proposal;
}

export type LayerScales = {
  /** Per axis: the layer's frame, the map its children sit in
   *  (`seatInScope`) and its datum positions resolve against. */
  frames: ConstraintPosScales;
  /** Per axis: the σ the layer hands its children. */
  sigmas: Size<number | undefined>;
  /** Per axis: the scope the layer seats its children in (`seatInScope`):
   *  the scope it solved there, or the frame it inherits. */
  scopes: Size<ScopeSolution | undefined>;
  /** Axes whose solve was attempted and failed (a claim with no σ in it). */
  failedAxes: (0 | 1)[];
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
 *   - or it holds pinned data in a slot its parent nests it in (`inSlot`: a
 *     spread, grid or treemap slot, a facet panel). Its box is that slot;
 *   - or nothing above it solved a σ to hand it (`handedSigmas` is
 *     undefined): it is the top of its space, and its box is the size it is
 *     given.
 *
 * A child its parent places at a datum is not sized: its position is a
 * value in its parent's frame, so it inherits its parent's σ, as a scatter's
 * glyphs do. So is a spread of magnitudes along its direction: its parts are
 * parts of one chain claim, solved by the sized node above it.
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
  // Per axis: its parent nests it in a slot of its own (`inSlot`). Read
  // last, only when the other conditions leave it to decide.
  inSlot: (axis: 0 | 1) => boolean,
  layerSize: Size,
  handedSigmas: Size<number | undefined>,
  handedMaps: ConstraintPosScales,
  scope: (
    axis: 0 | 1,
    space: UnderlyingSpace | undefined,
    claim: Extent
  ) => [UnderlyingSpace | undefined, Extent | undefined],
  scopes: ScopeRegistry,
  rootKey: string,
  // Per axis: the scope a literal size solved in the claim walk.
  fixed: Size<FixedSolve | undefined> = [undefined, undefined]
): LayerScales {
  const frames: [AxisMap | undefined, AxisMap | undefined] = [
    undefined,
    undefined,
  ];
  const sigmas: Size<number | undefined> = [handedSigmas[0], handedSigmas[1]];
  const seatScopes: [ScopeSolution | undefined, ScopeSolution | undefined] = [
    undefined,
    undefined,
  ];
  const failedAxes: (0 | 1)[] = [];
  const checks: LayerScales["checks"] = [];

  for (const axis of [0, 1] as const) {
    const content = contentSpaces?.[axis];
    const sized =
      ownSize[axis] ||
      (handedMaps[axis] === undefined &&
        (handedSigmas[axis] === undefined ||
          (originIs(content, "pinned") && inSlot(axis))));
    const claim = contentExtents[axis];
    // A claim that maps no domain (content that is only fixed boxes) has
    // nothing to solve: the layer inherits.
    if (
      sized &&
      Number.isFinite(layerSize[axis]) &&
      mapsDomain(content, claim)
    ) {
      // A literal size was solved once in the claim walk (`solveFixed`);
      // any other sized node solves here, against the size it is given.
      const solve = (): FixedSolve | undefined => {
        const [space, nicedClaim] = scope(axis, content, claim);
        const solution = scopes.solveScope(
          { kind: "sized", rootKey, axis },
          space,
          nicedClaim,
          layerSize[axis]
        );
        return (
          solution &&
          nicedClaim && {
            key: undefined,
            solution,
            claim: nicedClaim,
            space,
            box: layerSize[axis],
          }
        );
      };
      const s = fixed[axis] ?? solve();
      const solved = s?.solution;
      checks.push({ axis, extent: s?.claim, sigma: solved?.sigma });
      if (solved !== undefined) {
        sigmas[axis] = solved.sigma;
        frames[axis] = scopeFrame(solved);
        seatScopes[axis] = solved;
        continue;
      }
      failedAxes.push(axis);
    }
    frames[axis] = frameOf(reported?.[axis], {
      sigma: sigmas[axis],
      map: handedMaps[axis],
    });
    seatScopes[axis] = frames[axis];
  }
  return { frames, sigmas, scopes: seatScopes, failedAxes, checks };
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
      const dims = collected.get(keyOf(ref)) ?? new Set<0 | 1>();
      if (constraint.x !== undefined && isValue(constraint.x)) dims.add(0);
      if (constraint.y !== undefined && isValue(constraint.y)) dims.add(1);
      if (dims.size > 0) collected.set(keyOf(ref), dims);
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
  frames: ConstraintPosScales,
  seats: readonly [number | undefined, number | undefined] = [
    undefined,
    undefined,
  ]
): ConstraintPosScales {
  const pick = (dim: 0 | 1) => {
    if (targetDims?.has(dim)) return undefined;
    const map = seatInScope(frames[dim], childSpace?.[dim]).childMap;
    // A child whose origin the layer pins at a literal pixel shares the
    // frame from there: its own 0 is that pixel.
    const seat = seats[dim];
    return map === undefined || seat === undefined || seat === 0
      ? map
      : { ...map, originPx: map.originPx - seat };
  };
  return [pick(0), pick(1)];
}
