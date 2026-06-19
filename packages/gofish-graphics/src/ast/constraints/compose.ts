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
//     each align(spec on axis):      its overlay fold (alignSpaceFold)      — overlay
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
// bars aligned on y) it is `alignSpaceFold` that turns the bars' SIZE heights
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
  CONTINUOUS,
  POSITION,
  UNDEFINED,
  UnderlyingSpace,
  continuousInterval,
  isBaselineMagnitude,
  isUNDEFINED,
  spaceMeasure,
} from "../underlyingSpace";
import { unionChildSpaces } from "../graphicalOperators/alignment";
import { type ConstraintSpec } from ".";
import * as Interval from "../../util/interval";
import type { Measure } from "../data";
import { distributeSpaceFold, type DistributeConstraint } from "./distribute";
import { alignSpaceFold, type AlignConstraint } from "./align";
import type { SpanConstraint } from "./span";
type AlignAnchor = "start" | "middle" | "end" | "baseline";

const axisIndex = (axis: "x" | "y"): 0 | 1 => (axis === "x" ? 0 : 1);

const childNameKey = (node: GoFishAST): string | undefined => {
  if (typeof node !== "object" || node === null || !("_name" in node)) {
    return undefined;
  }
  const name = node._name;
  if (name === undefined) return undefined;
  return typeof name === "string" ? name : name.__tag;
};

const buildNameIndex = (childNodes: GoFishAST[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (let i = 0; i < childNodes.length; i++) {
    const name = childNameKey(childNodes[i]);
    if (name !== undefined && !m.has(name)) m.set(name, i);
  }
  return m;
};

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

export type ComposedSpaces = {
  /** Per-axis space overrides; undefined leaves the default union in place
   *  (no distribute or align on that axis). */
  spaces: [UnderlyingSpace | undefined, UnderlyingSpace | undefined];
  budget: ComposeBudget;
};

export type PositionDomains = {
  x?: Interval.Interval;
  y?: Interval.Interval;
  xMeasure?: Measure;
  yMeasure?: Measure;
};

/** Apply a layer transform scale to baseline magnitudes produced by the default
 * child-space union. Anchored POSITION and DIFFERENCE axes keep their own data
 * domains; only free extents scale symbolically. */
export function scaleBaselineMagnitude(
  space: UnderlyingSpace,
  scale: number
): UnderlyingSpace {
  return isBaselineMagnitude(space) && scale !== 1
    ? CONTINUOUS(Monotonic.smul(scale, space.width), "free", space.measure)
    : space;
}

/** Resolve a layer's default per-axis space before composed constraint-space
 * overrides: union child spaces, apply transform.scale to free magnitudes, and
 * merge datum position/span domains into POSITION space. */
export function resolveLayerAxisSpace(
  childSpaces: Size<UnderlyingSpace>[],
  axis: 0 | 1,
  scale: number,
  positionDomain: Interval.Interval | undefined,
  positionMeasure: Measure | undefined
): UnderlyingSpace {
  const base = scaleBaselineMagnitude(
    unionChildSpaces(childSpaces, axis),
    scale
  );
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
  transformScale: Size,
  positionDomains: PositionDomains
): Size<UnderlyingSpace> {
  return [
    resolveLayerAxisSpace(
      childSpaces,
      0,
      transformScale[0],
      positionDomains.x,
      positionDomains.xMeasure
    ),
    resolveLayerAxisSpace(
      childSpaces,
      1,
      transformScale[1],
      positionDomains.y,
      positionDomains.yMeasure
    ),
  ];
}

/** Build a per-axis Size carrying `space` on `axis` and UNDEFINED elsewhere, so
 *  a single space can be fed to `unionChildSpaces` as a pseudo-child. */
const axisSize = (
  space: UnderlyingSpace,
  axis: 0 | 1
): Size<UnderlyingSpace> =>
  axis === 0 ? [space, UNDEFINED] : [UNDEFINED, space];

export function composeConstraintSpaces(
  constraints: ConstraintSpec[],
  childNodes: GoFishAST[],
  childSpaces: Size<UnderlyingSpace>[]
): ComposedSpaces | undefined {
  const distributes = constraints.filter(
    (c): c is DistributeConstraint => c.type === "distribute"
  );
  const aligns = constraints.filter(
    (c): c is AlignConstraint => c.type === "align"
  );
  // `span` (the size-setting interval constraint, #39/#546) establishes its
  // axis's extent like a distribute does — its datum range already feeds the
  // layer's POSITION domain via `collectPositionDomains`, so it needs no fold
  // here, but its PRESENCE means this is NOT a pure overlay: the cross-axis
  // align fold (SIZE→POSITION) must still run (e.g. a histogram = span on x,
  // align on y; the align fold is what makes the count axis).
  const spans = constraints.filter(
    (c): c is SpanConstraint => c.type === "span"
  );
  // Compose only layers that are PURELY distributes + aligns + spans. A
  // `position` pin (or z-order) puts the layer in a different regime — the
  // distribute-relative-to-a-pin solve is deferred (layout-synthesis.md) — so
  // leave it to the layer's default union, which already merges position
  // data domains.
  if (distributes.length + aligns.length + spans.length !== constraints.length)
    return undefined;
  // No series and no span → a pure overlay. Align-only composition WOULD fold
  // (alignSpaceFold converts SIZE→POSITION), but for a pure overlay that
  // conversion only changes the layer's reported space (e.g. a legend's), so
  // defer it: fall to the default union. (A span on the other axis makes it not
  // an overlay, so the align fold runs.)
  if (distributes.length === 0 && spans.length === 0) return undefined;

  const indexByName = buildNameIndex(childNodes);
  const keyOf = (i: number): string | undefined => {
    const node = childNodes[i];
    return typeof node === "object" && node !== null && "key" in node
      ? (node.key as string | undefined)
      : undefined;
  };
  const idxOf = (refs: { name: string }[]): number[] | undefined => {
    const out = refs.map((r) => indexByName.get(r.name));
    return out.every((i): i is number => i !== undefined) ? out : undefined;
  };

  // Resolve each distribute to its covered child indices in placement order.
  // A target that isn't a direct child (a ref into a nested tier) has no slot
  // here, so bail to the layer's default union.
  type Seg = DistributeSegment & {
    idx: number[];
    mode: "edge" | "center";
    glue: boolean;
    measure?: string;
  };
  const segments: Seg[] = [];
  for (const d of distributes) {
    const ordered =
      d.order === "reverse" ? [...d.children].reverse() : d.children;
    const idx = idxOf(ordered);
    if (idx === undefined) return undefined;
    segments.push({
      dAxis: axisIndex(d.dir),
      spacing: d.spacing,
      order: ordered.map((r) => r.name),
      idx,
      mode: d.mode,
      glue: d.glue,
      measure: d.measure,
    });
  }

  // Each align contributes an overlay fold on the axis it specifies, but only
  // for a uniform string anchor (a per-child array has no single fold form).
  type Al = { axis: 0 | 1; anchor: AlignAnchor; idx: number[] };
  const alignFolds: Al[] = [];
  for (const a of aligns) {
    const idx = idxOf(a.children);
    if (idx === undefined) continue;
    for (const axis of [0, 1] as const) {
      const spec = axis === 0 ? a.x : a.y;
      if (typeof spec === "string")
        alignFolds.push({ axis, anchor: spec, idx });
    }
  }

  // A span COVERS its children on the axis it sizes. Its datum range already
  // feeds the POSITION domain through `collectPositionDomains`, and the
  // placement solver later turns the resolved pixel endpoints into the target's
  // extent. It contributes no fold here, but its children must be marked covered
  // so the per-axis loop below does not also fold their raw extent in as an
  // overlay sibling (double-counting) when a distribute/align shares the same
  // axis.
  const spanCover: [Set<number>, Set<number>] = [new Set(), new Set()];
  for (const s of spans) {
    const idx = idxOf(s.children);
    if (idx === undefined) continue;
    if (s.x !== undefined) idx.forEach((i) => spanCover[0].add(i));
    if (s.y !== undefined) idx.forEach((i) => spanCover[1].add(i));
  }

  const spaces: [UnderlyingSpace | undefined, UnderlyingSpace | undefined] = [
    undefined,
    undefined,
  ];
  const sizeDomain: [
    Monotonic.Monotonic | undefined,
    Monotonic.Monotonic | undefined,
  ] = [undefined, undefined];

  for (const axis of [0, 1] as const) {
    const dists = segments.filter((s) => s.dAxis === axis);
    const als = alignFolds.filter((a) => a.axis === axis);
    if (dists.length === 0 && als.length === 0) continue; // keep default union

    const fragments: Size<UnderlyingSpace>[] = [];
    const covered = new Set<number>(spanCover[axis]);
    for (const s of dists) {
      s.idx.forEach((i) => covered.add(i));
      const fold = distributeSpaceFold(
        s.idx.map((i) => childSpaces[i][axis]),
        s.idx.map(keyOf),
        { spacing: s.spacing, mode: s.mode, glue: s.glue, measure: s.measure }
      );
      if (!isUNDEFINED(fold)) fragments.push(axisSize(fold, axis));
    }
    for (const a of als) {
      a.idx.forEach((i) => covered.add(i));
      const fold = alignSpaceFold(
        a.idx.map((i) => childSpaces[i][axis]),
        a.anchor
      );
      if (!isUNDEFINED(fold)) fragments.push(axisSize(fold, axis));
    }
    for (let i = 0; i < childSpaces.length; i++) {
      if (!covered.has(i)) fragments.push(axisSize(childSpaces[i][axis], axis));
    }

    const composed =
      fragments.length > 0 ? unionChildSpaces(fragments, axis) : UNDEFINED;
    // This axis is covered by an align/distribute, so the FOLD is authoritative
    // — set it even when UNDEFINED, to OVERRIDE (suppress) the layer's default
    // `unionChildSpaces`. The bespoke spread always reported its cross-axis fold
    // (`resolveAlignmentSpace`), and for ORDINAL children that fold is UNDEFINED
    // (no axis). Letting the default union win instead resurrects an ORDINAL —
    // e.g. the waffle's row index leaks a spurious "Lake B-N" y-axis. (axisSize
    // pads the off-axis with UNDEFINED, so `spaces[axis]` only ever carries this
    // axis's contribution.)
    spaces[axis] = composed;
    // Only a baseline magnitude ("free", from a distribute) is a budget the
    // layer σ-solves against via `width.inverse`. An anchored POSITION (from an
    // align fold) is driven by its posScale, not a σ-budget, so it must NOT
    // contribute a sizeDomain (else the layer derives a spurious scale factor).
    if (isBaselineMagnitude(composed)) sizeDomain[axis] = composed.width;
  }

  return {
    spaces,
    budget: {
      segments: segments.map(({ dAxis, spacing, order }) => ({
        dAxis,
        spacing,
        order,
      })),
      sizeDomain,
    },
  };
}
