import * as Monotonic from "../../util/monotonic";
import { resolveColorChannel } from "../../color";
import { computeAesthetic } from "../../util";
import { interval } from "../../util/interval";
import { GoFishNode } from "../_node";
import {
  getMeasure,
  getValue,
  inferEmbedded,
  isAesthetic,
  isValue,
  MaybeValue,
} from "../data";
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
type TextDimensions = {
  width: number;
  height: number;
  ascent: number;
  descent: number;
};

let _measureCtx: CanvasRenderingContext2D | null | undefined;

const getMeasureContext = (): CanvasRenderingContext2D | null => {
  if (_measureCtx !== undefined) return _measureCtx;
  if (typeof document === "undefined") {
    _measureCtx = null;
    return _measureCtx;
  }
  const canvas = document.createElement("canvas");
  _measureCtx = canvas.getContext("2d");
  return _measureCtx ?? null;
};

const estimateTextDimensions = (
  text: string,
  fontSize: number,
  fontFamily: string
): TextDimensions => {
  const ctx = getMeasureContext();
  if (ctx) {
    // Measure using the same font-family that the <text> element will use.
    // (We omit weight/style for now since this mark API doesn't expose them.)
    ctx.font = `${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const width = metrics.width;
    // Prefer font-level metrics for stable line height across strings.
    // actualBoundingBox* is glyph-dependent (e.g. descenders), which makes stacking look uneven.
    const ascent =
      (metrics as any).fontBoundingBoxAscent ??
      (metrics as any).actualBoundingBoxAscent ??
      fontSize * 0.8;
    const descent = -(
      (metrics as any).fontBoundingBoxDescent ??
      (metrics as any).actualBoundingBoxDescent ??
      fontSize * 0.2
    );
    const height = ascent - descent;
    return { width, height, ascent, descent };
  }

  // Non-DOM/SSR fallback: approximate based on font size.
  const avgCharWidth = fontSize * 0.6;
  const width = text.length * avgCharWidth;
  const ascent = fontSize * 0.8;
  const descent = -fontSize * 0.2;
  const height = ascent - descent;
  return { width, height, ascent, descent };
};

type TextLayout = {
  dims: TextDimensions;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  anchor: { x: number; y: number };
};

type RelBBox = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Rotate an anchor-relative bbox by `deg` (degrees, CCW in the chart's y-up
 * world frame) about the anchor and return the axis-aligned min/max of the
 * rotated corners. Standard rotation matrix: x' = x·cosθ − y·sinθ,
 * y' = x·sinθ + y·cosθ.
 *
 * Sanity for rotate:90 — x∈[0,w], y∈[descent,ascent] (the unrotated relative
 * box, anchor at the start baseline) maps to x∈[−ascent,−descent], y∈[0,w]:
 * a narrow strip left of the anchor extending up — exactly the footprint a
 * conventional y-axis title occupies in the left gutter.
 */
const rotateRelBBox = (b: RelBBox, deg: number): RelBBox => {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: [number, number][] = [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
    [b.minX, b.maxY],
  ];
  const xs = corners.map(([x, y]) => x * cos - y * sin);
  const ys = corners.map(([x, y]) => x * sin + y * cos);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};

const resolveTextLayout = (
  text: string,
  fontSize: number,
  fontFamily: string,
  textAnchor: "start" | "middle" | "end",
  dominantBaseline: "auto" | "central" | "hanging" | "mathematical"
): TextLayout => {
  const dims = estimateTextDimensions(text ?? "", fontSize, fontFamily);
  const bbox = {
    minX: 0,
    minY: dims.descent,
    maxX: dims.width,
    maxY: dims.ascent,
  };

  const anchorX =
    textAnchor === "middle"
      ? dims.width / 2
      : textAnchor === "end"
        ? dims.width
        : 0;

  let anchorY = 0;
  if (dominantBaseline === "central") {
    anchorY = (bbox.minY + bbox.maxY) / 2;
  } else if (dominantBaseline === "hanging") {
    anchorY = bbox.maxY;
  } else if (dominantBaseline === "mathematical") {
    anchorY = dims.ascent * 0.5;
  }

  return { dims, bbox, anchor: { x: anchorX, y: anchorY } };
};

export const Text = ({
  key,
  name,
  text: textContent,
  fill = "black",
  stroke,
  strokeWidth = 0,
  filter,
  fontSize = 12,
  fontFamily = "system-ui, sans-serif",
  debugBoundingBox = false,
  rotate = 0,
  ...fancyDims
}: {
  key?: string;
  name?: string;
  text: MaybeValue<string | number>;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  filter?: string;
  fontSize?: number;
  fontFamily?: string;
  debugBoundingBox?: boolean;
  /** Rotation in degrees, applied in the chart's y-up world frame about the
   *  text anchor. `rotate: 90` yields a conventional y-axis title — it reads
   *  bottom-to-top with glyph tops facing left. */
  rotate?: number;
} & FancyDims<MaybeValue<number>>) => {
  const dims = elaborateDims(fancyDims).map(inferEmbedded);

  const textAnchor = "start";
  const dominantBaseline = "auto";

  const node = new GoFishNode(
    {
      name,
      key,
      type: "text",
      args: {
        key,
        name,
        text: textContent,
        fill,
        stroke,
        strokeWidth,
        filter,
        fontSize,
        fontFamily,
        textAnchor,
        debugBoundingBox,
        rotate,
        dims,
      },
      color: fill,
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
          // No data position, no data size — text's intrinsic extent is
          // handled at layout time, not via the underlying-space tree.
          return UNDEFINED;
        };

        return [resolveAxis(0, xPos), resolveAxis(1, yPos)];
      },
      layout: (shared, size, scaleFactors, children, posScales) => {
        const finalText = isValue(textContent)
          ? getValue(textContent)
          : textContent;
        const layout = resolveTextLayout(
          finalText == null ? "" : String(finalText),
          fontSize,
          fontFamily,
          textAnchor,
          dominantBaseline
        );

        // Anchor-relative bbox. When the text is rotated, its layout footprint
        // is the rotated box (e.g. rotate:90 turns a wide label into a tall
        // strip left of the anchor — a y-title gutter), so we measure the
        // axis-aligned extent of the rotated corners. rotate:0 is the identity
        // here, but we skip the matrix so unrotated text is bit-for-bit
        // unchanged.
        const relRaw: RelBBox = {
          minX: layout.bbox.minX - layout.anchor.x,
          maxX: layout.bbox.maxX - layout.anchor.x,
          minY: layout.bbox.minY - layout.anchor.y,
          maxY: layout.bbox.maxY - layout.anchor.y,
        };
        const { minX, maxX, minY, maxY } = rotate
          ? rotateRelBBox(relRaw, rotate)
          : relRaw;

        const positionX =
          computeAesthetic(dims[0].center, posScales?.[0]!, undefined) ??
          computeAesthetic(dims[0].min, posScales?.[0]!, undefined);
        const positionY =
          computeAesthetic(dims[1].center, posScales?.[1]!, undefined) ??
          computeAesthetic(dims[1].min, posScales?.[1]!, undefined);

        return {
          intrinsicDims: [
            {
              min: minX,
              size: maxX - minX,
              embedded: dims[0].embedded,
            },
            {
              min: minY,
              size: maxY - minY,
              embedded: dims[1].embedded,
            },
          ],
          transform: {
            translate: [positionX, positionY],
          },
          renderData: { layout },
        };
      },
      render: (
        {
          intrinsicDims,
          transform,
          renderData,
        }: {
          intrinsicDims?: Dimensions;
          transform?: Transform;
          renderData?: { layout?: TextLayout };
        },
        _children,
        node
      ) => {
        const finalText = isValue(textContent)
          ? getValue(textContent)
          : textContent;

        const [anchorX, anchorY] = displayTranslate(transform);

        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke = resolveColorChannel(stroke, unitScale);

        const layout =
          renderData?.layout ??
          resolveTextLayout(
            finalText == null ? "" : String(finalText),
            fontSize,
            fontFamily,
            textAnchor,
            dominantBaseline
          );

        const bboxStroke = "#ff00aa";
        const bboxStrokeWidth = 1;
        const bboxDash = "4 3";
        const showDebugBoundingBox = debugBoundingBox;

        // Debug rect shows the TRUE (rotated) footprint, so route the relative
        // box through the same rotation the layout pass used.
        const relRaw = {
          minX: layout.bbox.minX - layout.anchor.x,
          minY: layout.bbox.minY - layout.anchor.y,
          maxX: layout.bbox.maxX - layout.anchor.x,
          maxY: layout.bbox.maxY - layout.anchor.y,
        };
        const relRot = rotate ? rotateRelBBox(relRaw, rotate) : relRaw;
        const minXRel = relRot.minX;
        const maxXRel = relRot.maxX;
        const minYRel = relRot.minY;
        const maxYRel = relRot.maxY;

        const bbox =
          showDebugBoundingBox &&
          Number.isFinite(minXRel) &&
          Number.isFinite(minYRel) ? (
            <rect
              transform="scale(1, -1)"
              x={anchorX + minXRel}
              y={-(anchorY + maxYRel)}
              width={maxXRel - minXRel}
              height={maxYRel - minYRel}
              fill="none"
              stroke={bboxStroke}
              stroke-width={bboxStrokeWidth}
              stroke-dasharray={bboxDash}
              pointer-events="none"
            />
          ) : null;

        // Unrotated: byte-identical markup to before (capture-diff must not
        // see unrotated text move). Rotated: scale(1,-1) flips glyph space into
        // the y-up world orientation, rotate(θ) is then the SAME matrix as
        // rotateRelBBox (so render and the measured bbox agree), and translate
        // moves the anchor to the placed position — emitted x/y are 0 because
        // the translate already carries the placement.
        const textTransform = rotate
          ? `translate(${anchorX}, ${anchorY}) rotate(${rotate}) scale(1, -1)`
          : "scale(1, -1)";
        const textX = rotate ? 0 : anchorX;
        const textY = rotate ? 0 : -anchorY;

        return (
          <>
            {bbox}
            <text
              transform={textTransform}
              x={textX}
              y={textY}
              fill={resolvedFill}
              stroke={resolvedStroke}
              stroke-width={strokeWidth ?? 0}
              filter={filter}
              font-size={`${fontSize}px`}
              font-family={fontFamily}
              text-anchor={textAnchor}
              dominant-baseline={dominantBaseline}
            >
              {finalText}
            </text>
          </>
        );
      },
    },
    []
  );
  // Stash alias-keyed dims (theta/r/…) for the resolveAliases pass.
  node._pendingAliases = extractAliasCandidates(fancyDims);
  return node;
};

export const text = createMark(
  Text,
  {
    fill: "color",
    text: "raw",
  },
  "text"
);
