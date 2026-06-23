import * as Monotonic from "../../util/monotonic";
import { computeAesthetic } from "../../util";
import { interval } from "../../util/interval";
import { GoFishNode } from "../_node";
import { getMeasure, getValue, isAesthetic, isValue } from "../data";
import {
  Dimensions,
  displayTranslate,
  elaborateDims,
  extractAliasCandidates,
  FancyDims,
  Transform,
} from "../dims";
import {
  DIFFERENCE,
  ORDINAL,
  POSITION,
  SIZE,
  UNDEFINED,
} from "../underlyingSpace";
import { createMark } from "../withGoFish";
import { attachCut } from "../graphicalOperators/cut";
import type { DisplayList } from "gofish-ir";
import { lowerStyle } from "../displayList/lowerHelpers";

type ImageDimensions = {
  width: number;
  height: number;
};

const imageDimensionsCache = new Map<string, ImageDimensions>();
const pendingImageLoads = new Set<string>();

const parseSvgLength = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const parseSvgViewBox = (
  value: string | undefined
): ImageDimensions | undefined => {
  if (!value) return undefined;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  const width = parts[2];
  const height = parts[3];
  if (width <= 0 || height <= 0) return undefined;
  return { width, height };
};

const parseSvgDataUriDimensions = (
  href: string
): ImageDimensions | undefined => {
  if (!href.startsWith("data:image/svg+xml")) return undefined;

  const commaIndex = href.indexOf(",");
  if (commaIndex === -1) return undefined;

  const metadata = href.slice(0, commaIndex);
  const dataPayload = href.slice(commaIndex + 1);

  let svgText: string;
  try {
    if (metadata.includes(";base64")) {
      if (typeof atob !== "function") return undefined;
      svgText = atob(dataPayload);
    } else {
      svgText = decodeURIComponent(dataPayload);
    }
  } catch {
    return undefined;
  }

  const widthMatch = svgText.match(/\bwidth\s*=\s*"([^"]+)"/i);
  const heightMatch = svgText.match(/\bheight\s*=\s*"([^"]+)"/i);
  const width = parseSvgLength(widthMatch?.[1]);
  const height = parseSvgLength(heightMatch?.[1]);

  if (width !== undefined && height !== undefined) {
    return { width, height };
  }

  const viewBoxMatch = svgText.match(/\bviewBox\s*=\s*"([^"]+)"/i);
  return parseSvgViewBox(viewBoxMatch?.[1]);
};

const cacheImageDimensions = (
  href: string,
  dimensions: ImageDimensions
): void => {
  if (dimensions.width > 0 && dimensions.height > 0) {
    imageDimensionsCache.set(href, dimensions);
  }
};

const startImageProbe = (href: string): void => {
  if (
    typeof globalThis.Image === "undefined" ||
    imageDimensionsCache.has(href) ||
    pendingImageLoads.has(href)
  ) {
    return;
  }

  pendingImageLoads.add(href);
  const image = new globalThis.Image();

  image.onload = () => {
    cacheImageDimensions(href, {
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
    pendingImageLoads.delete(href);
  };

  image.onerror = () => {
    pendingImageLoads.delete(href);
  };

  image.src = href;
};

const pendingImagePromises = new Map<string, Promise<void>>();

export const ensureImageDimensions = (href: string): Promise<void> => {
  if (imageDimensionsCache.has(href)) return Promise.resolve();
  const svgDims = parseSvgDataUriDimensions(href);
  if (svgDims) {
    cacheImageDimensions(href, svgDims);
    return Promise.resolve();
  }
  if (typeof globalThis.Image === "undefined") return Promise.resolve();

  const existing = pendingImagePromises.get(href);
  if (existing) return existing;

  const promise = new Promise<void>((resolve) => {
    const img = new globalThis.Image();
    img.onload = () => {
      cacheImageDimensions(href, {
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      pendingImagePromises.delete(href);
      resolve();
    };
    img.onerror = () => {
      pendingImagePromises.delete(href);
      resolve();
    };
    img.src = href;
  });
  pendingImagePromises.set(href, promise);
  return promise;
};

const resolveIntrinsicDimensions = (
  href: string
): ImageDimensions | undefined => {
  const cached = imageDimensionsCache.get(href);
  if (cached) return cached;

  const parsedSvgDimensions = parseSvgDataUriDimensions(href);
  if (parsedSvgDimensions) {
    cacheImageDimensions(href, parsedSvgDimensions);
    return parsedSvgDimensions;
  }

  startImageProbe(href);
  return undefined;
};

const resolveRenderedDimensions = (
  requestedWidth: number | undefined,
  requestedHeight: number | undefined,
  intrinsicDimensions: ImageDimensions | undefined
): ImageDimensions => {
  const hasIntrinsicAspectRatio =
    intrinsicDimensions !== undefined &&
    intrinsicDimensions.width > 0 &&
    intrinsicDimensions.height > 0;

  if (requestedWidth !== undefined && requestedHeight !== undefined) {
    return { width: requestedWidth, height: requestedHeight };
  }

  if (requestedWidth !== undefined) {
    if (hasIntrinsicAspectRatio) {
      return {
        width: requestedWidth,
        height:
          (requestedWidth * intrinsicDimensions!.height) /
          intrinsicDimensions!.width,
      };
    }
    return { width: requestedWidth, height: requestedWidth };
  }

  if (requestedHeight !== undefined) {
    if (hasIntrinsicAspectRatio) {
      return {
        width:
          (requestedHeight * intrinsicDimensions!.width) /
          intrinsicDimensions!.height,
        height: requestedHeight,
      };
    }
    return { width: requestedHeight, height: requestedHeight };
  }

  if (intrinsicDimensions) {
    return intrinsicDimensions;
  }

  return { width: 0, height: 0 };
};

export const Image = ({
  key,
  name,
  href,
  filter,
  opacity,
  preserveAspectRatio = "xMidYMid meet",
  ...fancyDims
}: {
  key?: string;
  name?: string;
  href: string;
  filter?: string;
  opacity?: number;
  preserveAspectRatio?: string;
} & FancyDims<number>) => {
  // `embedded` is authored by the resolveEmbedding pass — see rect.tsx.
  const dims = elaborateDims(fancyDims);

  const node = new GoFishNode(
    {
      name,
      key,
      type: "image",
      args: {
        key,
        name,
        href,
        filter,
        opacity,
        preserveAspectRatio,
        dims,
      },
      resolveUnderlyingSpace: () => {
        const xPos = dims[0].center ?? dims[0].min;
        const yPos = dims[1].center ?? dims[1].min;

        const resolveAxis = (axis: 0 | 1, pos: any) => {
          if (isValue(pos)) {
            const min = getValue(pos) ?? 0;
            if (isValue(dims[axis].size)) {
              return DIFFERENCE(
                getValue(dims[axis].size)!,
                getMeasure(dims[axis].size)
              );
            }
            return POSITION(interval(min, min), getMeasure(pos));
          }
          if (isAesthetic(pos) && isValue(dims[axis].size)) {
            return DIFFERENCE(
              getValue(dims[axis].size)!,
              getMeasure(dims[axis].size)
            );
          }
          if (!isValue(pos) && isValue(dims[axis].size)) {
            return SIZE(
              Monotonic.linear(getValue(dims[axis].size)!, 0),
              getMeasure(dims[axis].size)
            );
          }
          // No data position, no data size — image's intrinsic dimensions
          // are resolved at layout time via resolveRenderedDimensions.
          return UNDEFINED;
        };

        return [resolveAxis(0, xPos), resolveAxis(1, yPos)];
      },
      layout: (shared, size, scaleFactors, children, posScales) => {
        // For data-bound (Value-wrapped) dims, map from data units to pixels via
        // posScale when available — this keeps image sizing consistent with
        // rect's data-driven sizing. For literal-number dims, treat as pixels.
        const pixelSize = (dim: 0 | 1): number | undefined => {
          const raw = dims[dim].size;
          if (isValue(raw)) {
            const dataSize = getValue(raw)!;
            const scale = posScales?.[dim];
            return scale ? scale(dataSize) - scale(0) : dataSize;
          }
          return raw;
        };
        const requestedWidth = pixelSize(0);
        const requestedHeight = pixelSize(1);
        const intrinsicDimensions = resolveIntrinsicDimensions(href);
        const resolvedDimensions = resolveRenderedDimensions(
          requestedWidth,
          requestedHeight,
          intrinsicDimensions
        );

        const positionX =
          computeAesthetic(dims[0].center, posScales?.[0]!, undefined) ??
          computeAesthetic(dims[0].min, posScales?.[0]!, undefined);
        const positionY =
          computeAesthetic(dims[1].center, posScales?.[1]!, undefined) ??
          computeAesthetic(dims[1].min, posScales?.[1]!, undefined);

        return {
          intrinsicDims: [
            {
              min: 0,
              size: resolvedDimensions.width,
              embedded: dims[0].embedded,
            },
            {
              min: 0,
              size: resolvedDimensions.height,
              embedded: dims[1].embedded,
            },
          ],
          transform: {
            translate: [positionX, positionY],
          },
        };
      },
      // IR lowering — structural mirror of `render`. The legacy
      // `transform="scale(1,-1)" y={-y-height}` y-flip folds into `toPixel`: the
      // y-up box has min-x `x` and spans y `[y, y+height]`, so its display
      // top-left corner is `(x, y+height)`, which `toPixel` maps to the y-down
      // top-left pixel.
      lower: (
        { intrinsicDims, transform, toPixel },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const [tx, ty] = displayTranslate(transform);
        const x = tx + (intrinsicDims?.[0]?.min ?? 0);
        const y = ty + (intrinsicDims?.[1]?.min ?? 0);
        const width = intrinsicDims?.[0]?.size ?? 0;
        const height = intrinsicDims?.[1]?.size ?? 0;

        const [px, py] = toPixel([x, y + height]);
        const style = lowerStyle({ opacity, filter });
        const item: DisplayList.ImageItem = {
          kind: "image",
          x: px,
          y: py,
          w: Math.abs(width),
          h: Math.abs(height),
          href,
          preserveAspectRatio,
          datum: node.datum,
          role: "node",
        };
        if (Object.keys(style).length > 0) item.style = style;
        return [item];
      },
    },
    []
  );
  // Stash alias-keyed dims (theta/r/…) for the resolveAliases pass.
  node._pendingAliases = extractAliasCandidates(fancyDims);
  return node;
};

const rawImage = createMark(Image, {}, "image");

/** Wrap an image mark so it awaits intrinsic dimension loading before producing
 *  a node. Recursively wraps .name/.label so chained calls stay awaiting. */
const withDimsAwait = (mark: any, href: unknown): any => {
  const wrapped: any = async (...args: any[]) => {
    if (typeof href === "string") await ensureImageDimensions(href);
    return mark(...args);
  };
  // Use defineProperty because `.name` on a function is not writable by default.
  Object.defineProperty(wrapped, "name", {
    value: (layerName: string) => withDimsAwait(mark.name(layerName), href),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(wrapped, "label", {
    value: (accessor: any, options?: any) =>
      withDimsAwait(mark.label(accessor, options), href),
    writable: true,
    configurable: true,
  });
  // Method-form cut: `image({...}).cut({...})` is sugar for `cut(image, opts)`.
  return attachCut(wrapped);
};

export const image: typeof rawImage = ((opts: any) =>
  withDimsAwait(rawImage(opts), opts?.href)) as typeof rawImage;
