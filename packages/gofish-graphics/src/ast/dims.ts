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
export type FancyDirection = "x" | "y" | Direction;

export type Anchor = "min" | "max" | "center" | "baseline";

/**
 * Local-frame coordinate of an anchor on a box `[localMin, localMin + localSize]`.
 * `center` and `max` are DERIVED here (`localMin + size/2`, `localMin + size`),
 * never read from a separately-stored facet — so the two node placement paths
 * (`place()` and `setExtent`'s rank-1 pin) agree on the geometry even for an
 * (only latently reachable) asymmetric box, where a stored `center` could
 * diverge from `min + size/2`. That divergence is exactly what reverted the
 * earlier `place()→setExtent` reroute (#39 stage 2); deriving removes it at the
 * source. `baseline` is the local origin (point 0).
 *
 * This is the LOCAL-frame (pre-translate) reader. Anchor readers that consume a
 * node's ABSOLUTE placed extent (`constraints/align.ts` `anchorValue`,
 * `constraints/distribute.ts`) read `node.dims[...]` post-translate instead and
 * are not callers of this.
 */
export const localAnchorPoint = (
  anchor: Anchor,
  localMin: number,
  localSize: number
): number => {
  // Extent is the MAGNITUDE of size — a negative bar stores a signed size with
  // `min` carrying the direction (box `[min, min + |size|]`), so center/max are
  // anchored off `|size|` (matches the `dims` getter / `displayDims`).
  const extent = Math.abs(localSize);
  switch (anchor) {
    case "min":
      return localMin;
    case "center":
      return localMin + extent / 2;
    case "max":
      return localMin + extent;
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
    // Extent is the MAGNITUDE of size: a negative bar stores a signed size with
    // `min` carrying the direction (box `[min, min + |size|]`), so center/max use
    // `|size|`. `size` itself stays raw for callers that read it directly.
    const extent = Math.abs(size);
    return { min, size, center: min + extent / 2, max: min + extent };
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
