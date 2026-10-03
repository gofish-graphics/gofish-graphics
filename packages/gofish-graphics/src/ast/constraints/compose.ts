// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// ── Per-axis constraint composition (the max-plus fold) ──────────────────────
//
// One rule, applied per axis, composes a layer's constraints into a claim the
// parent can invert for auto-fit (and into a budget for sizing covered
// children):
//
//   claim(axis) = max-union over {
//     each distribute(dir = axis):   its summed fold (Σ extent + spacing)   — series
//     each align(spec on axis):      its overlay fold (resolveAlignmentSpace) — overlay
//     each child covered by neither: its raw extent                        — overlay
//   }
//
// This is the (max, +) algebra from
// apps/docs/docs/internals/design/layout-synthesis.md: a distribute is a series
// (sum) on its axis, align/overlay is `max`, and any network of the two folds to
// a single monotone claim — so the inversion (auto-fit) stays a one-unknown
// solve. `spread` is the one-distribute + one-cross-axis-align instance;
// SubsetSelection is two disjoint distributes on one axis (their sub-sums
// overlay, hence `max`). (A grid/`table` is its own `grid` constraint with
// ORDINAL track axes — see constraints/grid.ts — not composed here.)
//
// The align fold is load-bearing, not cosmetic: in a bar chart (distribute on x,
// bars aligned on y) it is `resolveAlignmentSpace` that turns the bars' SIZE heights
// into the y data-axis POSITION domain. Only the uniform-string anchor folds (a
// per-child anchor array has no single overlay form); its children then fall to
// the raw-extent path.
//
// Gated to layers with at least one distribute: a pure overlay (no series, e.g.
// a legend) has nothing to compose, so it is left untouched (undefined) and the
// layer's default union — which also merges `position` data domains — stands.
// Distribute interleaved with a `position` pin (solve the sum relative to the
// pin) is not yet modeled; the distribute claim wins on a shared axis for now.

import * as Monotonic from "../../util/monotonic";
import type { GoFishAST } from "../_ast";
import { Size } from "../dims";
import {
  POSITION,
  UNDEFINED,
  UnderlyingSpace,
  continuousInterval,
  isBaselineMagnitude,
  isUNDEFINED,
  spaceMeasure,
} from "../underlyingSpace";
import {
  resolveAlignmentExtent,
  resolveAlignmentSpace,
  unionChildExtents,
  unionChildSpaces,
} from "../graphicalOperators/alignment";
import { impliedExtent, scaleExtent, type Extent } from "../extent";
import { type ConstraintSpec } from ".";
import * as Interval from "../../util/interval";
import type { Measure } from "../data";
import {
  distributeChildrenInPlacementOrder,
  distributeOrigin,
  distributeExtentFold,
  distributeSpaceFold,
  type DistributeConstraint,
  type StackOrigin,
} from "./distribute";
import { type AlignConstraint } from "./align";
import { isPositionInterval, type PositionConstraint } from "./position";
import { axisIndex, buildNameIndex, type AlignAnchor } from "./shared";

/** A position constraint whose coordinates are *purely* interval form (at least
 *  one interval axis, no point axis). It size-sets its axis without blocking
 *  composition. A position carrying any *point*
 *  coordinate is conservatively NOT span-like — it bails composition to the
 *  layer's default union (the distribute-relative-to-a-pin solve is deferred). */
const isPureIntervalPosition = (c: ConstraintSpec): c is PositionConstraint =>
  c.type === "position" &&
  (c.x === undefined || isPositionInterval(c.x)) &&
  (c.y === undefined || isPositionInterval(c.y)) &&
  (isPositionInterval(c.x) || isPositionInterval(c.y));

/** One distribute's slice of the layout budget: equal shares of the axis size
 *  among its covered children (consumed by `layer.tsx`'s `layout`). */
export type DistributeSegment = {
  dAxis: 0 | 1;
  /** Already glue-zeroed (see createDistributeConstraint). */
  spacing: number;
  /** Covered child names, in placement order. */
  order: string[];
};

export type ComposeBudget = {
  segments: DistributeSegment[];
  /** Per-axis composed SIZE claim (the max-plus longest path) to invert against
   *  the allotted size for auto-fit. Undefined when the axis claim isn't SIZE. */
  sizeDomain: [
    Monotonic.Monotonic | undefined,
    Monotonic.Monotonic | undefined,
  ];
};

export type PositionDomains = {
  x?: Interval.Interval;
  y?: Interval.Interval;
  xMeasure?: Measure;
  yMeasure?: Measure;
};

/** Resolve a layer's default per-axis TYPE before composed constraint-space
 * overrides: union child spaces, and merge datum position/span domains into a
 * pinned space. A `transform.scale` does not touch the type: like translate,
 * it acts on pixels, so it scales only the claim ({@link resolveLayerAxisExtent}). */
export function resolveLayerAxisSpace(
  childSpaces: Size<UnderlyingSpace>[],
  axis: 0 | 1,
  positionDomain: Interval.Interval | undefined,
  positionMeasure: Measure | undefined
): UnderlyingSpace {
  const base = unionChildSpaces(childSpaces, axis);
  if (positionDomain === undefined) return base;
  const baseIv = continuousInterval(base);
  const merged = baseIv
    ? Interval.unionAll(baseIv, positionDomain)
    : positionDomain;
  // The position/span constraints' OWN measure is the authoritative unit for
  // this axis's data domain (they define it); it wins, falling back to the
  // children's POSITION measure when the constraints are untagged.
  return POSITION(merged, positionMeasure ?? spaceMeasure(base));
}

export function resolveLayerBaseSpaces(
  childSpaces: Size<UnderlyingSpace>[],
  positionDomains: PositionDomains
): Size<UnderlyingSpace> {
  return [
    resolveLayerAxisSpace(
      childSpaces,
      0,
      positionDomains.x,
      positionDomains.xMeasure
    ),
    resolveLayerAxisSpace(
      childSpaces,
      1,
      positionDomains.y,
      positionDomains.yMeasure
    ),
  ];
}

/** The claim of a layer's default per-axis type `space` (from
 * {@link resolveLayerAxisSpace}). A free union keeps its children's claims,
 * scaled by the layer's `transform.scale` (a pixel-space operation, so it
 * scales the claim and never the data interval). A pinned or difference union
 * claims the union of its children's claims. An axis whose domain the
 * layer's own datum positions widen claims the data width they imply. */
export function resolveLayerAxisExtent(
  childExtents: Size<Extent | undefined>[],
  childSpaces: Size<UnderlyingSpace>[],
  axis: 0 | 1,
  scale: number,
  positionDomain: Interval.Interval | undefined,
  space: UnderlyingSpace
): Extent | undefined {
  if (positionDomain !== undefined) return impliedExtent(space);
  const extent = unionChildExtents(childExtents, childSpaces, axis, space);
  return extent !== undefined && isBaselineMagnitude(space)
    ? scaleExtent(scale, extent)
    : extent;
}

/** Build a per-axis Size carrying `value` on `axis` and `other` elsewhere, so
 *  a single fold result can be fed to the union as a pseudo-child. */
const axisSize = <T>(value: T, axis: 0 | 1, other: T): Size<T> =>
  axis === 0 ? [value, other] : [other, value];

type Seg = DistributeSegment & {
  idx: number[];
  anchor: AlignAnchor | "edge";
  glue: boolean;
  measure?: string;
  origin: StackOrigin<number>;
  keys: (string | undefined)[];
  anonymous: boolean;
};
type Al = { axis: 0 | 1; anchor: AlignAnchor; idx: number[] };

/** The structure of a layer's constraint composition: which children each
 *  distribute and align covers, on which axis. It reads only the constraints
 *  and the child nodes, never a type or a claim, so the type fold
 *  ({@link composePlanSpaces}) and the claim fold ({@link composePlanExtents})
 *  share one plan. */
export type ComposePlan = {
  segments: Seg[];
  alignFolds: Al[];
  spanCover: [Set<number>, Set<number>];
};

export function planConstraintComposition(
  constraints: ConstraintSpec[],
  childNodes: GoFishAST[]
): ComposePlan | undefined {
  const distributes = constraints.filter(
    (c): c is DistributeConstraint => c.type === "distribute"
  );
  const aligns = constraints.filter(
    (c): c is AlignConstraint => c.type === "align"
  );
  // An interval-form `position` (the size-setting range form, #39/#546)
  // establishes its axis's extent like a distribute does — its datum range
  // already feeds the layer's POSITION domain via `collectPositionDomains`, so
  // it needs no fold here, but its PRESENCE means this is NOT a pure overlay:
  // the cross-axis align fold (SIZE→POSITION) must still run (e.g. a histogram =
  // interval position on x, align on y; the align fold is what makes the count
  // axis).
  const spans = constraints.filter(isPureIntervalPosition);
  // Compose only layers that are PURELY distributes + aligns + interval
  // positions. A *point* position pin (or z-order) puts the layer in a different
  // regime — the distribute-relative-to-a-pin solve is deferred
  // (layout-synthesis.md) — so leave it to the layer's default union, which
  // already merges position data domains. A position mixing a point on one axis
  // with an interval on the other is conservatively point-form: not span-like,
  // so it bails here too.
  if (distributes.length + aligns.length + spans.length !== constraints.length)
    return undefined;
  // No series and no interval position → a pure overlay. Align-only composition
  // WOULD fold (resolveAlignmentSpace converts SIZE→POSITION), but for a pure overlay
  // that conversion only changes the layer's reported space (e.g. a legend's),
  // so defer it: fall to the default union. (An interval position on the other
  // axis makes it not an overlay, so the align fold runs.)
  if (distributes.length === 0 && spans.length === 0) return undefined;

  const indexByName = buildNameIndex(childNodes);
  const keyOf = (i: number): string | undefined => {
    const node = childNodes[i];
    return typeof node === "object" && node !== null && "key" in node
      ? (node.key as string | undefined)
      : undefined;
  };
  // A child whose `key` was assigned positionally (no `by` — see createOperator).
  // An ordinal folded entirely from synthetic-keyed children is `anonymous`.
  const syntheticOf = (i: number): boolean => {
    const node = childNodes[i];
    return (
      typeof node === "object" &&
      node !== null &&
      (node as { _syntheticKey?: boolean })._syntheticKey === true
    );
  };
  const idxOf = (refs: readonly { name: string }[]): number[] | undefined => {
    const out = refs.map((r) => indexByName.get(r.name));
    return out.every((i): i is number => i !== undefined) ? out : undefined;
  };

  // Resolve each distribute to its covered child indices in placement order.
  // A target that isn't a direct child (a ref into a nested tier) has no slot
  // here, so bail to the layer's default union.
  const segments: Seg[] = [];
  for (const d of distributes) {
    const ordered = distributeChildrenInPlacementOrder(d);
    const idx = idxOf(ordered);
    if (idx === undefined) return undefined;
    segments.push({
      dAxis: axisIndex(d.dir),
      spacing: d.spacing,
      order: ordered.map((r) => r.name),
      idx,
      anchor: d.anchor,
      glue: d.glue,
      measure: d.measure,
      origin: distributeOrigin(d, ordered),
      keys: idx.map(keyOf),
      anonymous: idx.length > 0 && idx.every(syntheticOf),
    });
  }

  // Each align contributes an overlay fold on the axis it specifies, but only
  // for a uniform string anchor (a per-child array has no single fold form).
  const alignFolds: Al[] = [];
  for (const a of aligns) {
    const idx = idxOf(a.children);
    if (idx === undefined) continue;
    for (const axis of [0, 1] as const) {
      const spec = axis === 0 ? a.x : a.y;
      // "span"/"size" (#726) are placement-time interval statistics, not a
      // point-anchor space fold — the target they write is UNDEFINED on this
      // axis by construction (that's the unbound-target scope), so it
      // contributes no space claim here.
      if (typeof spec === "string" && spec !== "span" && spec !== "size")
        alignFolds.push({ axis, anchor: spec, idx });
    }
  }

  // An interval position COVERS its children on the axis it sizes. Its datum
  // range already feeds the POSITION domain through `collectPositionDomains`,
  // and the placement solver later turns the resolved pixel endpoints into the
  // target's extent. It contributes no fold here, but its children must be
  // marked covered so the per-axis loop below does not also fold their raw
  // extent in as an overlay sibling (double-counting) when a distribute/align
  // shares the same axis.
  const spanCover: [Set<number>, Set<number>] = [new Set(), new Set()];
  for (const s of spans) {
    const idx = idxOf(s.children);
    if (idx === undefined) continue;
    if (s.x !== undefined) idx.forEach((i) => spanCover[0].add(i));
    if (s.y !== undefined) idx.forEach((i) => spanCover[1].add(i));
  }

  return { segments, alignFolds, spanCover };
}

const foldOptions = (s: Seg) => ({
  spacing: s.spacing,
  anchor: s.anchor,
  glue: s.glue,
  measure: s.measure,
  anonymous: s.anonymous,
  origin: s.origin,
});

/** One operand of an axis's max-union: a distribute fold, an align fold, or a
 *  child no fold covers. */
type Fragment =
  | { kind: "distribute"; seg: Seg; space: UnderlyingSpace }
  | { kind: "align"; al: Al; space: UnderlyingSpace }
  | { kind: "child"; index: number; space: UnderlyingSpace };

/** The operands of `axis`'s max-union, with their types, or undefined when no
 *  distribute or align covers the axis (the layer's default union stands). */
function axisFragments(
  plan: ComposePlan,
  childSpaces: Size<UnderlyingSpace>[],
  axis: 0 | 1
): Fragment[] | undefined {
  const dists = plan.segments.filter((s) => s.dAxis === axis);
  const als = plan.alignFolds.filter((a) => a.axis === axis);
  if (dists.length === 0 && als.length === 0) return undefined;

  const fragments: Fragment[] = [];
  const covered = new Set<number>(plan.spanCover[axis]);
  for (const s of dists) {
    s.idx.forEach((i) => covered.add(i));
    const space = distributeSpaceFold(
      s.idx.map((i) => childSpaces[i][axis]),
      s.keys,
      foldOptions(s)
    );
    if (!isUNDEFINED(space))
      fragments.push({ kind: "distribute", seg: s, space });
  }
  for (const a of als) {
    a.idx.forEach((i) => covered.add(i));
    // `resolveAlignmentSpace` is spread's own cross-axis fold: anchored for
    // start/end/baseline, unanchored for `middle`, union otherwise.
    const space = resolveAlignmentSpace(
      a.idx.map((i) => childSpaces[i][axis]),
      a.anchor
    );
    if (!isUNDEFINED(space)) fragments.push({ kind: "align", al: a, space });
  }
  for (let i = 0; i < childSpaces.length; i++) {
    if (!covered.has(i))
      fragments.push({ kind: "child", index: i, space: childSpaces[i][axis] });
  }
  return fragments;
}

/** The composed per-axis TYPES. Undefined on an axis leaves the default union
 *  in place (no distribute or align on that axis). */
export function composePlanSpaces(
  plan: ComposePlan,
  childSpaces: Size<UnderlyingSpace>[]
): [UnderlyingSpace | undefined, UnderlyingSpace | undefined] {
  const spaces: [UnderlyingSpace | undefined, UnderlyingSpace | undefined] = [
    undefined,
    undefined,
  ];
  for (const axis of [0, 1] as const) {
    const fragments = axisFragments(plan, childSpaces, axis);
    if (fragments === undefined) continue; // keep default union
    // This axis is covered by an align/distribute, so the FOLD is authoritative
    // — set it even when UNDEFINED, to OVERRIDE (suppress) the layer's default
    // `unionChildSpaces`. For ORDINAL children the cross-axis fold
    // (`resolveAlignmentSpace`) is UNDEFINED (no axis); letting the default
    // union win instead resurrects an ORDINAL — e.g. the waffle's row index
    // leaks a spurious "Lake B-N" y-axis. (axisSize
    // pads the off-axis with UNDEFINED, so `spaces[axis]` only ever carries this
    // axis's contribution.)
    spaces[axis] =
      fragments.length > 0
        ? unionChildSpaces(
            fragments.map((f) => axisSize(f.space, axis, UNDEFINED)),
            axis
          )
        : UNDEFINED;
  }
  return spaces;
}

/** The composed per-axis CLAIMS for the types `spaces` that
 *  {@link composePlanSpaces} produced, plus the layout budget. Each fold
 *  operand's claim comes from its own claim fold, and the operands overlay as
 *  in {@link unionChildExtents}. An axis the plan does not cover is left
 *  undefined (the default union's claim stands). */
export function composePlanExtents(
  plan: ComposePlan,
  childExtents: Size<Extent | undefined>[],
  childSpaces: Size<UnderlyingSpace>[],
  spaces: [UnderlyingSpace | undefined, UnderlyingSpace | undefined]
): {
  covered: [boolean, boolean];
  extents: [Extent | undefined, Extent | undefined];
  budget: ComposeBudget;
} {
  const covered: [boolean, boolean] = [false, false];
  const extents: [Extent | undefined, Extent | undefined] = [
    undefined,
    undefined,
  ];
  const sizeDomain: [
    Monotonic.Monotonic | undefined,
    Monotonic.Monotonic | undefined,
  ] = [undefined, undefined];
  for (const axis of [0, 1] as const) {
    const fragments = axisFragments(plan, childSpaces, axis);
    const composed = spaces[axis];
    if (fragments === undefined || composed === undefined) continue;
    covered[axis] = true;
    const fragmentExtent = (f: Fragment): Extent | undefined =>
      f.kind === "distribute"
        ? distributeExtentFold(
            f.seg.idx.map((i) => childExtents[i][axis]),
            f.space,
            foldOptions(f.seg)
          )
        : f.kind === "align"
          ? resolveAlignmentExtent(
              f.al.idx.map((i) => childExtents[i][axis]),
              f.al.idx.map((i) => childSpaces[i][axis]),
              f.al.anchor,
              f.space
            )
          : childExtents[f.index][axis];
    const extent = unionChildExtents(
      fragments.map((f) => axisSize(fragmentExtent(f), axis, undefined)),
      fragments.map((f) => axisSize(f.space, axis, UNDEFINED)),
      axis,
      composed
    );
    extents[axis] = extent;
    // Only a baseline magnitude ("free", from a distribute) is a budget the
    // layer σ-solves against via `width.inverse`. An anchored POSITION (from an
    // align fold) is driven by its posScale, not a σ-budget, so it must NOT
    // contribute a sizeDomain (else the layer derives a spurious scale factor).
    if (isBaselineMagnitude(composed)) sizeDomain[axis] = extent!.width;
  }
  return {
    covered,
    extents,
    budget: {
      segments: plan.segments.map(({ dAxis, spacing, order }) => ({
        dAxis,
        spacing,
        order,
      })),
      sizeDomain,
    },
  };
}
