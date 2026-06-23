export type Interval<T = number> = {
  min?: T;
  center?: T;
  max?: T;
  size?: T;
  embedded?: boolean;
};

export type Dimensions<T = number> = Interval<T>[];

export type XYWHDims<T = number> = {
  x?: T;
  cx?: T;
  x2?: T;
  w?: T;
  emX?: boolean;
  y?: T;
  cy?: T;
  y2?: T;
  h?: T;
  emY?: boolean;
  // Coordinate-space axis aliases (e.g. polar `theta`/`r`). Stored unresolved at
  // construction and resolved to x/y/w/h by the `resolveAliases` pass once the
  // enclosing coord's declared aliases are known. `<name>`→position (like x/y),
  // `<name>Size`→extent (like w/h). See KNOWN_ALIAS_KEYS / extractAliasCandidates.
  theta?: T;
  thetaSize?: T;
  r?: T;
  rSize?: T;
};

/**
 * Recognized coordinate-space axis aliases. Extracted unresolved at construction
 * (a mark is built before its enclosing coord exists) and resolved to x/y/w/h by
 * the `resolveAliases` pass. Static (not a transform-call-time registry) because
 * that registration would run too late. Add a transform's alias names here when
 * it declares new ones (e.g. a future bipolar's `tau`/`sigma`/`tauSize`/…).
 */
export const KNOWN_ALIAS_KEYS = new Set(["theta", "thetaSize", "r", "rSize"]);

/** Pull the alias-keyed entries out of a mark's dim options, to stash on the
 * node for the `resolveAliases` pass. Non-alias keys are left for elaborateDims. */
export const extractAliasCandidates = <T>(
  dims: FancyDims<T>
): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const key of Object.keys(dims)) {
    if (KNOWN_ALIAS_KEYS.has(key)) out[key] = (dims as any)[key];
  }
  return out;
};

/** How an alias key resolves onto a node's `dims`: which axis, and which facet
 * (position aliases set `min` like x/y; `<name>Size` aliases set `size` like w/h). */
export type AliasResolution = { axis: Direction; facet: "min" | "size" };

/** Build the alias→(axis, facet) resolution map for a coord scope from the
 * transform's declared position aliases (e.g. `{ x: "theta", y: "r" }`). */
export const buildAliasMap = (aliases: {
  x?: string;
  y?: string;
}): Record<string, AliasResolution> => {
  const map: Record<string, AliasResolution> = {};
  if (aliases.x) {
    map[aliases.x] = { axis: 0, facet: "min" };
    map[`${aliases.x}Size`] = { axis: 0, facet: "size" };
  }
  if (aliases.y) {
    map[aliases.y] = { axis: 1, facet: "min" };
    map[`${aliases.y}Size`] = { axis: 1, facet: "size" };
  }
  return map;
};

export type IndexedDims<T = number> = {
  0?: Interval<T>;
  1?: Interval<T>;
};

export type WrappedDims<T = number> = { dims: Dimensions<T> };

export type FancyDims<T = number> =
  | XYWHDims<T>
  | IndexedDims<T>
  | WrappedDims<T>;

const isWrappedDims = <T>(d: FancyDims<T>): d is WrappedDims<T> => "dims" in d;

const isIndexedDims = <T>(d: FancyDims<T>): d is IndexedDims<T> =>
  "0" in d || "1" in d;

export const elaborateDims = <T>(dims: FancyDims<T>): Dimensions<T> => {
  if (isWrappedDims(dims)) {
    return dims.dims;
  }
  if (isIndexedDims(dims)) {
    return [
      {
        min: dims[0]?.min,
        center: dims[0]?.center,
        max: dims[0]?.max,
        size: dims[0]?.size,
        embedded: dims[0]?.embedded,
      },
      {
        min: dims[1]?.min,
        center: dims[1]?.center,
        max: dims[1]?.max,
        size: dims[1]?.size,
        embedded: dims[1]?.embedded,
      },
    ];
  }

  if (!("x" in dims))
    dims.x =
      dims.cx !== undefined && dims.w !== undefined
        ? (((dims.cx as number) - (dims.w as number) / 2) as T)
        : undefined;
  if (!("y" in dims))
    dims.y =
      dims.cy !== undefined && dims.h !== undefined
        ? (((dims.cy as number) - (dims.h as number) / 2) as T)
        : undefined;

  return [
    {
      min: dims.x,
      center: dims.cx,
      max: dims.x2,
      size: dims.w,
      embedded: dims.emX,
    },
    {
      min: dims.y,
      center: dims.cy,
      max: dims.y2,
      size: dims.h,
      embedded: dims.emY,
    },
  ];
};

export type Direction = 0 | 1;
export type FancyDirection = "x" | "y" | "theta" | "r" | Direction;

export type Anchor = "min" | "max" | "center" | "baseline";

/**
 * The single derivation of an anchor's coordinate on a box anchored at `start`
 * with signed extent `size`: `min → start`, `center → start + |size|/2`,
 * `max → start + |size|`, `baseline → 0` (the origin). center/max are DERIVED
 * here, never read from a separately-stored facet — so every site that needs them
 * agrees: the two placement paths (`place()` / `setExtent`'s rank-1 pin), the
 * `dims` getters (GoFishNode + GoFishRef), and `displayDims`. That removed the
 * asymmetric-box divergence that reverted the earlier `place()→setExtent` reroute
 * (#39 stage 2).
 *
 * Pure arithmetic on `(start, size)` — works in any frame. `|size|` is the
 * MAGNITUDE: a negative bar stores a signed size with `start` (its `min`) carrying
 * the direction, so its box is `[start, start + |size|]`.
 */
export const localAnchorPoint = (
  anchor: Anchor,
  start: number,
  size: number
): number => {
  const extent = Math.abs(size);
  switch (anchor) {
    case "min":
      return start;
    case "center":
      return start + extent / 2;
    case "max":
      return start + extent;
    case "baseline":
      return 0;
  }
};

export const elaborateDirection = (direction: FancyDirection): Direction => {
  switch (direction) {
    case "x":
      return 0;
    case "y":
      return 1;
    // Coordinate-space direction aliases. Unlike mark dim aliases (resolved by
    // the scope-bounded resolveAliases pass), `dir` is baked into an operator's
    // constraints at construction — before its enclosing coord exists — so it
    // can't be scope-checked. These map generically: `theta`=angular=x,
    // `r`=radial=y, which is exactly polar's x/y assignment.
    case "theta":
      return 0;
    case "r":
      return 1;
    default:
      return direction;
  }
};

export type Position = [number | undefined, number | undefined];

export type XYPosition = { x?: number; y?: number };
export type IndexedPosition = { 0?: number; 1?: number };

export type FancyPosition = XYPosition | IndexedPosition | Position;

const isXYPosition = (p: XYPosition | IndexedPosition): p is XYPosition =>
  "x" in p || "y" in p;

export const elaboratePosition = (position: FancyPosition): Position => {
  if (Array.isArray(position)) {
    return position;
  }
  if (isXYPosition(position)) {
    return [position.x, position.y];
  }
  return [position[0], position[1]];
};

export type Size<T = number> = [T, T];

export type WHSize<T = number> = { w: T; h: T };
export type IndexedSize<T = number> = { [K in Direction]: T };

export type FancySize<T = number> = WHSize<T> | IndexedSize<T> | Size<T>;

const isIndexedSize = <T>(s: WHSize<T> | IndexedSize<T>): s is IndexedSize<T> =>
  "0" in s || "1" in s;

export const elaborateSize = <T>(size: FancySize<T>): Size<T> => {
  if (Array.isArray(size)) {
    return size;
  }
  if (isIndexedSize(size)) {
    return [size[0], size[1]];
  }
  return [size.w, size.h];
};

export type Transform = { translate: Position; scale?: Size };
export type FancyTransform = { translate?: FancyPosition; scale?: FancySize };

/**
 * Combine a node's local box (`intrinsicDims`) with its `transform.translate`
 * into absolute per-axis display dims, DERIVING center/max from `(min, size)`
 * (the same relation as {@link localAnchorPoint} / the `dims` getter). Mirrors
 * the getter but with `?? 0` fallbacks — an unplaced/unsized facet reads 0,
 * which is what a shape `_render` wants for drawing. Shapes share this instead
 * of each re-deriving center/max from a separately-stored facet.
 */
export const displayDims = (
  intrinsicDims: Dimensions | undefined,
  transform: { translate?: (number | undefined)[] } | undefined
): { min: number; size: number; center: number; max: number }[] =>
  ([0, 1] as const).map((i) => {
    const min =
      (transform?.translate?.[i] ?? 0) + (intrinsicDims?.[i]?.min ?? 0);
    const size = intrinsicDims?.[i]?.size ?? 0;
    return {
      min,
      size, // raw (signed) — callers read it directly for width/height
      center: localAnchorPoint("center", min, size),
      max: localAnchorPoint("max", min, size),
    };
  });

/**
 * A node's render-side translate offset as a concrete `[tx, ty]` tuple, with the
 * `?? 0` fallback every shape/operator `_render` wants for drawing (an unplaced
 * axis draws at the origin). This is the single chokepoint for render's
 * `transform.translate` reads: making the move to baked absolute coordinates
 * (#39 stage 3-D) a one-function change rather than a ~15-site sweep. Scale is
 * left to the callers that compose it.
 */
export const displayTranslate = (transform?: {
  translate?: (number | undefined)[];
}): [number, number] => [
  transform?.translate?.[0] ?? 0,
  transform?.translate?.[1] ?? 0,
];

/**
 * The SVG `translate(tx, ty)` attribute string for a node's transform — the
 * render-wrapper form of {@link displayTranslate}, shared by every container/mark
 * that emits a `<g transform="translate(...)">`. These wrappers are exactly the
 * ones #39 stage 3-D collapses once render consumes baked absolute coordinates.
 */
export const translateString = (transform?: {
  translate?: (number | undefined)[];
}): string => {
  const [tx, ty] = displayTranslate(transform);
  return `translate(${tx}, ${ty})`;
};

/**
 * The `dims` getter body shared by {@link GoFishNode} and {@link GoFishRef}:
 * combine a node's local box (`intrinsicDims`) with its `transform.translate`
 * into absolute per-axis dims, returning `undefined` facets for "not yet placed
 * / not yet sized" so callers can distinguish that from "at 0". center/max are
 * DERIVED from the placed `(min, size)` via {@link localAnchorPoint} — never read
 * from a separately-stored facet, and only once the box is both placed AND sized.
 *
 * This is the `undefined`-preserving sibling of {@link displayDims}: same
 * derivation, but `displayDims` substitutes `?? 0` because a shape `_render`
 * wants a concrete number to draw with.
 */
export const combineDims = (
  intrinsicDims: Dimensions | undefined,
  transform: { translate?: (number | undefined)[] } | undefined
): Dimensions =>
  ([0, 1] as const).map((i) => {
    const intrinsic = intrinsicDims?.[i];
    const translate = transform?.translate?.[i];
    const size = intrinsic?.size;
    const min =
      translate !== undefined && intrinsic?.min !== undefined
        ? intrinsic.min + translate
        : undefined;
    const placedAndSized = min !== undefined && size !== undefined;
    return {
      min,
      center: placedAndSized
        ? localAnchorPoint("center", min!, size!)
        : undefined,
      max: placedAndSized ? localAnchorPoint("max", min!, size!) : undefined,
      size,
      embedded: intrinsic?.embedded,
    };
  });

export const elaborateTransform = (transform: FancyTransform): Transform => {
  return {
    translate: elaboratePosition(transform?.translate ?? {}),
    scale:
      transform?.scale !== undefined
        ? elaborateSize(transform.scale)
        : undefined,
  };
};
