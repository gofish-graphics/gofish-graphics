// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import {
  axisIndex,
  directSlot,
  type Axis,
  type AlignAnchor,
  type ConstraintRef,
  type KeyOf,
} from "./shared";
import { resolution } from "../_ref";
import type { GoFishNode } from "../_node";
import { isValue, type MaybeValue } from "../data";
import type { PlacementFactEmitter, RelationAnchor } from "./placementFacts";
import {
  CONTINUOUS_TYPE,
  ordinalOver,
  type OrdinalKey,
  UNDEFINED,
  UnderlyingSpace,
  joinAllUnits,
  isCONTINUOUS,
  mirrored,
  CONTINUOUS,
  magnitude,
  hasOrigin,
  crossSectionOf,
  withProfile,
} from "../underlyingSpace";
import {
  add,
  antiderivative,
  breakpoints,
  constant,
  derivative,
  field,
  isConstant,
  maximum,
  multiply,
  record,
  scale,
  subtract,
  upperEnvelope,
  zip,
  type Fun,
} from "../fun";
import type { Baseline, Point } from "../../families/baseline";
import { currentUnits } from "../measure";
import {
  inCoordinateSpace,
  yDirection,
  type FramedNode,
} from "../axisDirection";
import type { Arith } from "../solver/arith";
import * as Interval from "../../util/interval";
import * as Pwl from "../solver/pwl";
import type { Gap, GapOf } from "./gap";

export interface DistributeOptions {
  dir: Axis;
  /** The gap between neighbors (or the pitch, for a fixed anchor): pixels,
   *  a percent of the room of the layer that holds the chain, or an `fr`
   *  weight in its scope (#1176 step 6). Default 8. */
  spacing?: Gap;
  /** How adjacent children in the chain relate:
   *  - `"edge"` (default): `start[i+1] = end[i] + spacing` — spacing is the gap
   *    between facing edges (content-dependent).
   *  - `"start" | "middle" | "end" | "baseline"`: fixed-pitch anchor chaining —
   *    `anchor[i+1] = anchor[i] + spacing` — spacing is a fixed,
   *    content-independent anchor-to-anchor pitch (`"middle"` is
   *    center-to-center). */
  anchor?: AlignAnchor | "edge";
  order?: "forward" | "reverse";
  /** Stack semantics: glue children together (sizes sum into a POSITION at the
   *  layer) instead of slicing a budget. Forces `spacing` to 0. Mirrors
   *  spread's `glue`. */
  glue?: boolean;
  /** The measure for an ORDINAL fold — the grouping field (spread's `by`) — so a
   *  category axis names itself off its own space, like a continuous axis does. */
  measure?: string;
  /** The grouping field's values have an order (`HasOrder`, from the chart's
   *  `schema`), so an ORDINAL fold's keys do too ({@link ORDINAL_TYPE}). */
  hasOrder?: boolean;
  /** Where a stack puts its own 0 (glue only), its `at` part one of the
   *  operands. Omitted, it is `Baseline.start()`, the tail of the first part
   *  laid out. */
  baseline?: StackBaseline<ConstraintRef>;
  /** The grouping field's order has a midpoint (`HasMidpoint`, from the
   *  chart's `schema`), which set the stack's baseline (glue only). Each
   *  part then lies on the side of the midpoint its level is on, so the fold
   *  checks that every part is a nonnegative amount. */
  hasMidpoint?: boolean;
}

/**
 * A stack's baseline (`Baseline`): the 0 its running sums are measured from,
 * which the layer seats at the measure's origin (#773). The parts lie end to
 * end, each part's tail on the previous part's head (see
 * {@link RelationAnchor}), from the start of the chain (the first part's
 * tail) to its end (the last part's head). `start` is the chain's start, the
 * default; `end` its end; `middle` halfway between; `at` a point on one
 * part; `wiggle` a 0 that moves with u ({@link wiggleZero}). A stack over a
 * column with `HasMidpoint` puts it at the midpoint of the column's order
 * (#984, `stackBaseline` in schema.ts), an `at`. A stack whose 0 is data 0
 * (any baseline but `middle` and `wiggle`) and whose parts are all
 * nonnegative amounts holds amounts measured away from its 0 on both sides,
 * so its space is {@link CONTINUOUS_TYPE.mirrored}; the fold reads that from
 * the parts. Under `middle` and `wiggle` the 0 is no data value, and the
 * stack's space has no origin. Its 0 is still the node's own 0, where
 * placement seats the point its baseline names, so a parent's
 * `alignment: "baseline"` lines up the stacks' middles.
 *
 * The `part` of an `at` names the part in four ways on the way down: a
 * value of the `by` column (or a child index in the combinator form) from
 * the user, a child index from the split (`stackBaseline` in schema.ts), an
 * operand on the constraint, and an index into the parts in placement order
 * once resolved ({@link resolveBaseline}).
 */
export type StackBaseline<Part> =
  | Exclude<Baseline, { kind: "at" }>
  | { kind: "at"; part: Part; point: Point };

/** Whether a stack's 0 is data 0 on its axis: under `middle` and `wiggle`
 *  it is not (a position is no amount from the stack's middle), so the
 *  stack's space has no origin (`"none"`) and its axis measures only
 *  differences. Its 0 is still where its baseline puts it: placement seats
 *  that point at the node's own 0 ({@link lowerDistributePlacement}). */
const keepsZero = (baseline: StackBaseline<unknown>): boolean =>
  baseline.kind !== "middle" && baseline.kind !== "wiggle";

export interface DistributeConstraint {
  type: "distribute";
  dir: Axis;
  /** The gap between neighbors: pixels, or a length the layer that holds
   *  the chain lays out in its room (`GoFishNode.gapOf`). */
  spacing: Gap;
  anchor: AlignAnchor | "edge";
  order: "forward" | "reverse";
  glue: boolean;
  children: ConstraintRef[];
  measure?: string;
  hasOrder?: boolean;
  baseline?: StackBaseline<ConstraintRef>;
  hasMidpoint?: boolean;
}

export const createDistributeConstraint = (
  options: DistributeOptions,
  children: ConstraintRef[]
): DistributeConstraint => ({
  type: "distribute",
  dir: options.dir,
  // Glue pins spacing ≡ 0 for both the space fold and placement-solver
  // relations, so glued children touch.
  spacing: options.glue ? 0 : (options.spacing ?? 8),
  anchor: options.anchor ?? "edge",
  order: options.order ?? "forward",
  glue: options.glue ?? false,
  children,
  measure: options.measure,
  hasOrder: options.hasOrder,
  baseline: options.glue ? options.baseline : undefined,
  hasMidpoint: options.glue ? options.hasMidpoint : undefined,
});

/** The {@link StackBaseline} of a stack over `ordered` (its parts in
 *  placement order), with an `at` part an index into `ordered`: the declared
 *  baseline, else `start`. */
export function resolveBaseline(
  constraint: Pick<DistributeConstraint, "baseline">,
  ordered: readonly ConstraintRef[],
  keyOf: KeyOf
): StackBaseline<number> {
  const baseline = constraint.baseline ?? { kind: "start" };
  if (baseline.kind !== "at") return baseline;
  const key = keyOf(baseline.part);
  const part = ordered.findIndex((child) => keyOf(child) === key);
  if (part < 0) {
    throw new Error(
      `stack: its baseline is on part "${baseline.part.name}", which is not ` +
        `one of its parts (${ordered.map((child) => `"${child.name}"`).join(", ")}).`
    );
  }
  return { ...baseline, part };
}

/** `children` in placement order — reversed for `order: "reverse"`. The result
 *  is read-only: the forward case is the caller's own array. */
export function distributeChildrenInPlacementOrder(
  constraint: DistributeConstraint,
  children: readonly ConstraintRef[] = constraint.children
): readonly ConstraintRef[] {
  return constraint.order === "reverse" ? [...children].reverse() : children;
}

/**
 * The keys of the parts a node distributes along y, in the order they read
 * down the screen (top to bottom), or undefined when the node distributes
 * nothing along the screen's y. This is the operator's own fact, from its
 * placement order and its axis direction: a chain along a y that reads
 * top-down lays its parts out in placement order down the screen, and one
 * along a y that grows upward lays them out from the bottom, so they read
 * down the screen in reverse. A stack's parts follow its chain whatever
 * their signs (a negative part reaches back from where it is laid).
 *
 * Inside a coordinate space the y is a coordinate of the space (a polar
 * radius), not the screen's, so a chain there has no order down the screen.
 * A part without a key leaves the order undefined. A legend lists its
 * entries in this order when they are a chain's parts.
 */
export function keysDownTheScreen(node: GoFishNode): string[] | undefined {
  const chain = node.constraints.find(
    (c): c is DistributeConstraint => c.type === "distribute" && c.dir === "y"
  );
  if (chain === undefined || inCoordinateSpace(node)) return undefined;
  const resolved = resolution(node);
  const keys = distributeChildrenInPlacementOrder(chain).map((ref) => {
    const i = directSlot(resolved, ref);
    return i === undefined
      ? undefined
      : (node.children[i] as { key?: string }).key;
  });
  if (keys.some((k) => k === undefined)) return undefined;
  const down = keys as string[];
  return yDirection(node) === -1 ? [...down].reverse() : down;
}

export function distributePlacementAnchors({
  anchor,
  glue,
}: Pick<DistributeConstraint, "anchor" | "glue">): {
  from: RelationAnchor;
  to: RelationAnchor;
} {
  // Fixed-pitch anchors (start/middle/end/baseline) relate the SAME anchor on
  // both sides of the chain edge (anchor[i+1] = anchor[i] + spacing); "edge"
  // relates the facing edges (end of prev → start of cur). A stack (glue) lays
  // its parts end to end as vectors (#773): each part's tail (its baseline)
  // sits on the previous part's head, so a negative part goes back. A part
  // with no data baseline has tail = start and head = end, so for such parts
  // and for positive bars this is the facing-edge chain.
  if (glue) return { from: "head", to: "tail" };
  return anchor === "edge"
    ? { from: "end", to: "start" }
    : { from: anchor, to: anchor };
}

export function lowerDistributePlacement<T>(
  constraint: DistributeConstraint,
  owner: string,
  {
    A,
    emitter,
    targets,
    keyOf,
    isInitiallyPlaced,
    gapOf,
  }: {
    A: Arith<T>;
    emitter: PlacementFactEmitter<T>;
    targets: Pick<Map<string, unknown>, "has" | "get">;
    keyOf: KeyOf;
    isInitiallyPlaced: (axis: Axis, key: string) => boolean;
    gapOf: GapOf;
  }
): void {
  const children = constraint.children.filter((child) =>
    targets.has(keyOf(child))
  );
  const ordered = distributeChildrenInPlacementOrder(constraint, children);
  if (ordered.length === 0) return;
  const keys = ordered.map(keyOf);
  const anchors = distributePlacementAnchors(constraint);
  for (let i = 1; i < keys.length; i++) {
    // A chain edge whose endpoints both arrived pre-positioned is a consistency
    // check, not an owning relation: confluence governs the unknown positions.
    if (
      isInitiallyPlaced(constraint.dir, keys[i - 1]) &&
      isInitiallyPlaced(constraint.dir, keys[i])
    )
      continue;
    emitter.relate({
      axis: constraint.dir,
      from: { key: keys[i - 1], anchor: anchors.from },
      to: { key: keys[i], anchor: anchors.to },
      gap: A.fromValue(gapOf(constraint, axisIndex(constraint.dir))),
      owner,
      chain: constraint.glue ? "stack" : "spread",
    });
  }
  // A spread's chain starts at its first member. A stack's chain also carries
  // its {@link StackBaseline}, which the solver's free-origin fallback seats
  // at the measure's origin (#773): a point on one part, or a place along
  // the whole chain. Placement lays parts that are boxes, whose `wiggle` is
  // their `start` (its slope is 0 where no part changes along u).
  if (!constraint.glue) {
    emitter.include({ axis: constraint.dir, key: keys[0], owner });
    return;
  }
  const baseline = resolveBaseline(constraint, ordered, keyOf);
  const along = (at: number) => ({
    axis: constraint.dir,
    key: keys[0],
    owner,
    origin: { along: at, chain: keys },
  });
  emitter.include(
    baseline.kind === "at"
      ? {
          axis: constraint.dir,
          key: keys[baseline.part],
          owner,
          origin: { point: baseline.point },
        }
      : along(
          baseline.kind === "end" ? 1 : baseline.kind === "middle" ? 0.5 : 0
        )
  );
}

/** The options a distribute fold reads (shared by the type fold and the claim
 *  fold, so both see one chain). */
export type DistributeFoldOptions = {
  /** The axis the chain runs along. */
  axis: 0 | 1;
  glue?: boolean;
  /** Explicit size on the spread/layer's stack axis; overrides children. */
  size?: MaybeValue<number>;
  /** The measure for an ORDINAL result — the grouping field (spread's `by`),
   *  so a category axis names itself off its own space, just as a continuous
   *  axis's measure is its field. (Distinct from `childMeasure` below, which
   *  is the continuous measure composed from the children for a SIZE/POSITION
   *  result.) */
  measure?: string;
  /** The keys have an order (`HasOrder`); see {@link DistributeOptions}. */
  hasOrder?: boolean;
  /** True when every contributing child was POSITIONALLY keyed (a `spread`
   *  with no `by`): the folded ORDINAL is anonymous and renders no axis. */
  anonymous?: boolean;
  /** A stack's {@link StackBaseline}, its `at` part an index into
   *  `targetSpaces` (see {@link resolveBaseline}). */
  baseline: StackBaseline<number>;
  /** See {@link DistributeOptions.hasMidpoint}. */
  hasMidpoint?: boolean;
};

/**
 * The distribute constraint's *type* contribution — the bottom-up half that
 * makes `layer + distribute` claim the same underlying space a `spread` does.
 * Mirrors spread.tsx's stack-axis dispatch exactly, including the
 * explicit-size override and the glue (stack) variant, so phase-3 spread can
 * delegate to it wholesale:
 *
 *  - explicit `opts.size` (a value) → free `[0, value]` — the spread's own
 *    size wins over any children-derived claim.
 *  - glue (a stack) GLUES its parts into one continuous space: pinned over
 *    the parts laid end to end from the stack's origin (each part's baseline
 *    on the previous part's head; `[0, Σ widths]` when no part has a descent
 *    and the origin is the first part's tail). It needs every part to have an
 *    origin (pinned or free).
 *  - non-glue (a spread) SEPARATES: the result is a sequence of separate
 *    spaces, ORDINAL(keys) when any target is keyed (anonymous for positional
 *    keys), else UNDEFINED, whatever its spacing or pitch. Each target keeps
 *    its own continuous space inside; the room the chain takes is its
 *    layer's claim (its plan, `solver/plan.ts`), not a data extent.
 *  - A stack whose parts are not all continuous with an origin is a spread.
 *
 * Measures unify as types (a clash is an error). `keys` are the targets'
 * ordinal keys (node.key, or the node's cell for a binned key) in the same
 * order as `targetSpaces`; only used to pick the ORDINAL branch, which is over
 * cells when every key is a cell. This is ref-independent (plain arrays) so spread can
 * call it with its positional children and the layer with its name-resolved
 * targets.
 */
export function distributeSpaceFold(
  targetSpaces: UnderlyingSpace[],
  keys: (OrdinalKey | undefined)[],
  opts: DistributeFoldOptions
): UnderlyingSpace {
  const n = targetSpaces.length;
  if (n === 0) return UNDEFINED;
  // The targets' units meet as types. A stack adds its parts on one axis,
  // so they share it and unify; a spread gives each part a slot of its own,
  // so its parts do not share the axis (#1114: `planSharing`) and unify
  // nothing. An ordinal target's measure is its grouping field, which names
  // a category axis but is no unit.
  const childMeasure = joinAllUnits(
    targetSpaces.map((s) => (isCONTINUOUS(s) ? s.measure : undefined)),
    opts.glue === true,
    {
      axis: opts.axis,
      where: opts.glue
        ? "where marks are stacked"
        : "where marks are laid side by side",
    }
  );

  // Explicit size on the stack axis dominates the children-derived claim.
  if (opts.size !== undefined && isValue(opts.size)) {
    return magnitude(opts.size);
  }

  const namedKeys = keys.filter((k): k is OrdinalKey => k !== undefined);
  const keyed = (): UnderlyingSpace =>
    namedKeys.length > 0
      ? ordinalOver(namedKeys, opts.measure, opts.anonymous, opts.hasOrder)
      : UNDEFINED;
  if (!targetSpaces.every(hasOrigin)) return keyed();
  const targets = targetSpaces as CONTINUOUS_TYPE[];

  if (opts.glue) {
    // The parts lie end to end as vectors (#773): each covers
    // `[at − descent, at + ascent]` about the running sum `at` of the parts
    // before it, and the extent shifts so the stack's origin sits at 0. So
    // (30, −25, 10, −50) spans [−35, 30], and (5, 10, 20, 40, 25) centered on
    // the middle of the 20 spans [−25, 75]. A part with no data baseline
    // lies from its start ({@link tailSides}). This is "shift each part's
    // data interval and pin the origin": a glued stack is a pinned space.
    //
    // A free part is an amount from its baseline, so the stack adds the
    // amounts themselves, and the units they were read in must add up
    // (#1197: a stack of temperatures or dates has no meaning). The check
    // reads each part's own summands, not the unit class the parts joined,
    // so a column that is only a position on the same axis is not checked.
    // A pinned part is not summed: the stack adds only its width. The
    // figure's units decide (`Units.sum`): a unit known only by its name
    // here waits for a definition met elsewhere in the figure.
    for (const t of targets)
      if (t.origin === "free")
        for (const q of t.measure?.summands ?? [])
          currentUnits().sum(q, "stack");
    const { baseline } = opts;
    const sides = targets.map(tailSides);
    sides.forEach((part, i) => {
      if (opts.hasMidpoint && maximum(field(part, "descent")) > 0) {
        const by = opts.measure === undefined ? "" : `"${opts.measure}"`;
        throw new Error(
          `${by ? `stack({ by: ${by} })` : "stack"}: a centered stack's ` +
            `parts are nonnegative amounts, but the part for ` +
            `${keys[i] !== undefined ? `"${keys[i]}"` : `child ${i + 1}`} ` +
            `is negative. Its \`by\` column${by ? ` ${by}` : ""} has ` +
            `HasMidpoint (declared ` +
            `with \`Trait.diverging()\`), so the stack's 0 is the midpoint of its ` +
            `order and each part lies on the side its level is on; a ` +
            `negative amount has no meaning there.`
        );
      }
    });
    // The chain runs at every u, and the stack covers the largest reach on
    // each side over u.
    const reach = chainFold(sides, baseline);
    const above = field(reach, "ascent");
    const below = field(reach, "descent");
    // A stack whose 0 is data 0 is a pinned space. One whose 0 is its
    // middle, or a line that moves with u, has a 0 that is no data value:
    // its space has no origin, and a position on it is no amount. Its own 0
    // is a placement fact (the point its baseline names), not a data 0.
    const space = CONTINUOUS(
      Interval.interval(-maximum(below), maximum(above)),
      keepsZero(baseline) ? "pinned" : "none",
      childMeasure
    );
    // Every part a nonnegative amount (none reaches below its tail), on a
    // stack whose 0 is data 0: the stack holds amounts measured away from
    // its 0 on both sides.
    return mirrored(
      withProfile(space, record({ min: scale(below, -1), max: above })),
      keepsZero(baseline) &&
        sides.every((part) => maximum(field(part, "descent")) <= 0)
    );
  }

  // A spread separates: along its direction the result is a sequence of
  // separate spaces, one per child, each keeping its own continuous space
  // inside. So it is ORDINAL (keyed by `by`, or anonymous for positional
  // keys), or UNDEFINED with no keys, whatever the spacing or pitch.
  return keyed();
}

/** A part's reach on each side of its tail, the point the previous part's
 *  head meets (placement's `tail` anchor, see {@link RelationAnchor}), at
 *  every u across (its cross-section, {@link crossSectionOf}). A free
 *  part's tail is its baseline, data 0, so its sides are its interval's ends
 *  and a negative part reaches back. A pinned or origin-less part has no data
 *  baseline for placement, so its tail is its start and it lies above it as a
 *  box. */
function tailSides(space: CONTINUOUS_TYPE): Fun<Sides> {
  const cs = crossSectionOf(space);
  const min = field(cs, "min");
  const max = field(cs, "max");
  return space.origin === "free"
    ? record({ ascent: max, descent: scale(min, -1) })
    : record({ ascent: subtract(max, min), descent: constant(0, cs.domain) });
}

/** A part's reach on each side of a point on the chain: above it and below
 *  it. */
export type Sides = { ascent: number; descent: number };

/**
 * The chain fold behind a stack's type, at every u across: lay each part's
 * tail on the previous part's head (the tail moved by `ascent − descent`, its
 * parts are {@link tailSides}), from a first tail at 0, and return the highest
 * reach above the stack's 0 and the lowest reach below it, over every part
 * (and the point the chain starts at). The 0 is where `baseline` puts it
 * ({@link StackBaseline}): the chain's start, its end, halfway, a point on
 * one part (a fraction of the way from its tail to its head, or one of its
 * anchors), or the {@link wiggleZero}. Over parts that are one interval
 * everywhere (boxes) every function is a constant, and the numbers are the
 * ones a fold over plain numbers gives. (A claim is its layer's plan's,
 * `solver/plan.ts`, which lays a chain by the placement solve.)
 */
export function chainFold(
  parts: Fun<Sides>[],
  baseline: StackBaseline<number>
): Fun<Sides> {
  const domain = parts
    .map((p) => p.domain)
    .reduce((a, b) => Interval.union(a, b), parts[0]?.domain ?? ALL);
  const start = constant<number>(0, domain);
  const up: Fun<number>[] = [start];
  const down: Fun<number>[] = [start];
  // Each part's middle and thickness, which `wiggle` reads.
  const middles: Fun<number>[] = [];
  const thicknesses: Fun<number>[] = [];
  let at = start;
  let zero = start;
  parts.forEach((part, k) => {
    const ascent = field(part, "ascent");
    const descent = field(part, "descent");
    const step = subtract(ascent, descent);
    up.push(add(at, ascent));
    down.push(subtract(descent, at));
    middles.push(add(at, scale(step, 0.5)));
    thicknesses.push(add(ascent, descent));
    if (baseline.kind === "at" && k === baseline.part)
      zero = add(at, pointOnPart(baseline.point, ascent, descent, step));
    at = add(at, step);
  });
  if (baseline.kind === "end") zero = at;
  if (baseline.kind === "middle") zero = scale(at, 0.5);
  if (baseline.kind === "wiggle") zero = wiggleZero(middles, thicknesses);
  return record({
    ascent: subtract(upperEnvelope(up), zero),
    descent: add(upperEnvelope(down), zero),
  });
}

/** A point on a part, from its tail: a fraction of its step from tail to
 *  head, or one of its anchors. Its box spans `[−descent, ascent]` about its
 *  tail, and `"baseline"` is the tail itself. */
function pointOnPart(
  point: Point,
  ascent: Fun<number>,
  descent: Fun<number>,
  step: Fun<number>
): Fun<number> {
  if (typeof point === "number") return scale(step, point);
  if (point === "start") return scale(descent, -1);
  if (point === "end") return ascent;
  if (point === "middle") return scale(step, 0.5);
  return constant<number>(0, step.domain);
}

/** One over the value of a constant total, or 0 for an empty one. */
const reciprocalOf = (total: Fun<number>): number => {
  const v = total.pieces![0].coeffs[0];
  return v === 0 ? 0 : 1 / v;
};

/**
 * The 0 of a `wiggle` stack, measured from the chain's start, at every u:
 * the function whose slope is the average slope of the parts' middles,
 * weighted by their thickness, `Σ wᵢ mᵢ′ / Σ wᵢ` (0 where every part is
 * empty), and which is 0 at the first u. Moving the 0 with the middles
 * leaves the bands as flat as they can be: it is d3's `stackOffsetWiggle`
 * (Byron and Wattenberg 2008) in the limit of fine data, since d3 sums the
 * same slopes as backward differences between its samples. It is defined
 * on the functions, not on their knots, so sampling the same curves more
 * finely does not move it. Over parts that are boxes every slope is 0, and
 * so is the 0.
 */
export function wiggleZero(
  middles: Fun<number>[],
  thicknesses: Fun<number>[]
): Fun<number> {
  const sum = (fs: Fun<number>[]) => fs.reduce((a, b) => add(a, b));
  const weighted = sum(
    middles.map((m, i) => multiply(thicknesses[i], derivative(m)))
  );
  const total = sum(thicknesses);
  // A constant total divides as a scale, which keeps the slope exact.
  const slope = isConstant(total)
    ? scale(weighted, reciprocalOf(total))
    : zip(weighted, total, (n, d) => (d === 0 ? 0 : n / d), [0, 0]);
  const first = [...middles, ...thicknesses]
    .flatMap(breakpoints)
    .filter(Number.isFinite);
  return antiderivative(slope, first.length > 0 ? Math.min(...first) : 0);
}

/** The whole line. */
const ALL = { min: -Infinity, max: Infinity };
