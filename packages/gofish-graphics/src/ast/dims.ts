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

export const elaborateTransform = (transform: FancyTransform): Transform => {
  return {
    translate: elaboratePosition(transform?.translate ?? {}),
    scale:
      transform?.scale !== undefined
        ? elaborateSize(transform.scale)
        : undefined,
  };
};
