// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { Axis, AlignAnchor, ConstraintRef } from "./shared";
import type { Placeable } from "../_node";
import { getMeasure, getValue, isValue, type MaybeValue } from "../data";
import type { PlacementFactEmitter, RelationAnchor } from "./placementFacts";
import {
  CONTINUOUS_TYPE,
  ORDINAL,
  UNDEFINED,
  UnderlyingSpace,
  dataSides,
  originIs,
  mergeAllMeasures,
  isCONTINUOUS,
  mirrored,
  spaceMeasure,
  CONTINUOUS,
  hasOrigin,
} from "../underlyingSpace";
import { Extent, impliedExtent } from "../extent";
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
  // A spread chain on y places its targets itself: their allocated y bands are
  // just slices of the spread's height, unrelated to where the chain put
  // them. Stamp the anchor the chain fixed on each target so a target that
  // later opens its own y-up flip scope mirrors about that anchor (see
  // `Placeable.pitchAnchorY` and `scopeBox` in coordinateTransforms/bake.ts),
  // keeping the painted targets exactly where this chain solved them. A
  // fixed-pitch chain fixes its anchor (an overlay, at exact pitch); an edge
  // chain fixes the whole box, which a mirror about its middle keeps. (A
  // stack's parts never open their own scope: the stack is one continuous
  // space and flips as a whole.)
  if (constraint.dir === "y" && !constraint.glue) {
    for (const child of ordered) {
      const target = targets.get(child.name);
      if (target)
        target.pitchAnchorY =
          constraint.anchor === "edge" ? "middle" : constraint.anchor;
    }
  }
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
  const childMeasure = mergeAllMeasures(
    targetSpaces.map((s) => spaceMeasure(s)),
    {
      axis: opts.axis,
      where: opts.glue
        ? "where marks are stacked"
        : "where marks are laid side by side",
    }
  );

  // Explicit size on the stack axis dominates the children-derived claim.
  if (opts.size !== undefined && isValue(opts.size)) {
    return CONTINUOUS(
      Interval.interval(0, getValue(opts.size)!),
      "free",
      getMeasure(opts.size)
    );
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
    // the middle of the 20 spans [−25, 75]. A positioned part has descent 0.
    // This is "shift each part's data interval and pin the origin": a glued
    // stack is a pinned space.
    const { origin } = opts;
    let at = 0;
    let lo = 0;
    let hi = 0;
    let zero = 0;
    targets.forEach((s, i) => {
      const { ascent, descent } = dataSides(s);
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
      if (i === origin.part) zero = at + origin.fraction * (ascent - descent);
      lo = Math.min(lo, at - descent);
      hi = Math.max(hi, at + ascent);
      at += ascent - descent;
    });
    return mirrored(
      CONTINUOUS(
        Interval.interval(lo - zero, hi - zero),
        "pinned",
        childMeasure
      ),
      origin.mirrored
    );
  }

  // A spread separates: along its direction the result is a sequence of
  // separate spaces, one per child, each keeping its own continuous space
  // inside. So it is ORDINAL (keyed by `by`, or anonymous for positional
  // keys), or UNDEFINED with no keys, whatever the spacing or pitch.
  return keyed();
}

/**
 * The size claim of a spread chain whose children claim `widths` (in chain
 * order), `spacing` pixels apart.
 *
 * Fixed-pitch extents: `(n−1)·spacing` of chain plus an amplitude ALLOWANCE
 * attributed to the side of the chain where content actually extends,
 * relative to the chained anchor (the painted side — a fixed-pitch chain's
 * rows mirror about their chained anchor at paint, see `pitchAnchorY`):
 *  - "middle": content extends half above / half below every anchor — the
 *    EXACT symmetric form `h_first/2 + (n−1)·s + h_last/2` (unchanged; the
 *    original center mode).
 *  - "baseline" / "start": content rises entirely ABOVE each anchor, so the
 *    allowance sits above the chain HEAD: `max_k(h_k − k·s)⁺ + (n−1)·s`
 *    (k in chain order — the binding row is whichever peak clears the rows
 *    chained above it).
 *  - "end": the mirror image — content hangs BELOW each anchor, allowance
 *    below the chain TAIL: `max_k(h_k − (n−1−k)·s)⁺ + (n−1)·s`.
 * The per-k max assumes each child's extent lies wholly on one side of its
 * anchor (true for SIZE claims — baseline magnitudes) and that the fold's
 * child order is the chain order (compose.ts passes placement order).
 */
function chainClaim(
  widths: Monotonic.Monotonic[],
  spacing: number,
  anchor: AlignAnchor | "edge"
): Monotonic.Monotonic {
  const n = widths.length;
  if (anchor === "edge")
    return Monotonic.adds(Monotonic.add(...widths), spacing * (n - 1));
  if (anchor === "middle")
    return Monotonic.unknown(
      (scaleFactor: number) =>
        widths[0].run(scaleFactor) / 2 +
        spacing * (n - 1) +
        widths[n - 1].run(scaleFactor) / 2
    );
  return Monotonic.unknown((scaleFactor: number) => {
    let allowance = 0;
    for (let k = 0; k < n; k++) {
      const pitchesFromAnchoredEnd = anchor === "end" ? n - 1 - k : k;
      allowance = Math.max(
        allowance,
        widths[k].run(scaleFactor) - spacing * pitchesFromAnchoredEnd
      );
    }
    return Math.max(0, allowance) + spacing * (n - 1);
  });
}

/** The claim of a stack: its parts' claims laid end to end exactly as
 *  {@link distributeSpaceFold} lays their data extents (each part's baseline on
 *  the previous part's head), so any pixel overhead a part carries stays in the
 *  claim. The width of the span the parts cover at σ: the highest head-side
 *  reach minus the lowest tail-side reach, each over the running sums. When
 *  every part's sides are linear the running sums are lines too, so the claim
 *  is an exact envelope (`envelope`); otherwise it is a closure. */
function stackClaim(parts: Extent[]): Monotonic.Monotonic {
  const sides = parts.flatMap((p) => [p.ascent, p.descent]);
  if (sides.every(Monotonic.isLinear)) {
    const lines = sides as Monotonic.Linear[];
    const reachUp: Monotonic.Monotonic[] = [Monotonic.ZERO];
    const reachDown: Monotonic.Monotonic[] = [Monotonic.ZERO];
    let at = { slope: 0, intercept: 0 };
    for (let i = 0; i < parts.length; i++) {
      const a = lines[2 * i];
      const d = lines[2 * i + 1];
      reachUp.push(
        Monotonic.linear(at.slope + a.slope, at.intercept + a.intercept)
      );
      reachDown.push(
        Monotonic.linear(d.slope - at.slope, d.intercept - at.intercept)
      );
      at = {
        slope: at.slope + a.slope - d.slope,
        intercept: at.intercept + a.intercept - d.intercept,
      };
    }
    return Monotonic.add(
      Monotonic.envelope(reachUp),
      Monotonic.envelope(reachDown)
    );
  }
  return Monotonic.unknown((sigma: number) => {
    let at = 0;
    let lo = 0;
    let hi = 0;
    for (const part of parts) {
      const ascent = part.ascent.run(sigma);
      const descent = part.descent.run(sigma);
      lo = Math.min(lo, at - descent);
      hi = Math.max(hi, at + ascent);
      at += ascent - descent;
    }
    return hi - lo;
  });
}

/**
 * The size claim of a {@link distributeSpaceFold} result `space`, given the
 * targets' claims. It composes the targets' claims the way the type fold
 * composes their data extents, so pixel overhead stays in the claim:
 *  - an explicit size claims what its type implies;
 *  - a glued stack lays its parts' claims end to end ({@link stackClaim});
 *  - a spread chain of free targets claims the chain of their claims with the
 *    spacing or pitch added ({@link chainClaim}), so a parent can solve a
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
    return Extent(stackClaim(targetExtents as Extent[]));
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
  const parts = targetExtents as Extent[];
  return Extent(
    chainClaim(
      parts.map((e) => e.width),
      opts.spacing,
      opts.anchor
    )
  );
}
