// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// import { ContinuousDomain } from "./domain";
import { interval, Interval } from "../util/interval";
import { CoordinateTransform } from "./coordinateTransforms/coord";
import * as Monotonic from "../util/monotonic";
import type { Measure } from "./data";

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
 *     low edge (which may be 0!), NOT a zero point. Builds a posScale, is niced,
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
 * via `anchor === 0` silently dropped the unit-clash guard and over-niced; the
 * named `"free"`/`"impossible"` states keep them apart. A former DIFFERENCE
 * width `w` is `linear(w, 0)`; a former POSITION `[a,b]` is
 * `width = linear(b-a, 0), anchor = a`.
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

/** The convenient builder form of the placement + dataDomain: a numeric DATA
 *  coordinate (the domain min — anchored, NOT a zero point), `"free"`
 *  (magnitude), or `"impossible"` (difference). Constructors take this; the
 *  stored field is `dataDomain`, from which placement is derived. */
export type Anchor = number | "free" | "impossible";

/** Derive the abstract {@link Placement} from the builder {@link Anchor}. */
export const placementOf = (anchor: Anchor): Placement =>
  anchor === "free"
    ? "free"
    : anchor === "impossible"
      ? "conflict"
      : "determined";

/** Derive the {@link DataDomain} from the builder {@link Anchor} + width:
 *  numeric → `[anchor, anchor + width.run(1)]`; `"impossible"` → `"delta"`;
 *  `"free"` → `undefined`. */
export const dataDomainOf = (
  anchor: Anchor,
  width: Monotonic.Monotonic
): DataDomain =>
  typeof anchor === "number"
    ? interval(anchor, anchor + width.run(1))
    : anchor === "impossible"
      ? "delta"
      : undefined;

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
};

export type UNDEFINED_TYPE = {
  kind: "undefined";
  spacing?: number;
  ordinalGroupId?: string;
};

export type UnderlyingSpace = CONTINUOUS_TYPE | ORDINAL_TYPE | UNDEFINED_TYPE;

export const CONTINUOUS = (
  width: Monotonic.Monotonic,
  anchor: Anchor,
  measure?: Measure,
  coordinateTransform?: CoordinateTransform
): CONTINUOUS_TYPE => ({
  kind: "continuous",
  width,
  dataDomain: dataDomainOf(anchor, width),
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
    domain.min,
    measure,
    coordinateTransform
  );
export const isPOSITION = (space: UnderlyingSpace): space is CONTINUOUS_TYPE =>
  continuousInterval(space) !== undefined;

/** UNANCHORED continuous space (old DIFFERENCE) — delta axis. Keys on the DATA
 *  fact (`dataDomain === "delta"`), NOT on placement, so a future `conflict`
 *  placement that still has a real data domain doesn't render delta ticks. */
export const DIFFERENCE = (width: number, measure?: Measure): UnderlyingSpace =>
  CONTINUOUS(Monotonic.linear(width, 0), "impossible", measure);
export const isDIFFERENCE = (
  space: UnderlyingSpace
): space is CONTINUOUS_TYPE =>
  isCONTINUOUS(space) && space.dataDomain === "delta";

/** A sized-but-unpositioned extent (the old `SIZE`): a baseline magnitude. */
export const SIZE = (
  domain: Monotonic.Monotonic,
  measure?: Measure
): UnderlyingSpace => CONTINUOUS(domain, "free", measure);

/** Has a baseline (a place it hangs from): a baseline magnitude or an anchored
 *  coordinate, but NOT a difference ({@link spacePlacement} === "conflict"). The
 *  gate for "can be a self-scaling region / needs a concrete canvas". */
export const hasBaseline = (space: UnderlyingSpace): space is CONTINUOUS_TYPE =>
  isCONTINUOUS(space) && spacePlacement(space) !== "conflict";

export const ORDINAL = (
  domain?: string[],
  measure?: Measure
): UnderlyingSpace => ({
  kind: "ordinal",
  domain,
  measure,
});
export const isORDINAL = (space: UnderlyingSpace): space is ORDINAL_TYPE =>
  space.kind === "ordinal";

export const UNDEFINED: UnderlyingSpace = { kind: "undefined" };
export const isUNDEFINED = (space: UnderlyingSpace): space is UNDEFINED_TYPE =>
  space.kind === "undefined";

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
