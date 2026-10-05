// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Axis, AlignAnchor, ConstraintRef } from "./shared";
import type { Placeable } from "../_node";
import { isValue, type MaybeValue } from "../data";
import type { PlacementFactEmitter, RelationAnchor } from "./placementFacts";
import {
  CONTINUOUS_TYPE,
  ORDINAL,
  UNDEFINED,
  UnderlyingSpace,
  originIs,
  mergeAllMeasures,
  isCONTINUOUS,
  mirrored,
  CONTINUOUS,
  magnitude,
  hasOrigin,
} from "../underlyingSpace";
import { Extent, impliedExtent } from "../extent";
import {
  inCoordinateSpace,
  yDirection,
  type FramedNode,
} from "../axisDirection";
import * as Monotonic from "../../util/monotonic";
import * as Interval from "../../util/interval";

export interface DistributeOptions {
  dir: Axis;
  spacing?: number;
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
  /** A stack's origin (glue only), its part named by child name. Omitted, it
   *  is the tail of the first part laid out. */
  origin?: StackOrigin<string>;
}

/**
 * A stack's origin: its baseline, the 0 its running sums start from, which
 * the layer seats at the measure's origin (#773). It is the point `fraction`
 * of the way from the tail of part `part` to its head (see
 * {@link RelationAnchor}). The default is the first part's tail. A stack over
 * a column with `HasMidpoint` puts it at the midpoint of the column's order
 * (#984, `stackOrigin` in schema.ts) and sets `mirrored`: the parts are then
 * nonnegative amounts measured away from the 0 on both sides, and the
 * stack's space is {@link CONTINUOUS_TYPE.mirrored}.
 *
 * `part` names the part in three ways on the way down: a child index from
 * the split (`stackOrigin`), a child name on the constraint, and an index
 * into the parts in placement order once resolved ({@link distributeOrigin}).
 */
export type StackOrigin<Part> = {
  part: Part;
  fraction: number;
  mirrored: boolean;
};

export interface DistributeConstraint {
  type: "distribute";
  dir: Axis;
  spacing: number;
  anchor: AlignAnchor | "edge";
  order: "forward" | "reverse";
  glue: boolean;
  children: ConstraintRef[];
  measure?: string;
  origin?: StackOrigin<string>;
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
  origin: options.glue ? options.origin : undefined,
});

/** The {@link StackOrigin} of a stack over `ordered` (its parts in placement
 *  order), with `part` an index into `ordered`: the declared origin, else the
 *  first part's tail. */
export function distributeOrigin(
  constraint: Pick<DistributeConstraint, "origin">,
  ordered: readonly { name: string }[]
): StackOrigin<number> {
  const origin = constraint.origin;
  if (origin === undefined) return { part: 0, fraction: 0, mirrored: false };
  const part = ordered.findIndex((child) => child.name === origin.part);
  if (part < 0) {
    throw new Error(
      `stack: its origin is on part "${origin.part}", which is not one of ` +
        `its parts (${ordered.map((child) => `"${child.name}"`).join(", ")}).`
    );
  }
  return { ...origin, part };
}

/** `children` in placement order — reversed for `order: "reverse"`. The result
 *  is read-only: the forward case is the caller's own array. */
export function distributeChildrenInPlacementOrder(
  constraint: DistributeConstraint,
  children: readonly ConstraintRef[] = constraint.children
): readonly ConstraintRef[] {
  return constraint.order === "reverse" ? [...children].reverse() : children;
}

/** The minimal node shape {@link keysDownTheScreen} reads (duck-typed: a
 *  `GoFishNode`, without importing it). */
type DistributingNode = FramedNode & {
  constraints: readonly { type: string }[];
  children: readonly unknown[];
};

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
export function keysDownTheScreen(
  node: DistributingNode
): string[] | undefined {
  const chain = node.constraints.find(
    (c): c is DistributeConstraint =>
      c.type === "distribute" && (c as DistributeConstraint).dir === "y"
  );
  if (chain === undefined || inCoordinateSpace(node)) return undefined;
  const byName = new Map<string, unknown>();
  for (const child of node.children) {
    const name = (child as { _name?: unknown })._name;
    if (typeof name === "string") byName.set(name, child);
  }
  const keys = distributeChildrenInPlacementOrder(chain).map(
    (ref) => (byName.get(ref.name) as { key?: string } | undefined)?.key
  );
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

export function lowerDistributePlacement(
  constraint: DistributeConstraint,
  owner: string,
  {
    emitter,
    targets,
    isInitiallyPlaced,
  }: {
    emitter: PlacementFactEmitter;
    targets: Pick<Map<string, Placeable>, "has" | "get">;
    isInitiallyPlaced: (axis: Axis, name: string) => boolean;
  }
): void {
  const children = constraint.children.filter((child) =>
    targets.has(child.name)
  );
  const ordered = distributeChildrenInPlacementOrder(constraint, children);
  if (ordered.length === 0) return;
  const anchors = distributePlacementAnchors(constraint);
  for (let i = 1; i < ordered.length; i++) {
    // A chain edge whose endpoints both arrived pre-positioned is a consistency
    // check, not an owning relation: confluence governs the unknown positions.
    if (
      isInitiallyPlaced(constraint.dir, ordered[i - 1].name) &&
      isInitiallyPlaced(constraint.dir, ordered[i].name)
    )
      continue;
    emitter.relate({
      axis: constraint.dir,
      from: { name: ordered[i - 1].name, anchor: anchors.from },
      to: { name: ordered[i].name, anchor: anchors.to },
      gap: constraint.spacing,
      owner,
      chain: constraint.glue ? "stack" : "spread",
    });
  }
  // A spread's chain starts at its first member. A stack's chain also carries
  // its {@link StackOrigin}, which the solver's free-origin fallback seats at
  // the measure's origin (#773).
  const origin = distributeOrigin(constraint, ordered);
  emitter.include({
    axis: constraint.dir,
    name: ordered[origin.part].name,
    owner,
    origin: constraint.glue ? origin.fraction : undefined,
  });
}

/** The options a distribute fold reads (shared by the type fold and the claim
 *  fold, so both see one chain). */
export type DistributeFoldOptions = {
  /** The axis the chain runs along. */
  axis: 0 | 1;
  spacing: number;
  anchor: AlignAnchor | "edge";
  glue?: boolean;
  /** Explicit size on the spread/layer's stack axis; overrides children. */
  size?: MaybeValue<number>;
  /** The measure for an ORDINAL result — the grouping field (spread's `by`),
   *  so a category axis names itself off its own space, just as a continuous
   *  axis's measure is its field. (Distinct from `childMeasure` below, which
   *  is the continuous measure composed from the children for a SIZE/POSITION
   *  result.) */
  measure?: string;
  /** True when every contributing child was POSITIONALLY keyed (a `spread`
   *  with no `by`): the folded ORDINAL is anonymous and renders no axis. */
  anonymous?: boolean;
  /** A stack's {@link StackOrigin}, its part an index into `targetSpaces`
   *  (see {@link distributeOrigin}). */
  origin: StackOrigin<number>;
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
 *    its own continuous space inside; the room the chain takes is its claim
 *    ({@link distributeExtentFold}), not a data extent.
 *  - A stack whose parts are not all continuous with an origin is a spread.
 *
 * Measures unify as types (a clash is an error). `keys` are the targets'
 * ordinal keys (node.key) in the same order as `targetSpaces`; only used to
 * pick the ORDINAL branch. This is ref-independent (plain arrays) so spread can
 * call it with its positional children and the layer with its name-resolved
 * targets.
 */
export function distributeSpaceFold(
  targetSpaces: UnderlyingSpace[],
  keys: (string | undefined)[],
  opts: DistributeFoldOptions
): UnderlyingSpace {
  const n = targetSpaces.length;
  if (n === 0) return UNDEFINED;
  // The targets' units unify as types. An ordinal target's measure is its
  // grouping field, which names a category axis but is no unit.
  const childMeasure = mergeAllMeasures(
    targetSpaces.map((s) => (isCONTINUOUS(s) ? s.measure : undefined)),
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

  const namedKeys = keys.filter((k): k is string => k !== undefined);
  const keyed = (): UnderlyingSpace =>
    namedKeys.length > 0
      ? ORDINAL(namedKeys, opts.measure, opts.anonymous)
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
    const { origin } = opts;
    const sides = targets.map(tailSides);
    sides.forEach(({ descent }, i) => {
      if (origin.mirrored && descent > 0) {
        const by = opts.measure === undefined ? "" : `"${opts.measure}"`;
        throw new Error(
          `${by ? `stack({ by: ${by} })` : "stack"}: a centered stack's ` +
            `parts are nonnegative amounts, but the part for ` +
            `${keys[i] !== undefined ? `"${keys[i]}"` : `child ${i + 1}`} ` +
            `is negative. Its \`by\` column${by ? ` ${by}` : ""} has ` +
            `HasMidpoint (declared ` +
            `with \`.diverging()\`), so the stack's 0 is the midpoint of its ` +
            `order and each part lies on the side its level is on; a ` +
            `negative amount has no meaning there.`
        );
      }
    });
    const { ascent, descent } = chainFold(numbers, sides, STACK, 0, origin);
    return mirrored(
      CONTINUOUS(Interval.interval(-descent, ascent), "pinned", childMeasure),
      origin.mirrored
    );
  }

  // A spread separates: along its direction the result is a sequence of
  // separate spaces, one per child, each keeping its own continuous space
  // inside. So it is ORDINAL (keyed by `by`, or anonymous for positional
  // keys), or UNDEFINED with no keys, whatever the spacing or pitch.
  return keyed();
}

/** A part's reach on each side of its tail, the point the previous part's
 *  head meets (placement's `tail` anchor, see {@link RelationAnchor}). A free
 *  part's tail is its baseline, data 0, so its sides are its interval's ends
 *  and a negative part reaches back. A pinned or origin-less part has no data
 *  baseline for placement, so its tail is its start and it lies above it as a
 *  box. */
function tailSides(space: CONTINUOUS_TYPE): Sides<number> {
  const { min, max } = space.dataInterval;
  return space.origin === "free"
    ? { ascent: max, descent: -min }
    : { ascent: max - min, descent: 0 };
}

/** {@link tailSides} for a part's claim: a free part's claim is measured from
 *  its data 0, its tail; any other part is its box. */
const tailClaim = (space: UnderlyingSpace, extent: Extent): Extent =>
  originIs(space, "free") ? extent : Extent(extent.width);

/** A part's reach on each side of a point on the chain: above it and below
 *  it. Numbers for a data extent, Monotonics for a claim. */
type Sides<T> = { ascent: T; descent: T };

/** The arithmetic {@link chainFold} runs in: plain numbers (a data extent, or
 *  a claim at one σ) or Monotonics (a claim as a function of σ). */
type Arith<T> = {
  zero: T;
  /** A σ-independent amount (a spacing, in pixels). */
  constant: (c: number) => T;
  add: (...xs: T[]) => T;
  scale: (k: number, x: T) => T;
  /** The upper envelope of `xs`. */
  max: (xs: T[]) => T;
};

const numbers: Arith<number> = {
  zero: 0,
  constant: (c) => c,
  add: (...xs) => xs.reduce((sum, x) => sum + x, 0),
  scale: (k, x) => k * x,
  max: (xs) => Math.max(...xs),
};

const monotonics: Arith<Monotonic.Monotonic> = {
  zero: Monotonic.ZERO,
  constant: (c) => Monotonic.linear(0, c),
  add: Monotonic.add,
  scale: Monotonic.smul,
  max: Monotonic.envelope,
};

/** How a chain lays its parts: where each part sits about its chain point
 *  (its seat), and how far the next chain point is from this one (its step).
 *  Only the step differs between a stack and a spread. */
type ChainRule = {
  seat: <T>(A: Arith<T>, part: Sides<T>) => Sides<T>;
  step: <T>(A: Arith<T>, part: Sides<T>, spacing: number) => T;
};

const box = <T>(A: Arith<T>, part: Sides<T>): T =>
  A.add(part.ascent, part.descent);

/** A stack lays each part's tail on the previous part's head, the tail moved
 *  by `ascent − descent` (its parts are {@link tailSides}). */
const STACK: ChainRule = {
  seat: (_A, part) => part,
  step: (A, part) => A.add(part.ascent, A.scale(-1, part.descent)),
};

/** A spread chain (a non-glued distribute): `"edge"` lays each part's box
 *  `spacing` after the previous one's end; a fixed-pitch anchor lays each
 *  part's anchor `spacing` from the previous one's. A pitched chain's claim
 *  steps against its parts' own growth, as its rows read: content above the
 *  anchor (`start`, `baseline`) rises over the rows chained after it, and
 *  content below it (`end`) hangs under the rows chained before it. That is a
 *  ridgeline: a spread that reads top-down whose rows grow upward (see
 *  `axisDirection.ts`). A baseline-anchored part keeps its signed sides about
 *  its baseline; any other part is its box, seated by its anchor. */
const spreadRule = (anchor: AlignAnchor | "edge"): ChainRule => ({
  seat: (A, part) => {
    const w = box(A, part);
    switch (anchor) {
      case "baseline":
        return part;
      case "middle":
        return { ascent: A.scale(0.5, w), descent: A.scale(0.5, w) };
      case "end":
        return { ascent: A.zero, descent: w };
      default: // "start", "edge"
        return { ascent: w, descent: A.zero };
    }
  },
  step: (A, part, spacing) =>
    anchor === "edge"
      ? A.add(box(A, part), A.constant(spacing))
      : A.constant(-spacing),
});

/**
 * The one chain fold behind a stack's type and claim and a spread's claim:
 * lay `parts` along the axis by `rule`, from a first chain point at 0, and
 * return the highest reach above `origin` and the lowest reach below it, over
 * every part's seat (and the 0 the chain starts at). `origin` is the point
 * `fraction` of the way from its part's chain point to the next one (a
 * stack's tail to head, {@link StackOrigin}); omitted, it is the chain's
 * start.
 *
 * It runs in numbers (a data extent, or a claim at one σ) or in Monotonics
 * (a claim as a function of σ, exact and invertible while the parts are
 * linear or piecewise).
 */
function chainFold<T>(
  A: Arith<T>,
  parts: Sides<T>[],
  rule: ChainRule,
  spacing: number,
  origin: StackOrigin<number> = { part: 0, fraction: 0, mirrored: false }
): Sides<T> {
  const up: T[] = [A.zero];
  const down: T[] = [A.zero];
  let at = A.zero;
  let zero = A.zero;
  parts.forEach((part, k) => {
    const seat = rule.seat(A, part);
    const step = rule.step(A, part, spacing);
    up.push(A.add(at, seat.ascent));
    down.push(A.add(seat.descent, A.scale(-1, at)));
    if (k === origin.part) zero = A.add(at, A.scale(origin.fraction, step));
    at = A.add(at, step);
  });
  return {
    ascent: A.add(A.max(up), A.scale(-1, zero)),
    descent: A.add(A.max(down), zero),
  };
}

/** {@link chainFold} over claims, as one Extent. With every part linear or
 *  piecewise it is exact; otherwise the fold runs in numbers at each σ, so a
 *  closure walks the parts once per evaluation. */
function chainClaim(
  parts: Extent[],
  rule: ChainRule,
  spacing: number,
  origin?: StackOrigin<number>
): Extent {
  if (
    parts.every(
      (p) => !Monotonic.isUnknown(p.ascent) && !Monotonic.isUnknown(p.descent)
    )
  ) {
    const { ascent, descent } = chainFold(
      monotonics,
      parts,
      rule,
      spacing,
      origin
    );
    return Extent(ascent, descent);
  }
  const at = (sigma: number) =>
    chainFold(
      numbers,
      parts.map((p) => ({
        ascent: p.ascent.run(sigma),
        descent: p.descent.run(sigma),
      })),
      rule,
      spacing,
      origin
    );
  return Extent(
    Monotonic.unknown((sigma) => at(sigma).ascent),
    Monotonic.unknown((sigma) => at(sigma).descent)
  );
}

/**
 * The size claim of a {@link distributeSpaceFold} result `space`, given the
 * targets' claims. It composes the targets' claims the way the type fold
 * composes their data extents, so pixel overhead stays in the claim:
 *  - an explicit size claims what its type implies;
 *  - a glued stack lays its parts' claims end to end, and a spread chain of
 *    free targets lays their claims with the spacing or pitch added, both by
 *    the one chain fold ({@link chainFold}), so a parent can solve a
 *    scale factor via `Monotonic.inverse` (auto-fit). Its type is ordinal
 *    (the targets are separate spaces), but its room is still σ-dependent,
 *    so the claim is there for the enclosing scope to solve against.
 *
 * A spread chain claims only when every target is a magnitude: free, or
 * itself a spread of magnitudes (a claim with no continuous type, as in a
 * sunburst's nested rings). That distinction is inherent to the origin
 * states: a magnitude has no position of its own, so it can only be measured
 * in the enclosing scope, and a chain of them shares that scope's σ (bar
 * widths stay comparable). A pinned target carries its own data coordinates,
 * a frame (a facet panel), so a chain of them takes its slices and each panel
 * roots its own scope. An origin-less target is lined up by its middle, not
 * measured from a baseline. Any other result has no claim.
 */
export function distributeExtentFold(
  targetExtents: (Extent | undefined)[],
  targetSpaces: UnderlyingSpace[],
  space: UnderlyingSpace,
  opts: DistributeFoldOptions
): Extent | undefined {
  if (isCONTINUOUS(space)) {
    if (opts.size !== undefined && isValue(opts.size))
      return impliedExtent(space);
    return chainClaim(
      targetExtents.map((e, i) => tailClaim(targetSpaces[i], e!)),
      STACK,
      0,
      opts.origin
    );
  }
  if (
    opts.glue ||
    targetSpaces.length === 0 ||
    !targetSpaces.every(
      (s, i) =>
        targetExtents[i] !== undefined &&
        (originIs(s, "free") || !isCONTINUOUS(s))
    )
  )
    return undefined;
  // The chain's type has no data coordinates, so its claim is a box.
  return Extent(
    chainClaim(targetExtents as Extent[], spreadRule(opts.anchor), opts.spacing)
      .width
  );
}
