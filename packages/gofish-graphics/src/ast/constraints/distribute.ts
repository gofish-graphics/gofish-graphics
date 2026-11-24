// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import {
  axisIndex,
  directSlot,
  type Axis,
  type ConstraintRef,
  type KeyOf,
} from "./shared";
import { resolution } from "../_ref";
import type { GoFishNode } from "../_node";
import { isValue, type MaybeValue } from "../data";
import type {
  ChainPath,
  PlacementFactEmitter,
  RelationAnchor,
} from "./placementFacts";
import type { SolvePlaceable } from "./placementProgramLowerer";
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
  minimum,
  multiply,
  record,
  scale,
  subtract,
  upperEnvelope,
  restrict,
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
import { isLength } from "../length";
import { Frontend } from "gofish-ir";
import type { Spacing } from "../../families/spacing";

export interface DistributeOptions {
  dir: Axis;
  /** How far apart neighbors are, a {@link Spacing} strategy:
   *  - `Spacing.box(gap)`: `start[i+1] = end[i] + gap`, a gap between facing
   *    edges, which depends on the children's sizes.
   *  - `Spacing.pitch(distance, { at })`: `at[i+1] = at[i] + distance`, a
   *    fixed distance between the same point on each child, which does not
   *    (`"middle"` is center to center).
   *  - `Spacing.atLeast(gap)`: `start[i+1] ≥ end[i] + gap`, a minimum gap,
   *    which the solve meets after the exact constraints (PLACEHOLDER
   *    name). Where the gaps leave room, the `slack` of the layer that
   *    holds the chain places the children.
   *
   *  A bare amount is `Spacing.box(amount)`: pixels, a percent of the room
   *  of the layer that holds the chain, or an `fr` weight in its scope
   *  (#1176 step 6). Default 8. */
  spacing?: Gap | Spacing;
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
  /** Where the chain puts its own 0, its `at` part one of the operands.
   *  Omitted, a stack's is `Baseline.start()`, the tail of the first part
   *  laid out, and a spread states none: its 0 is its start. A spread takes
   *  every baseline but `wiggle`, and it is placement only: the spread's
   *  space stays a sequence of separate spaces. */
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
  /** How far apart neighbors are, as a strategy: a bare amount is read as
   *  `Spacing.box` here ({@link spacingOf}). Its amount is pixels, or a
   *  length the layer that holds the chain lays out in its room
   *  (`GoFishNode.gapOf`). */
  spacing: Spacing;
  order: "forward" | "reverse";
  glue: boolean;
  children: ConstraintRef[];
  measure?: string;
  hasOrder?: boolean;
  baseline?: StackBaseline<ConstraintRef>;
  hasMidpoint?: boolean;
}

/** A stack's spacing. A stack lays no gap out: its parts are placed by
 *  their data offsets ({@link stackPlaces}), so what reads a chain's gap
 *  (the room plan, the fixed-pixel warning) reads 0 for it. */
const GLUED: Spacing = { kind: "box", gap: 0 };

export const createDistributeConstraint = (
  options: DistributeOptions,
  children: ConstraintRef[]
): DistributeConstraint => {
  // Checked even under glue, whose parts lie by their data offsets with no
  // gap between them.
  const spacing = spacingOf(options.spacing ?? 8);
  return {
    type: "distribute",
    dir: options.dir,
    spacing: options.glue ? GLUED : spacing,
    order: options.order ?? "forward",
    glue: options.glue ?? false,
    children,
    measure: options.measure,
    hasOrder: options.hasOrder,
    baseline: checkedBaseline(options),
    hasMidpoint: options.glue ? options.hasMidpoint : undefined,
  };
};

/** A chain's spacing as a strategy: a bare amount is `Spacing.box(amount)`,
 *  and a strategy is checked against the `Spacing` family. This is the one
 *  place a bare amount becomes a strategy, so everything after it reads
 *  `kind`, and the one place spread's and distribute's `spacing` is
 *  checked. */
export function spacingOf(spacing: Gap | Spacing): Spacing {
  const strategy: unknown =
    typeof spacing === "number" || isLength(spacing)
      ? { kind: "box", gap: spacing }
      : spacing;
  if (typeof strategy !== "object" || strategy === null)
    throw new Error(
      `[gofish] spacing: expected a number, a length (percent(n) or fr(k)) ` +
        `or a Spacing strategy, got ${strategy === null ? "null" : typeof strategy}.`
    );
  Frontend.checkStrategy("Spacing", strategy, "spacing");
  return strategy as Spacing;
}

/** The amount a spacing lays out between neighbors: a box's gap, or a
 *  pitch's distance. */
export const spacingAmount = (spacing: Spacing): Gap =>
  spacing.kind === "pitch" ? spacing.distance : spacing.gap;

/** A chain's baseline: a spread takes every one but `wiggle`, whose 0
 *  moves with the cross-sections a stack glues. */
function checkedBaseline(
  options: DistributeOptions
): StackBaseline<ConstraintRef> | undefined {
  if (!options.glue && options.baseline?.kind === "wiggle")
    throw new Error(
      "spread: `Baseline.wiggle()` needs glued cross-sections: its 0 moves " +
        "with the parts' middles along the cross axis, and a spread keeps " +
        "its parts apart. Use `stack({ baseline: Baseline.wiggle() })`, or " +
        "give the spread `Baseline.start()`, `.end()`, `.middle()` or `.at()`."
    );
  return options.baseline;
}

/** The {@link StackBaseline} of a chain over `ordered` (its parts in
 *  placement order), with an `at` part an index into `ordered`: the declared
 *  baseline, else `start`. */
export function resolveBaseline(
  constraint: Pick<DistributeConstraint, "baseline" | "glue">,
  ordered: readonly ConstraintRef[],
  keyOf: KeyOf
): StackBaseline<number> {
  const baseline = constraint.baseline ?? { kind: "start" };
  if (baseline.kind !== "at") return baseline;
  const key = keyOf(baseline.part);
  const part = ordered.findIndex((child) => keyOf(child) === key);
  if (part < 0) {
    throw new Error(
      `${constraint.glue ? "stack" : "spread"}: its baseline is on part ` +
        `"${baseline.part.name}", which is not one of its parts ` +
        `(${ordered.map((child) => `"${child.name}"`).join(", ")}).`
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

/**
 * Whether the chain `node` lays along `axis` closes around: its room is the
 * whole of a closed axis, one that is periodic and laid out over one whole
 * period (`SpaceDeclaration.closed`, as a full-turn polar angle is). The
 * end of that room is its start, so the chain's last part neighbors its
 * first, and the chain lays n gaps between n parts, the last one after its
 * last part. Its room is the whole axis from `node` up to the space it is
 * in, until a node has a size of its own there, is a part of a chain along
 * the axis (a group of a spread of groups, whose own chain stays open), or
 * is a scope of its own (a cell it is given). A stack glues its parts, so
 * it lays no gap either way.
 */
export function closesAround(node: GoFishNode, axis: 0 | 1): boolean {
  for (let n = node; ; ) {
    if (n.fixedSize(axis) !== undefined) return false;
    const p = n.parent;
    if (p === undefined) return false;
    if (p._space !== undefined) return p._space.closed?.[axis] === true;
    if (
      (p.axisDir === axis &&
        p.constraints.some(
          (c) => c.type === "distribute" && axisIndex(c.dir) === axis
        )) ||
      p.isScope(axis)
    )
      return false;
    n = p;
  }
}

export function distributePlacementAnchors({
  spacing,
}: Pick<DistributeConstraint, "spacing">): {
  from: RelationAnchor;
  to: RelationAnchor;
} {
  // A pitch (start/middle/end/baseline) relates the SAME point on both sides
  // of the chain edge (at[i+1] = at[i] + distance); a box relates the facing
  // edges (end of prev → start of cur).
  switch (spacing.kind) {
    case "box":
    case "atLeast":
      return { from: "end", to: "start" };
    case "pitch": {
      const at = spacing.at ?? "baseline";
      return { from: at, to: at };
    }
  }
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
    targets: Pick<Map<string, SolvePlaceable<T>>, "has" | "get">;
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
  // A stack places each part by its data offset (`stackPlaces`): the
  // part's tail lies that offset from the stack's 0, times σ, and the solve
  // seats the stack's 0 (`solveRank2Axis`). An offset that changes along u
  // (a band on a band whose thickness changes) is no translate: the part's
  // tail sits at the stack's 0, and the part draws its offset itself, the
  // `shear` its layer hands it. The stack's pixels (a stroke, a label) never
  // enter between its parts.
  if (constraint.glue) {
    const idx = axisIndex(constraint.dir);
    const places = stackPlaces(
      keys.map((key) => targets.get(key)?.spaceOn?.(idx) ?? UNDEFINED),
      resolveBaseline(constraint, ordered, keyOf)
    );
    const sigma = A.fromValue(Pwl.SIGMA);
    keys.forEach((key, k) => {
      const { offset } = places[k];
      emitter.include({
        axis: constraint.dir,
        key,
        owner,
        origin: {
          tail: isConstant(offset) ? A.scale(maximum(offset), sigma) : A.zero,
        },
      });
    });
    return;
  }
  const anchors = distributePlacementAnchors(constraint);
  for (let i = 1; i < keys.length; i++) {
    // A chain edge whose endpoints both arrived pre-positioned is a consistency
    // check, not an owning relation: confluence governs the unknown positions.
    if (
      isInitiallyPlaced(constraint.dir, keys[i - 1]) &&
      isInitiallyPlaced(constraint.dir, keys[i])
    )
      continue;
    const edge = {
      axis: constraint.dir,
      from: { key: keys[i - 1], anchor: anchors.from },
      to: { key: keys[i], anchor: anchors.to },
      gap: A.fromValue(gapOf(constraint, axisIndex(constraint.dir))),
      owner,
      chain: true,
    };
    // A minimum gap is a fact of its own, which the solve separates the
    // rigid groups by (`separateGroups` in differenceGraph.ts).
    if (constraint.spacing.kind === "atLeast") emitter.atLeast(edge);
    else emitter.relate(edge);
  }
  // A spread that states its 0 carries its {@link StackBaseline}, which the
  // solver's free-origin fallback seats at the measure's origin (#773): a
  // point on one part, or a place along the whole chain. A spread that
  // states none starts at its first member's start.
  if (constraint.baseline === undefined) {
    emitter.include({ axis: constraint.dir, key: keys[0], owner });
    return;
  }
  const baseline = resolveBaseline(constraint, ordered, keyOf);
  // The way along the chain: from its first part's start to its last part's
  // end, through the anchors its edges tie, with its gaps.
  const path: ChainPath<T> = {
    parts: keys,
    start: "start",
    end: "end",
    ...anchors,
    gap: A.fromValue(gapOf(constraint, axisIndex(constraint.dir))),
  };
  const along = (at: number) => ({
    axis: constraint.dir,
    key: keys[0],
    owner,
    origin: { along: at, chain: path },
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
 * explicit-size override and the glue (stack) variant, so spread can delegate
 * to it wholesale:
 *
 *  - explicit `opts.size` (a value) → free `[0, value]` — the spread's own
 *    size wins over any children-derived claim.
 *  - glue (a stack) GLUES its parts into one continuous space: pinned over
 *    the parts laid end to end from the stack's origin (each part's baseline
 *    on the previous part's head; `[0, Σ widths]` when no part has a descent
 *    and the origin is the first part's tail). Every part must be
 *    continuous on the stack axis: a stack adds data amounts, so a part
 *    with no data size there is an error ({@link requireAmount}).
 *  - non-glue (a spread) SEPARATES: the result is a sequence of separate
 *    spaces, ORDINAL(keys) when any target is keyed (anonymous for positional
 *    keys), else UNDEFINED, whatever its spacing or pitch. Each target keeps
 *    its own continuous space inside; the room the chain takes is its
 *    layer's claim (its plan, `solver/plan.ts`), not a data extent.
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
  if (opts.glue)
    targetSpaces.forEach((s, i) => requireAmount(s, keys[i], i, opts));
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
    // How far each part reaches below its tail: read by the centered
    // stack's check and by whether the stack holds amounts on both sides.
    const descents =
      opts.hasMidpoint || keepsZero(baseline)
        ? sides.map((part) => maximum(field(part, "descent")))
        : [];
    descents.forEach((descent, i) => {
      if (opts.hasMidpoint && descent > 0) {
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
      keepsZero(baseline) && descents.every((descent) => descent <= 0)
    );
  }

  // A spread separates: along its direction the result is a sequence of
  // separate spaces, one per child, each keeping its own continuous space
  // inside. So it is ORDINAL (keyed by `by`, or anonymous for positional
  // keys), or UNDEFINED with no keys, whatever the spacing or pitch.
  return keyed();
}

/** A stack adds data amounts, so each of its parts must have a continuous
 *  data space on the stack axis: a part whose size is in pixels, set by its
 *  content, or a sequence of separate slots has no amount to add. Such parts
 *  only touch, which is a spread with no spacing; the error says so. A part
 *  with only a data width (origin `"none"`) is an amount: it lies from its
 *  start, as a pinned part does ({@link tailSides}). */
function requireAmount(
  space: UnderlyingSpace,
  key: OrdinalKey | undefined,
  i: number,
  opts: DistributeFoldOptions
): void {
  if (isCONTINUOUS(space)) return;
  const axis = opts.axis === 0 ? "x" : "y";
  const by = opts.measure === undefined ? "" : `{ by: "${opts.measure}" }`;
  const part = key !== undefined ? `"${String(key)}"` : `child ${i + 1}`;
  const what =
    space.kind === "ordinal"
      ? `is a row of separate slots on ${axis}`
      : `has no data size on ${axis} (its size is in pixels or comes from its content)`;
  throw new Error(
    `stack(${by}): a stack adds data amounts, but the part for ${part} ` +
      `${what}, so there is no amount to add. To lay the parts one after ` +
      `another with no gap, use spread({ ${by ? `by: "${opts.measure}", ` : ""}` +
      `dir: "${axis}", spacing: 0 }).`
  );
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
  return chain(parts, baseline).reach;
}

/** {@link chainFold}, and each part's tail measured from the stack's 0 at
 *  every u: the offset the stack moves that part by, in data units. */
function chain(
  parts: Fun<Sides>[],
  baseline: StackBaseline<number>
): { reach: Fun<Sides>; tails: Fun<number>[] } {
  const domain = parts
    .map((p) => p.domain)
    .reduce((a, b) => Interval.union(a, b), parts[0]?.domain ?? ALL);
  const start = constant<number>(0, domain);
  const up: Fun<number>[] = [start];
  const down: Fun<number>[] = [start];
  // Each part's middle and thickness, which `wiggle` reads.
  const middles: Fun<number>[] = [];
  const thicknesses: Fun<number>[] = [];
  // Each part's tail, from the chain's start.
  const tails: Fun<number>[] = [];
  let at = start;
  let zero = start;
  parts.forEach((part, k) => {
    const ascent = field(part, "ascent");
    const descent = field(part, "descent");
    const step = subtract(ascent, descent);
    tails.push(at);
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
  return {
    reach: record({
      ascent: subtract(upperEnvelope(up), zero),
      descent: add(upperEnvelope(down), zero),
    }),
    tails: tails.map((tail) => subtract(tail, zero)),
  };
}

/** Where one part of a stack lies: its tail's offset from the stack's 0 at
 *  every u (in data units), and the interval the part covers about the
 *  stack's 0 over every u. */
export type StackPlace = { offset: Fun<number>; reach: Interval.Interval };

/**
 * Where a stack lays each of its parts: its offset, its tail measured from
 * the stack's 0 at every u ({@link chainFold}), in data units: the
 * thicknesses of the parts before it, moved by the baseline. A box's offset
 * is one number, and so is a band's on bands of constant thickness under a
 * baseline that does not move with u. Every band keeps its thickness at
 * every u; the stack only moves each cross-section. The fold has checked
 * that every part is continuous ({@link requireAmount}).
 */
export function stackPlaces(
  spaces: readonly UnderlyingSpace[],
  baseline: StackBaseline<number>
): StackPlace[] {
  const sides = (spaces as CONTINUOUS_TYPE[]).map(tailSides);
  const { tails } = chain(sides, baseline);
  return tails.map((offset, k) => ({
    offset,
    reach: Interval.interval(
      minimum(subtract(offset, field(sides[k], "descent"))),
      maximum(add(offset, field(sides[k], "ascent")))
    ),
  }));
}

/** A point on a part, from its tail: a fraction of its step from tail to
 *  head, or one of its anchors. Its box spans `[−descent, ascent]` about its
 *  tail, and `"baseline"`, its own 0, is the tail itself.
 *
 *  TODO(#1373): a shortcut. That is exact for a part with a
 *  data baseline. Placement reads `"baseline"` as the part's own 0
 *  (`stackOriginOffset` in placementSolver.ts), and a part with no data
 *  baseline (a nested spread or a middle stack) has its own 0 where its
 *  baseline puts it, which this fold does not see: it lays such a part as
 *  a box from its start. A stack whose 0 is such a point has a 0 that is no
 *  data value, as under `middle`, so its space should have no origin. */
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
  const ends = [...middles, ...thicknesses]
    .flatMap(breakpoints)
    .filter(Number.isFinite);
  if (ends.length === 0) return antiderivative(slope, 0);
  // A box is one interval over the whole line, so the zero is drawn over
  // the parts' finite ends, where the bands are.
  const over = { min: Math.min(...ends), max: Math.max(...ends) };
  return antiderivative(restrict(slope, over), over.min);
}

/** The whole line. */
const ALL = { min: -Infinity, max: Infinity };
