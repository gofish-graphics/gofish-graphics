// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// import { ContinuousDomain } from "./domain";
import { interval, Interval } from "../util/interval";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import * as Monotonic from "../util/monotonic";
import type { Measure } from "./data";
import { nice as d3Nice } from "d3-array";

export type UnderlyingSpaceKind = "continuous" | "ordinal" | "undefined";

/**
 * A data-driven extent on one shared scale. Collapses the former POSITION /
 * SIZE / DIFFERENCE trichotomy (issue #586): the extent is always a `width`
 * Monotonic in σ, and the only surviving distinction is the `anchor` a
 * constructor is given — the builder input that says whether, and at what data
 * coordinate, the extent commits an absolute position:
 *
 *   - `anchor: "free"` — a BASELINE MAGNITUDE (the old `SIZE`): a sized-but-
 *     unplaced extent with a local baseline at 0 but no committed position. Its
 *     position is not yet assigned but CAN be (a baseline-align anchors it → a
 *     numeric anchor; a middle-align makes it `"impossible"`). Builds no
 *     posScale; composes as a magnitude (measures FORGET on conflict), scales
 *     with a parent `transform.scale`, and is never niced.
 *   - `anchor: number` — ANCHORED (the old `POSITION`): the position IS assigned.
 *     The number is the DOMAIN MIN — the data-space coordinate of the extent's
 *     low edge (which may be 0!), NOT a zero point. Builds a posScale, is niced
 *     per σ-scope when an axis views it ({@link niceContinuous}, issue #659),
 *     renders an absolute axis over `[anchor, anchor + width.run(1)]`. Measures
 *     unify as TYPES (THROW on a clash) — a count axis must not silently merge
 *     with millimeters.
 *   - `anchor: "impossible"` — UNANCHORED (the old `DIFFERENCE`): an absolute
 *     position is impossible — only differences are meaningful (a centered /
 *     difference extent). No posScale; renders a delta axis over
 *     `[0, width.run(1)]`. Produced by middle-align, which drops the anchor;
 *     absorbing — alignment never re-anchors it.
 *
 * The subtlety #586's first cut got wrong: a baseline magnitude (`"free"`) is
 * NOT the same as a data axis anchored at 0 (`anchor: 0`) — the former builds no
 * posScale and forgets measures, the latter does the opposite. Conflating them
 * via "anchored at 0" silently dropped the unit-clash guard and over-niced; the
 * distinct `undefined`/`"delta"` domain states keep them apart. A former
 * DIFFERENCE width `w` is `linear(w, 0)` with domain `"delta"`; a former
 * POSITION `[a,b]` is `width = linear(b-a, 0)` with domain `[a,b]`.
 *
 * The stored fields are just `width` + `dataDomain` (+ measure, etc.). The
 * abstract PLACEMENT ({@link Placement}) is a DERIVED VIEW of `dataDomain`'s
 * shape — {@link spacePlacement} — not stored state.
 */
/**
 * The abstract PLACEMENT of an extent — the missing "baseline" half of the
 * σ-affine box solve, lifted to the underlying-space pass (the `width` Monotonic
 * is already the abstract SIZE half). A determinacy lattice over "has this
 * extent committed a position?":
 *
 *   - `"free"` (⊥) — sized but not yet placed; a parent can still anchor it (old
 *     SIZE).
 *   - `"determined"` — committed at a data coordinate (old POSITION). The
 *     coordinate itself is the `dataDomain` min (which may be 0); it is a DATA
 *     coordinate, not a pixel — the pixel baseline is assigned top-down at
 *     layout (#39 ledger).
 *   - `"conflict"` (⊤) — no single position is possible (old DIFFERENCE; also
 *     the eventual home for disagreeing aligns).
 *
 * "space as abstract interpretation" (#586 follow-up): placement is the LAYOUT
 * fact (is this extent positioned) — the abstract baseline half of the σ-affine
 * solve, all that bottom-up space resolution can know before pixels exist. It is
 * a bare determinacy lattice, in bijection with the shape of `dataDomain`
 * (`undefined ↔ free`, interval ↔ determined, `"delta"` ↔ conflict), so it is a
 * derived read ({@link spacePlacement}) rather than stored state. See the spec. */
export type Placement = "free" | "determined" | "conflict";

/** The DATA-space fact: the `[min,max]` data interval of an anchored axis
 *  (drives posScale / nicing / measure-throw / an absolute axis), `"delta"` for
 *  a difference axis (delta ticks over `[0, width.run(1)]`, no absolute zero),
 *  or `undefined` for a baseline magnitude (no data axis at all). This is the
 *  sole placement carrier: {@link spacePlacement} reads its shape. */
export type DataDomain = Interval | "delta" | undefined;

/** Read the abstract {@link Placement} off a stored CONTINUOUS space. Placement
 *  is not stored: it is a view of `dataDomain`'s shape (`undefined → "free"`,
 *  `"delta" → "conflict"`, interval → `"determined"`). */
export const spacePlacement = (space: CONTINUOUS_TYPE): Placement =>
  space.dataDomain === undefined
    ? "free"
    : space.dataDomain === "delta"
      ? "conflict"
      : "determined";

export type CONTINUOUS_TYPE = {
  kind: "continuous";
  /** Abstract SIZE: the σ-affine extent `slope·σ + intercept`. */
  width: Monotonic.Monotonic;
  /** Data-space extent for scales/axes/nicing/measures, AND the sole carrier of
   *  the abstract placement (read via {@link spacePlacement}). See
   *  {@link DataDomain}. */
  dataDomain: DataDomain;
  spacing?: number;
  ordinalGroupId?: string;
  /** The measure (unit) of this axis. Spaces unify per measure — see
   *  {@link mergeMeasures}. Undefined = "no claim" (permissive). */
  measure?: Measure;
  coordinateTransform?: CoordinateTransform;
};

export type ORDINAL_TYPE = {
  kind: "ordinal";
  spacing?: number;
  ordinalGroupId?: string;
  domain?: string[]; // Top-level category keys for axis labels
  /** The measure (the grouping field, e.g. "lake") this ordinal axis encodes —
   *  the discrete analogue of a CONTINUOUS space's {@link CONTINUOUS_TYPE.measure}.
   *  Read by axis-title inference so every axis names itself off its own resolved
   *  space (continuous → measure unit, ordinal → grouping field), not a surface
   *  field-name heuristic. Undefined = "no claim". */
  measure?: Measure;
  /** True when this ordinal's keys are POSITIONAL (a `spread` with no `by` — its
   *  children were auto-keyed by index). Such a spread carries no grouping
   *  identity, so it renders no axis (unit dots packed for layout only). Set at
   *  construction from the contributing nodes' `_syntheticKey` (see
   *  `distributeSpaceFold`), never sniffed back from the domain. An
   *  explicitly-keyed or `by`-grouped ordinal leaves this false. */
  anonymous?: boolean;
};

export type UNDEFINED_TYPE = {
  kind: "undefined";
  spacing?: number;
  ordinalGroupId?: string;
};

export type UnderlyingSpace = CONTINUOUS_TYPE | ORDINAL_TYPE | UNDEFINED_TYPE;

/** Low-level constructor: takes the stored {@link DataDomain} directly. There
 *  is no scalar "anchor" builder type — the three placement cases ARE the three
 *  named constructors ({@link POSITION} anchored, {@link SIZE} free,
 *  {@link DIFFERENCE} conflict), plus {@link anchorAt} for re-anchoring an
 *  existing space at a data coordinate. */
export const CONTINUOUS = (
  width: Monotonic.Monotonic,
  dataDomain: DataDomain,
  measure?: Measure,
  coordinateTransform?: CoordinateTransform
): CONTINUOUS_TYPE => ({
  kind: "continuous",
  width,
  dataDomain,
  measure,
  coordinateTransform,
});
export const isCONTINUOUS = (
  space: UnderlyingSpace
): space is CONTINUOUS_TYPE => space.kind === "continuous";

/** The `[min, max]` data interval of an ANCHORED CONTINUOUS space, or undefined
 *  for a baseline magnitude or a difference. This is exactly the `dataDomain`
 *  when it is an interval. */
export const continuousInterval = (
  space: UnderlyingSpace
): Interval | undefined =>
  isCONTINUOUS(space) &&
  space.dataDomain !== undefined &&
  space.dataDomain !== "delta"
    ? space.dataDomain
    : undefined;

/** The extent interval of a CONTINUOUS space, treating a non-anchored extent as
 *  starting at 0 — `[min, min + width.run(1)]`. The fold variant of
 *  {@link continuousInterval}: where the latter reports "no anchor" as
 *  `undefined`, this collapses it to `[0, extent]` so an extent can be unioned
 *  regardless of anchoring (overlay / alignment). */
export const continuousExtentInterval = (space: CONTINUOUS_TYPE): Interval =>
  continuousInterval(space) ?? interval(0, space.width.run(1));

/** A baseline magnitude — a sized-but-unplaced extent (the old `SIZE`): no
 *  committed position. Distinct from a data-positioned anchored extent
 *  ({@link isPOSITION}, even at data-min 0) and a difference
 *  ({@link isDIFFERENCE}). Keys on the LAYOUT fact ({@link spacePlacement}). */
export const isBaselineMagnitude = (
  space: UnderlyingSpace
): space is CONTINUOUS_TYPE =>
  isCONTINUOUS(space) && spacePlacement(space) === "free";

/** ANCHORED continuous space (old POSITION) — has a data interval; builds a
 *  posScale and an absolute axis. Keys on the DATA fact (`dataDomain`). */
export const POSITION = (
  domain: Interval,
  measure?: Measure,
  coordinateTransform?: CoordinateTransform
): UnderlyingSpace =>
  CONTINUOUS(
    Monotonic.linear(domain.max - domain.min, 0),
    domain,
    measure,
    coordinateTransform
  );
export const isPOSITION = (space: UnderlyingSpace): space is CONTINUOUS_TYPE =>
  continuousInterval(space) !== undefined;

/** Nice an anchored POSITION space's data domain (issue #659). Returns a copy
 *  with the `[min, max]` domain rounded to d3-nice bounds (count 10, matching
 *  the axis tick nicing) and the `width` Monotonic recomputed from the niced
 *  interval, so a scope solved with the niced space sizes content, maps
 *  positions, and — via the same domain — ticks the axis all off ONE rounded
 *  domain.
 *
 *  This is THE nicing operation. It is applied per σ-scope AT the scope's solve
 *  (the render root, a self-scaled region, a shared-scale scope, a datum-position
 *  scale), never as a pre-layout tree walk — so a domain that only reaches a
 *  scope through a stash cannot escape it (the original #659 bug), and a subtree
 *  that is not a scope root never nices its own subset (it inherits the scope's
 *  σ). It is DEMAND-DRIVEN: each solve site gates the call on
 *  `GoFishNode.scopeRendersAxis` — a scope nices its POSITION domain iff some
 *  node in its space-flow region renders an axis on the dim. Nicing is a
 *  presentation adjustment whose demand comes from axis views; axis-less
 *  content stays at the honest raw scale, and when an axis IS drawn, content
 *  and ticks share the one niced domain. A baseline magnitude, difference,
 *  ordinal, or undefined space is returned UNCHANGED: nicing applies only to
 *  anchored POSITION domains — never SIZE magnitudes, never deltas. A coord
 *  scope must NOT nice (its domain maps into a fixed coordinate range), so the
 *  coord boundary never calls this. */
export const niceContinuous = <T extends UnderlyingSpace | undefined>(
  space: T
): T => {
  if (space === undefined) return space;
  const iv = continuousInterval(space);
  if (iv === undefined) return space;
  const [niceMin, niceMax] = d3Nice(iv.min, iv.max, 10);
  return CONTINUOUS(
    Monotonic.linear(niceMax - niceMin, 0),
    interval(niceMin, niceMax),
    (space as CONTINUOUS_TYPE).measure,
    (space as CONTINUOUS_TYPE).coordinateTransform
  ) as T;
};

/** UNANCHORED continuous space (old DIFFERENCE) — delta axis. Keys on the DATA
 *  fact (`dataDomain === "delta"`), NOT on placement, so a future `conflict`
 *  placement that still has a real data domain doesn't render delta ticks. */
export const DIFFERENCE = (width: number, measure?: Measure): UnderlyingSpace =>
  CONTINUOUS(Monotonic.linear(width, 0), "delta", measure);
export const isDIFFERENCE = (
  space: UnderlyingSpace
): space is CONTINUOUS_TYPE =>
  isCONTINUOUS(space) && space.dataDomain === "delta";

/** A sized-but-unpositioned extent (the old `SIZE`): a baseline magnitude. */
export const SIZE = (
  domain: Monotonic.Monotonic,
  measure?: Measure
): UnderlyingSpace => CONTINUOUS(domain, undefined, measure);

/** Re-anchor a continuous space at data coordinate `min`, preserving its
 *  σ-affine `width`: the result's domain is `[min, min + width.run(1)]`. This
 *  is the one construction the named constructors can't express — anchoring a
 *  free (or difference) extent without flattening its width to a constant, or
 *  shifting an anchored one (the `position` operator does both). `measure`
 *  defaults to the space's own. */
export const anchorAt = (
  space: CONTINUOUS_TYPE,
  min: number,
  measure?: Measure
): CONTINUOUS_TYPE =>
  CONTINUOUS(
    space.width,
    interval(min, min + space.width.run(1)),
    measure ?? space.measure,
    space.coordinateTransform
  );

/** Has a baseline (a place it hangs from): a baseline magnitude or an anchored
 *  coordinate, but NOT a difference ({@link spacePlacement} === "conflict"). The
 *  gate for "can be a self-scaling region / needs a concrete canvas". */
export const hasBaseline = (space: UnderlyingSpace): space is CONTINUOUS_TYPE =>
  isCONTINUOUS(space) && spacePlacement(space) !== "conflict";

export const ORDINAL = (
  domain?: string[],
  measure?: Measure,
  anonymous?: boolean
): UnderlyingSpace => ({
  kind: "ordinal",
  domain,
  measure,
  anonymous,
});
export const isORDINAL = (space: UnderlyingSpace): space is ORDINAL_TYPE =>
  space.kind === "ordinal";

export const UNDEFINED: UnderlyingSpace = { kind: "undefined" };
export const isUNDEFINED = (space: UnderlyingSpace): space is UNDEFINED_TYPE =>
  space.kind === "undefined";

/** A *positioning* space — one that places marks along an axis (a `POSITION`
 *  data axis or an `ORDINAL` category axis), as opposed to `SIZE` (a mark's own
 *  extent) or `UNDEFINED`. Used to find the axis a set of marks is laid out on. */
export const isPositioningSpace = (space: UnderlyingSpace): boolean =>
  isPOSITION(space) || isORDINAL(space);

/** Read the measure of any space, or undefined for the measureless kind
 *  (UNDEFINED). Both CONTINUOUS (unit) and ORDINAL (grouping field) carry one. */
export const spaceMeasure = (
  space: UnderlyingSpace | undefined
): Measure | undefined =>
  space && (isCONTINUOUS(space) || isORDINAL(space))
    ? space.measure
    : undefined;

/**
 * Unify two measures as TYPES (the Stage-1 guard). Undefined is permissive —
 * it means "no claim", so it unifies with anything and yields the other side.
 * Two equal measures unify to themselves. Two *different* defined measures are
 * a type error: unioning spaces in incompatible units (e.g. a marginal
 * histogram's count axis vs. a scatter's millimeters) is silent corruption, so
 * we throw loudly instead.
 */
export const mergeMeasures = (
  a: Measure | undefined,
  b: Measure | undefined,
  context?: string
): Measure | undefined => {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (a === b) return a;
  throw new Error(
    `Cannot unify underlying spaces with different measures: ` +
      `"${a}" and "${b}"${context ? ` (${context})` : ""}.\n` +
      `If these are the same units, assert that with field(name, measure) ` +
      `or datum(v, measure). If they are different units, give the inner ` +
      `chart an explicit w/h so it becomes a self-scaling region.`
  );
};

/**
 * Like {@link mergeMeasures}, but a conflict *forgets* (returns undefined)
 * instead of throwing. Used where composing differently-measured spaces is
 * legitimate — e.g. stacking two different fields' SIZEs: the composed extent
 * is real but carries no single unit.
 */
export const forgetOnConflict = (
  a: Measure | undefined,
  b: Measure | undefined
): Measure | undefined => {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a === b ? a : undefined;
};

/**
 * Fold an array of measures with {@link mergeMeasures} (throws on a real
 * conflict). The array form of the pairwise unify-as-types guard.
 */
export const mergeAllMeasures = (
  ms: (Measure | undefined)[],
  context?: string
): Measure | undefined =>
  ms.reduce<Measure | undefined>(
    (acc, m) => mergeMeasures(acc, m, context),
    undefined
  );

/**
 * Fold an array of measures with {@link forgetOnConflict} (a conflict forgets
 * to undefined). The array form of the permissive composition merge.
 */
export const forgetAllMeasures = (
  ms: (Measure | undefined)[]
): Measure | undefined =>
  ms.reduce<Measure | undefined>(
    (acc, m) => forgetOnConflict(acc, m),
    undefined
  );
