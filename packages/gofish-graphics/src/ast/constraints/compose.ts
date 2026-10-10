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

import type { GoFishAST } from "../_ast";
import { Size } from "../dims";
import {
  UNDEFINED,
  UnderlyingSpace,
  isCONTINUOUS,
  joinUnits,
  CONTINUOUS,
  type UnitRecord,
} from "../underlyingSpace";
import {
  resolveAlignmentExtent,
  resolveAlignmentSpace,
  seatedUnion,
  unionChildExtents,
  unionChildSpaces,
} from "../graphicalOperators/alignment";
import { impliedExtent, scaleExtent, type Extent } from "../extent";
import { type ConstraintSpec } from ".";
import * as Interval from "../../util/interval";
import {
  distributeChildrenInPlacementOrder,
  distributeOrigin,
  distributeExtentFold,
  distributeSpaceFold,
  type DistributeConstraint,
  type StackOrigin,
} from "./distribute";
import { type AlignConstraint } from "./align";
import {
  isPositionInterval,
  positionCoordKind,
  type PositionConstraint,
} from "./position";
import {
  axisIndex,
  buildNameIndex,
  childNameKey,
  isPointAlign,
  type AlignAnchor,
} from "./shared";
import { GoFishNode } from "../_node";
import { envFlag } from "../../util";

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
  /** Per axis: the plan covers it, so the layer's claim there is the composed
   *  claim, which the layer solves σ against when it roots the axis's scope
   *  (`buildChildScalePlan`). */
  covered: [boolean, boolean];
};

export type PositionDomains = {
  x?: Interval.Interval;
  y?: Interval.Interval;
  /** The units of the datum positions on each axis (with their calendar,
   *  when they are times). */
  xMeasure?: UnitRecord;
  yMeasure?: UnitRecord;
};

/** `children` with the axis of every child in `placed` left out (UNDEFINED,
 *  or no claim): what the layer's own union sees once datum-placed children
 *  are set aside. */
const withoutPlaced = <T>(
  children: Size<T>[],
  axis: 0 | 1,
  placed: Set<number>,
  empty: T
): Size<T>[] =>
  children.map((c, i) =>
    placed.has(i) ? axisSize(empty, axis, c[1 - axis]) : c
  );

/** Resolve a layer's default per-axis TYPE before composed constraint-space
 * overrides: overlay datum position/span domains onto the children's `union`
 * as a pinned space. The children's union is seated as any overlay seats a
 * child: a free union on its baseline at data 0 (which is where the layer
 * places its free children), a pinned one at its own position. A child a
 * datum position places is left out of the union: it sits where its datum
 * maps, so the datum is what it adds to the domain. A `transform.scale` does
 * not touch the type: like translate, it acts on pixels, so it scales only the
 * claim ({@link resolveLayerAxisExtent}). */
function resolveLayerAxisSpace(
  base: UnderlyingSpace,
  axis: 0 | 1,
  positionDomain: Interval.Interval | undefined,
  positionMeasure: UnitRecord | undefined
): UnderlyingSpace {
  if (positionDomain === undefined) return base;
  const merged = seatedUnion(
    [
      ...(isCONTINUOUS(base) ? [base] : []),
      CONTINUOUS(positionDomain, "pinned"),
    ],
    "baseline",
    "pinned"
  );
  // The datum and the continuous children share one axis, so their units
  // unify as types (a clash is an error; an untagged side takes the other's
  // unit). An ordinal union's measure is its grouping field, which names a
  // category axis but is no unit, so it takes no part.
  return CONTINUOUS(
    merged,
    "pinned",
    joinUnits(
      positionMeasure,
      isCONTINUOUS(base) ? base.measure : undefined,
      true,
      {
        axis,
        where: "between a position constraint and the marks it sits among",
      }
    )
  );
}

/** A layer's default types, per axis: `union`, the union of the children a
 *  datum position does not place, and `spaces`, that union with the layer's
 *  datum domain overlaid ({@link resolveLayerAxisSpace}). The claim half
 *  ({@link resolveLayerAxisExtent}) reads both. */
export type LayerBaseSpaces = {
  union: Size<UnderlyingSpace>;
  spaces: Size<UnderlyingSpace>;
};

export function resolveLayerBaseSpaces(
  childSpaces: Size<UnderlyingSpace>[],
  positionDomains: PositionDomains,
  placed: [Set<number>, Set<number>] = [new Set(), new Set()]
): LayerBaseSpaces {
  const union: Size<UnderlyingSpace> = [UNDEFINED, UNDEFINED];
  const spaces: Size<UnderlyingSpace> = [UNDEFINED, UNDEFINED];
  const domains = [positionDomains.x, positionDomains.y];
  const measures = [positionDomains.xMeasure, positionDomains.yMeasure];
  for (const axis of [0, 1] as const) {
    union[axis] = unionChildSpaces(
      withoutPlaced(childSpaces, axis, placed[axis], UNDEFINED),
      axis
    );
    spaces[axis] = resolveLayerAxisSpace(
      union[axis],
      axis,
      domains[axis],
      measures[axis]
    );
  }
  return { union, spaces };
}

/** The claim of a layer's default per-axis type `space`, given the
 * children's `base` union ({@link resolveLayerBaseSpaces}): the union of its
 * children's claims, and, when the layer's own datum positions widen the
 * domain, that union overlaid with the datum domain (which claims its data
 * width), seated as the type seats them. Scaled by the layer's
 * `transform.scale`, a pixel-space operation, so it scales the claim of every
 * origin and never the data interval. */
export function resolveLayerAxisExtent(
  allChildExtents: Size<Extent | undefined>[],
  allChildSpaces: Size<UnderlyingSpace>[],
  axis: 0 | 1,
  scale: number,
  positionDomain: Interval.Interval | undefined,
  base: UnderlyingSpace,
  space: UnderlyingSpace,
  placed: Set<number> = new Set()
): Extent | undefined {
  const childSpaces = withoutPlaced(allChildSpaces, axis, placed, UNDEFINED);
  const childExtents = withoutPlaced(
    allChildExtents,
    axis,
    placed,
    undefined as Extent | undefined
  );
  const baseExtent = unionChildExtents(childExtents, childSpaces, axis, base);
  const datum =
    positionDomain === undefined
      ? undefined
      : CONTINUOUS(positionDomain, "pinned");
  const extent =
    datum === undefined
      ? baseExtent
      : unionChildExtents(
          [
            axisSize(baseExtent, axis, undefined),
            axisSize(impliedExtent(datum), axis, undefined),
          ],
          [axisSize(base, axis, UNDEFINED), axisSize(datum, axis, UNDEFINED)],
          axis,
          space
        );
  return extent === undefined ? undefined : scaleExtent(scale, extent);
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
      if (typeof spec === "string" && isPointAlign(spec))
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

// ── Sharing sets (#1114 step 3) ──────────────────────────────────────────────
//
// For each axis, a layer's children fall into SHARING SETS: two children in
// one set read their data values on that axis in one frame. Set 0 is the
// layer's own set, the one it reports upward. A child in any other set is
// DETACHED on that axis. See
// apps/docs/docs/internals/design/measure-keyed-domains.md, section 3.
//
// Like `planConstraintComposition`, the plan reads only the constraints and the
// child nodes, never a type or a claim. Unlike it, the plan exists for every
// layer, a point `position` or a z-order included (the marginal histogram is
// such a layer).
//
// This is a layer's sharing rule. Each node type has its own rule, next to its
// type hook (`ResolveSharing` in `_node.ts`), and `GoFishNode.sharing()`
// applies it. Three rows of the note's table are node-level rules rather than
// constraints: a data-valued `w`/`h` (`layer.tsx`, which adds to this plan),
// `treemap` (`treemap.tsx`) and the `position` operator (`positionNode.tsx`).
// Nothing reads the plans yet except the `GOFISH_DUMP_SHARING` dump
// ({@link dumpSharing}).
// A discrete position (a scatter over a category field) is not in the table.
// It contributes nothing here, as in `datumPlacedChildren`.

/** One layer's sharing sets, per axis. Derived, never stored on a space. */
export type SharingPlan = {
  /** Per axis: each child's set index. Set 0 is the node's own set. */
  sets: [number[], number[]];
  /** Per axis: children whose own extent sits in a frame of its own (a datum
   *  placement, a spread slot, a grid cell). */
  nested: [Set<number>, Set<number>];
};

/** A layer's plan ({@link planSharing}): its sharing sets, and, per axis, the
 *  children a datum `position` places. The layer's own union leaves those
 *  out, since their own extent is nested at the datum. */
export type LayerSharingPlan = SharingPlan & {
  datumPlaced: [Set<number>, Set<number>];
};

export function planSharing(
  constraints: ConstraintSpec[],
  childNodes: GoFishAST[]
): LayerSharingPlan {
  const n = childNodes.length;
  const index = buildNameIndex(childNodes);
  // A ref that is not a direct child (a ref into a nested tier) has no slot
  // here, so it takes no part.
  const idxOf = (refs: readonly { name: string }[]): number[] =>
    refs
      .map((r) => index.get(r.name))
      .filter((i): i is number => i !== undefined);

  const datumPlaced: [Set<number>, Set<number>] = [new Set(), new Set()];
  const nested: [Set<number>, Set<number>] = [new Set(), new Set()];
  const detached: [Set<number>, Set<number>] = [new Set(), new Set()];
  const joins: [number[][], number[][]] = [[], []];
  const detach = (axis: 0 | 1, idx: number[]) =>
    idx.forEach((i) => detached[axis].add(i));
  const nest = (axis: 0 | 1, idx: number[]) =>
    idx.forEach((i) => nested[axis].add(i));

  for (const c of constraints) {
    switch (c.type) {
      case "position": {
        // A literal pixel value places the child elsewhere. A datum keeps it
        // in the own set, nested at its datum: it sits where its datum maps,
        // so its own extent is in a frame of its own (a scatter's circle is
        // sized in its own units), and the layer's own union leaves it out
        // (`datumPlaced`).
        const idx = idxOf(c.children);
        for (const axis of [0, 1] as const) {
          const kind = positionCoordKind(axis === 0 ? c.x : c.y);
          if (kind === "pixel") detach(axis, idx);
          if (kind === "datum") {
            idx.forEach((i) => datumPlaced[axis].add(i));
            nest(axis, idx);
          }
        }
        break;
      }
      case "align": {
        const idx = idxOf(c.children);
        if (isPointAlign(c.x)) joins[0].push(idx);
        if (isPointAlign(c.y)) joins[1].push(idx);
        break;
      }
      case "distribute": {
        const axis = axisIndex(c.dir);
        const idx = idxOf(c.children);
        // A stack adds its parts on one axis, so they share it. A spread
        // gives each part a slot of its own, and the layer's own type there
        // is the ordinal of the keys.
        if (c.glue) joins[axis].push(idx);
        else {
          detach(axis, idx);
          nest(axis, idx);
        }
        break;
      }
      case "nest": {
        // Outer and inner share. The padding is pixels.
        const idx = idxOf(c.children);
        if (c.x !== undefined) joins[0].push(idx);
        if (c.y !== undefined) joins[1].push(idx);
        break;
      }
      case "grid": {
        // Both grid axes act as spread directions.
        const idx = idxOf(c.children);
        for (const axis of [0, 1] as const) {
          detach(axis, idx);
          nest(axis, idx);
        }
        break;
      }
      // z-order and overlap move no data, so they contribute nothing.
    }
  }

  // Detaches first, then joins, so an align beats a position on one axis.
  // Union-find over the children plus one more element, `own`, the own set.
  const sets: [number[], number[]] = [[], []];
  for (const axis of [0, 1] as const) {
    const own = n;
    const parent = Array.from({ length: n + 1 }, (_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      // Keep `own` a root, so a merged set that holds it is the own set.
      if (rb === own) parent[ra] = rb;
      else parent[rb] = ra;
    };
    for (let i = 0; i < n; i++) if (!detached[axis].has(i)) union(own, i);
    for (const idx of joins[axis])
      for (let k = 1; k < idx.length; k++) union(idx[0], idx[k]);

    // Number the other sets 1, 2, ... in order of their first child.
    const label = new Map<number, number>([[find(own), 0]]);
    sets[axis] = Array.from({ length: n }, (_, i) => {
      const root = find(i);
      let s = label.get(root);
      if (s === undefined) label.set(root, (s = label.size));
      return s;
    });
  }
  return { sets, nested, datumPlaced };
}

/** A short label for a child in the sharing dump. */
const childLabel = (child: GoFishAST, i: number): string => {
  const name = childNameKey(child);
  if (name !== undefined) return name;
  const node = child as { key?: unknown; type?: unknown };
  if (typeof node.key === "string" && node.key !== "") return node.key;
  return `${typeof node.type === "string" ? node.type : "child"}#${i}`;
};

/** One axis of a plan, printed: the own set, then the detached sets. A `*`
 *  marks a nested child. Long lists are cut, since a spread of 300 bars has
 *  300 sets. */
export function printSharingAxis(
  plan: SharingPlan,
  axis: 0 | 1,
  childNodes: GoFishAST[]
): string {
  const MAX = 6;
  const groups = new Map<number, string[]>();
  plan.sets[axis].forEach((s, i) => {
    const label =
      childLabel(childNodes[i], i) + (plan.nested[axis].has(i) ? "*" : "");
    const g = groups.get(s);
    if (g) g.push(label);
    else groups.set(s, [label]);
  });
  const cut = (xs: string[], sep: string, unit = "") =>
    xs.length <= MAX
      ? xs.join(sep)
      : `${xs.slice(0, MAX - 2).join(sep)}${sep}…+${xs.length - (MAX - 2)}${unit}`;
  const own = cut(groups.get(0) ?? [], ",");
  const others = [...groups.entries()]
    .filter(([s]) => s !== 0)
    .map(([, g]) => `{${cut(g, ",")}}`);
  return others.length === 0
    ? `own{${own}}`
    : `own{${own}} detached ${cut(others, " ", " sets")}`;
}

/** Whether the sharing dump is on. Off (and near-zero-cost) in prod. */
const DUMP_SHARING = envFlag("GOFISH_DUMP_SHARING");

/** A layer's constraints, counted by type: `position×14,align`. */
const printConstraintTypes = (constraints: ConstraintSpec[]): string => {
  const counts = new Map<string, number>();
  for (const c of constraints)
    counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  return [...counts]
    .map(([type, k]) => (k === 1 ? type : `${type}×${k}`))
    .join(",");
};

/** Behind `GOFISH_DUMP_SHARING`, print the sharing plan of every node under
 *  `root` that has more than one child, any constraint, or a child that is
 *  detached or nested, one line per node, indented by depth. A node's chrome rings (axes, titles) are skipped, and
 *  only its content is walked, since chrome must not decide domains. It only
 *  reads the tree. */
export function dumpSharing(root: GoFishAST): void {
  if (!DUMP_SHARING) return;
  const walk = (node: GoFishAST, depth: number) => {
    if (!(node instanceof GoFishNode)) return;
    if (node.chrome !== undefined && node.chrome.content !== node) {
      walk(node.chrome.content, depth);
      return;
    }
    const { children, constraints, type } = node;
    const plan = node.sharing();
    const moved = ([0, 1] as const).some(
      (axis) =>
        plan.nested[axis].size > 0 || plan.sets[axis].some((s) => s !== 0)
    );
    if (children.length > 1 || constraints.length > 0 || moved) {
      const name = childNameKey(node) ?? node.key ?? "";
      console.log(
        `[sharing] ${"  ".repeat(depth)}${type}${name ? ` ${name}` : ""}` +
          ` (${children.length}) [${printConstraintTypes(constraints)}]` +
          ` x: ${printSharingAxis(plan, 0, children)}` +
          ` | y: ${printSharingAxis(plan, 1, children)}`
      );
    }
    children.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);
}

const foldOptions = (s: Seg) => ({
  axis: s.dAxis,
  spacing: s.spacing,
  anchor: s.anchor,
  glue: s.glue,
  measure: s.measure,
  anonymous: s.anonymous,
  origin: s.origin,
});

/** One operand of an axis's max-union: a distribute fold, an align fold, or a
 *  child no fold covers. */
export type Fragment =
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
    // Kept even when UNDEFINED: an unkeyed spread of magnitudes has no type
    // on the axis but still claims σ-dependent room.
    fragments.push({ kind: "distribute", seg: s, space });
  }
  for (const a of als) {
    a.idx.forEach((i) => covered.add(i));
    // `resolveAlignmentSpace` is spread's own cross-axis fold: anchored for
    // start/end/baseline, unanchored for `middle`, union otherwise.
    const space = resolveAlignmentSpace(
      a.idx.map((i) => childSpaces[i][axis]),
      a.anchor,
      axis
    );
    fragments.push({ kind: "align", al: a, space });
  }
  for (let i = 0; i < childSpaces.length; i++) {
    if (!covered.has(i))
      fragments.push({ kind: "child", index: i, space: childSpaces[i][axis] });
  }
  return fragments;
}

/** The composed per-axis TYPES, and the max-union operands each was folded
 *  from (which the claim fold reuses). Undefined on an axis leaves the default
 *  union in place (no distribute or align on that axis). */
export type ComposedSpaces = {
  spaces: [UnderlyingSpace | undefined, UnderlyingSpace | undefined];
  fragments: [Fragment[] | undefined, Fragment[] | undefined];
};

export function composePlanSpaces(
  plan: ComposePlan,
  childSpaces: Size<UnderlyingSpace>[]
): ComposedSpaces {
  const spaces: [UnderlyingSpace | undefined, UnderlyingSpace | undefined] = [
    undefined,
    undefined,
  ];
  const fragments: ComposedSpaces["fragments"] = [undefined, undefined];
  for (const axis of [0, 1] as const) {
    const axisFrags = axisFragments(plan, childSpaces, axis);
    fragments[axis] = axisFrags;
    if (axisFrags === undefined) continue; // keep default union
    // This axis is covered by an align/distribute, so the FOLD is authoritative
    // — set it even when UNDEFINED, to OVERRIDE (suppress) the layer's default
    // `unionChildSpaces`. For ORDINAL children the cross-axis fold
    // (`resolveAlignmentSpace`) is UNDEFINED (no axis); letting the default
    // union win instead resurrects an ORDINAL — e.g. the waffle's row index
    // leaks a spurious "Lake B-N" y-axis. (axisSize
    // pads the off-axis with UNDEFINED, so `spaces[axis]` only ever carries this
    // axis's contribution.)
    spaces[axis] =
      axisFrags.length > 0
        ? unionChildSpaces(
            axisFrags.map((f) => axisSize(f.space, axis, UNDEFINED)),
            axis
          )
        : UNDEFINED;
  }
  return { spaces, fragments };
}

/** The composed per-axis CLAIMS for the types that {@link composePlanSpaces}
 *  produced (`composed`, with its fold operands), plus the layout budget.
 *  Each fold operand's claim comes from its own claim fold, and the operands
 *  overlay as in {@link unionChildExtents}. An axis the plan does not cover is
 *  left undefined (the default union's claim stands). */
export function composePlanExtents(
  plan: ComposePlan,
  composed: ComposedSpaces,
  childExtents: Size<Extent | undefined>[],
  childSpaces: Size<UnderlyingSpace>[]
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
  for (const axis of [0, 1] as const) {
    const fragments = composed.fragments[axis];
    const space = composed.spaces[axis];
    if (fragments === undefined || space === undefined) continue;
    covered[axis] = true;
    const fragmentExtent = (f: Fragment): Extent | undefined =>
      f.kind === "distribute"
        ? distributeExtentFold(
            f.seg.idx.map((i) => childExtents[i][axis]),
            f.seg.idx.map((i) => childSpaces[i][axis]),
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
      space
    );
    extents[axis] = extent;
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
      covered,
    },
  };
}
