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
  /** Axis-name-keyed options, resolved against the enclosing coordinate
   *  space's declared axis names. See {@link AxisDims}. */
  dims?: AxisDims<T>;
};

/**
 * One axis's options inside a mark's `dims` bag. A bare value is a position
 * with the same anchor as `x` (`min`); an interval object names its anchors.
 * The channel kind follows from the structure: `size` is a size channel, and a
 * bare value or `min`/`center`/`max` is a position channel.
 */
export type AxisInterval<T = number> = Interval<T>;

/**
 * A mark's `dims` option: axis name → value or interval. The legal names are
 * `x`/`y` (always) plus the names the enclosing coordinate space declares in
 * its `aliases` (polar: `theta`/`r`; geo: `lon`/`lat`). A mark is built before
 * its enclosing coord exists, so the bag is stored unresolved at construction
 * ({@link stashAxisDims}) and written onto the mark's per-axis dims by
 * `GoFishNode.resolveAliases` ({@link applyAxisDims}).
 */
export type AxisDims<T = number> = Record<string, T | AxisInterval<T>>;

export const INTERVAL_KEYS = [
  "min",
  "center",
  "max",
  "size",
  "embedded",
] as const;

/**
 * Is this `dims` entry an interval? A bare value (number, field name, function,
 * a tagged `datum(...)`/`field(...)` object, a per-entry array) is not: it is a
 * position. An interval is a plain object with no `type` tag.
 */
export const isAxisInterval = <T>(
  v: T | AxisInterval<T>
): v is AxisInterval<T> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype &&
  !("type" in v) &&
  !("__gofish_lambda" in v);

/** Read a `dims` entry as an interval (a bare value is `{ min: value }`),
 *  rejecting an interval with a key that is not an anchor. */
const toAxisInterval = <T>(
  name: string,
  entry: T | AxisInterval<T>
): AxisInterval<T> => {
  if (!isAxisInterval(entry)) return { min: entry as T };
  for (const key of Object.keys(entry)) {
    if (!(INTERVAL_KEYS as readonly string[]).includes(key)) {
      throw new Error(
        `dims.${name}: unknown key "${key}". An axis interval takes ` +
          `${INTERVAL_KEYS.join(", ")}.`
      );
    }
  }
  return entry;
};

/**
 * Map every value in a `dims` bag, telling `f` which channel kind each slot is:
 * `size` is "size"; a bare value or `min`/`center`/`max` is "pos". `embedded`
 * passes through, and a bare value stays bare. This is the one place the
 * structure → channel-kind rule lives, shared by mark channel inference
 * (withGoFish.ts) and operator channel inference (createOperator.ts).
 */
export const mapAxisDims = <A, B>(
  dims: AxisDims<A>,
  f: (value: A, kind: "pos" | "size") => B
): AxisDims<B> => {
  const out: AxisDims<B> = {};
  for (const [name, entry] of Object.entries(dims)) {
    if (entry === undefined) continue;
    if (!isAxisInterval(entry)) {
      out[name] = f(entry as A, "pos");
      continue;
    }
    const src = toAxisInterval(name, entry);
    const iv: AxisInterval<B> = {};
    for (const key of ["min", "center", "max"] as const) {
      if (src[key] !== undefined) iv[key] = f(src[key] as A, "pos");
    }
    if (src.size !== undefined) iv.size = f(src.size as A, "size");
    if (src.embedded !== undefined) iv.embedded = src.embedded;
    out[name] = iv;
  }
  return out;
};

/**
 * The axis names visible at a point in the tree, each mapped to its axis.
 * `x`/`y` are always present and always mean axis 0/1; a coordinate space adds
 * the names it declares (polar `theta`/`r`, geo `lon`/`lat`).
 */
export type AxisScope = Readonly<Record<string, Direction>>;

/** The scope outside every coordinate space that declares names. */
export const BASE_AXIS_SCOPE: AxisScope = { x: 0, y: 1 };

/** The scope inside a coordinate space that declares `aliases`. The innermost
 *  declaring space wins: its names replace any outer space's names. */
export const axisScopeFor = (aliases: {
  x?: string;
  y?: string;
}): AxisScope => {
  const scope: Record<string, Direction> = { ...BASE_AXIS_SCOPE };
  if (aliases.x !== undefined) scope[aliases.x] = 0;
  if (aliases.y !== undefined) scope[aliases.y] = 1;
  return scope;
};

/** Resolve an axis name (or index) against `scope`, or throw an error that
 *  lists the names the scope declares. `where` prefixes the message. */
export const resolveAxisName = (
  scope: AxisScope,
  name: AxisName | Direction,
  where: string
): Direction => {
  if (name === 0 || name === 1) return name;
  const axis = scope[name];
  if (axis !== undefined) return axis;
  const names = Object.keys(scope).join(", ");
  throw new Error(
    Object.keys(scope).length === Object.keys(BASE_AXIS_SCOPE).length
      ? `${where}: no enclosing coordinate space declares the axis name ` +
        `"${name}", so only ${names} are available here. Put the mark ` +
        `inside a coordinate space that declares "${name}", or use x/y.`
      : `${where}: the enclosing coordinate space does not declare the axis ` +
        `name "${name}". Names available here: ${names}.`
  );
};

/** The top-level option that writes each (anchor, axis) slot, for messages. */
const TOP_LEVEL_KEY: Record<(typeof INTERVAL_KEYS)[number], [string, string]> =
  {
    min: ["x", "y"],
    center: ["cx", "cy"],
    max: ["x2", "y2"],
    size: ["w", "h"],
    embedded: ["emX", "emY"],
  };

/** A mark's unresolved `dims` bag and the per-axis array it resolves onto. */
export type PendingAxisDims = { into: Dimensions<any>; entries: AxisDims<any> };

/** The stash a box-dims factory leaves on its node for `resolveAliases`:
 *  the `dims` option (if any) and the node's own per-axis dims array. */
export const stashAxisDims = (
  fancyDims: FancyDims<any>,
  into: Dimensions<any>
): PendingAxisDims | undefined => {
  const entries = (fancyDims as XYWHDims<any>).dims;
  return entries === undefined ? undefined : { into, entries };
};

/**
 * Write a mark's `dims` bag onto its per-axis `into` array, resolving each name
 * against `scope`. Each (axis, anchor) slot may be set once: a slot that a
 * top-level option (x, w, ...) or an earlier `dims` entry already set is an
 * error. `into` is mutated by reassigning its elements (not their fields), so
 * the mark's closures, which captured the same array, observe the result. A
 * `min` still missing afterwards is derived from `center` and `size`, exactly
 * as `elaborateDims` does for `cx` and `w`.
 */
export const applyAxisDims = (
  { into, entries }: PendingAxisDims,
  scope: AxisScope
): void => {
  const setBy: Record<string, string> = {};
  for (const [name, entry] of Object.entries(entries)) {
    if (entry === undefined) continue;
    const axis = resolveAxisName(scope, name, `dims.${name}`);
    const iv = toAxisInterval(name, entry);
    const next: Interval<any> = { ...into[axis] };
    for (const key of INTERVAL_KEYS) {
      if (iv[key] === undefined) continue;
      const slot = `${key}:${axis}`;
      if (next[key] !== undefined) {
        throw new Error(
          `dims.${name}: the ${key} of axis ${axis} is set twice, here and ` +
            `by ${setBy[slot] ?? TOP_LEVEL_KEY[key][axis]}. Set each axis ` +
            `anchor once.`
        );
      }
      next[key] = iv[key];
      setBy[slot] = `dims.${name}`;
    }
    into[axis] = next;
  }
  for (const axis of [0, 1] as const) {
    const d = into[axis];
    if (d.min === undefined && d.center !== undefined && d.size !== undefined) {
      into[axis] = { ...d, min: deriveMin(d.center, d.size) };
    }
  }
};

/** `min` from `center` and `size`: the one derivation `elaborateDims` (for
 *  `cx` with `w`) and {@link applyAxisDims} share. */
const deriveMin = <T>(center: T, size: T): T =>
  ((center as number) - (size as number) / 2) as T;

export type IndexedDims<T = number> = {
  0?: Interval<T>;
  1?: Interval<T>;
};

export type FancyDims<T = number> = XYWHDims<T> | IndexedDims<T>;

const isIndexedDims = <T>(d: FancyDims<T>): d is IndexedDims<T> =>
  "0" in d || "1" in d;

export const elaborateDims = <T>(dims: FancyDims<T>): Dimensions<T> => {
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
        ? deriveMin(dims.cx, dims.w)
        : undefined;
  if (!("y" in dims))
    dims.y =
      dims.cy !== undefined && dims.h !== undefined
        ? deriveMin(dims.cy, dims.h)
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
/** An axis by index or by its scope-free name. `x`/`y` mean axis 0/1 in every
 *  coordinate space. */
export type FancyDirection = "x" | "y" | Direction;

/** An axis named the way an operator's `dir` or a mark's `dims` key names it:
 *  `x`/`y`, or a name the enclosing coordinate space declares (polar
 *  `theta`/`r`, geo `lon`/`lat`). Resolved by {@link resolveAxisName} once the
 *  enclosing space is known. */
export type AxisName = "x" | "y" | (string & {});

export type Anchor = "min" | "max" | "center" | "baseline";

/**
 * The single derivation of an anchor's coordinate on a box anchored at `start`
 * with signed extent `size`: `min → start`, `center → start + |size|/2`,
 * `max → start + |size|`, `baseline → 0` (the origin). center/max are DERIVED
 * here, never read from a separately-stored anchor — so every site that needs them
 * agrees: the two placement paths (`place()` / `setExtent`'s rank-1 pin), the
 * `dims` getters (GoFishNode + GoFishRef), and `displayDims`. Deriving them here
 * is what keeps an asymmetric box from diverging between those paths.
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

/**
 * `anchor`'s point in a box's LOCAL frame, or `undefined` while the box does not
 * determine it: `center`/`max` are derived from `(min, size)` so they need both,
 * `min`/`baseline` need only `min`. The `undefined`-preserving read shared by
 * `GoFishNode.localAnchor` and `GoFishRef.localAnchor`.
 */
export const localAnchorOf = (
  intrinsic: Interval | undefined,
  anchor: Anchor
): number | undefined => {
  if (!anchorDetermined(intrinsic, anchor)) return undefined;
  return localAnchorPoint(anchor, intrinsic!.min!, intrinsic!.size ?? 0);
};

/** Does the local box determine `anchor`'s point? See {@link localAnchorOf}. */
export const anchorDetermined = (
  intrinsic: Interval | undefined,
  anchor: Anchor
): boolean =>
  intrinsic?.min !== undefined &&
  (anchor === "center" || anchor === "max"
    ? intrinsic.size !== undefined
    : true);

/**
 * The parent-frame translate that lands the box's `anchor` at `value` — the one
 * placement arithmetic `GoFishNode._pinAnchor` and `GoFishRef.place`/`pinAnchor`
 * share. Unplaced/unsized components read 0.
 */
export const translateForAnchor = (
  intrinsic: Interval | undefined,
  anchor: Anchor,
  value: number
): number =>
  value - localAnchorPoint(anchor, intrinsic?.min ?? 0, intrinsic?.size ?? 0);

export const elaborateDirection = (direction: FancyDirection): Direction => {
  switch (direction) {
    case "x":
      return 0;
    case "y":
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
 * the getter but with `?? 0` fallbacks — an unplaced/unsized anchor reads 0,
 * which is what a shape's `lower` wants for drawing. Shapes share this instead
 * of each re-deriving center/max from a separately-stored anchor.
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
 * `?? 0` fallback every shape/operator lower body wants for drawing (an unplaced
 * axis draws at the origin). The read of a BAKED absolute transform each
 * self-drawing boundary (coord, connect, enclose) applies to its own geometry.
 * The pure translate-only containers (box/layer, offset) instead flatten their
 * subtree to absolute coordinates via `bakeChildren`. Scale is left to the
 * callers that compose it.
 */
export const displayTranslate = (transform?: {
  translate?: (number | undefined)[];
}): [number, number] => [
  transform?.translate?.[0] ?? 0,
  transform?.translate?.[1] ?? 0,
];

/**
 * The `dims` getter body shared by {@link GoFishNode} and {@link GoFishRef}:
 * combine a node's local box (`intrinsicDims`) with its `transform.translate`
 * into absolute per-axis dims, returning `undefined` anchors for "not yet placed
 * / not yet sized" so callers can distinguish that from "at 0". center/max are
 * DERIVED from the placed `(min, size)` via {@link localAnchorPoint} — never read
 * from a separately-stored anchor, and only once the box is both placed AND sized.
 *
 * This is the `undefined`-preserving sibling of {@link displayDims}: same
 * derivation, but `displayDims` substitutes `?? 0` because a shape's `lower`
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
