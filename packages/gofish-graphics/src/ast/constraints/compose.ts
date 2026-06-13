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
import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import { Size } from "../dims";
import {
  UNDEFINED,
  UnderlyingSpace,
  isSIZE,
  isUNDEFINED,
} from "../underlyingSpace";
import { unionChildSpaces } from "../graphicalOperators/alignment";
import { type ConstraintSpec } from ".";
import { distributeSpaceFold, type DistributeConstraint } from "./distribute";
import { alignSpaceFold, type AlignConstraint } from "./align";
import { axisIndex, buildNameIndex, type AlignAnchor } from "./shared";

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
  // Compose only layers that are PURELY distributes + aligns. A `position` pin
  // (or z-order) puts the layer in a different regime — the distribute-relative-
  // to-a-pin solve is deferred (layout-synthesis.md) — so leave it to the
  // layer's default union, which already merges position data domains.
  if (distributes.length + aligns.length !== constraints.length)
    return undefined;
  // No series → a pure overlay. Align-only composition WOULD fold (alignSpaceFold
  // converts SIZE→POSITION), but for a pure overlay that conversion only changes
  // the layer's reported space (e.g. a legend's), so defer it: fall to the
  // default union. (The per-axis loop already handles align-only axes when a
  // distribute exists on the other axis.)
  if (distributes.length === 0) return undefined;

  const indexByName = buildNameIndex(childNodes);
  const keyOf = (i: number): string | undefined =>
    childNodes[i] instanceof GoFishNode
      ? (childNodes[i] as GoFishNode).key
      : undefined;
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
    const covered = new Set<number>();
    for (const s of dists) {
      s.idx.forEach((i) => covered.add(i));
      const fold = distributeSpaceFold(
        s.idx.map((i) => childSpaces[i][axis]),
        s.idx.map(keyOf),
        { spacing: s.spacing, mode: s.mode, glue: s.glue }
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
    if (!isUNDEFINED(composed)) {
      spaces[axis] = composed;
      if (isSIZE(composed)) sizeDomain[axis] = composed.domain;
    }
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
