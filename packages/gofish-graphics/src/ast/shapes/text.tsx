import * as Monotonic from "../../util/monotonic";
import { computeAesthetic } from "../../util";
import { interval } from "../../util/interval";
import { GoFishNode } from "../_node";
import {
  getValue,
  inferEmbedded,
  isAesthetic,
  isValue,
  MaybeValue,
} from "../data";
import { Dimensions, elaborateDims, FancyDims, Transform } from "../dims";
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
} & FancyDims<MaybeValue<number>>) => {
  const dims = elaborateDims(fancyDims).map(inferEmbedded);

  const textAnchor = "start";
  const dominantBaseline = "auto";

  return new GoFishNode(
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
              return DIFFERENCE(getValue(dims[axis].size)!);
            }
            return POSITION(interval(min, min));
          }
          if (isAesthetic(pos) && isValue(dims[axis].size)) {
            return DIFFERENCE(getValue(dims[axis].size)!);
          }
          if (!isValue(pos) && isValue(dims[axis].size)) {
            return SIZE(Monotonic.linear(getValue(dims[axis].size)!, 0));
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

        const minX = layout.bbox.minX - layout.anchor.x;
        const maxX = layout.bbox.maxX - layout.anchor.x;
        const minY = layout.bbox.minY - layout.anchor.y;
        const maxY = layout.bbox.maxY - layout.anchor.y;

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
              center: (minX + maxX) / 2,
              max: maxX,
              embedded: dims[0].embedded,
            },
            {
              min: minY,
              size: maxY - minY,
              center: (minY + maxY) / 2,
              max: maxY,
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

        const anchorX = transform?.translate?.[0] ?? 0;
        const anchorY = transform?.translate?.[1] ?? 0;

        const unit = node.getRenderSession().scaleContext?.unit;
        const unitColorScale = unit && "color" in unit ? unit.color : undefined;
        const resolvedFill = isValue(fill)
          ? unitColorScale
            ? unitColorScale.get(getValue(fill))
            : getValue(fill)
          : (fill as string | undefined);
        const resolvedStroke = isValue(stroke)
          ? unitColorScale
            ? unitColorScale.get(getValue(stroke))
            : getValue(stroke)
          : (stroke as string | undefined);

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

        const minXRel = layout.bbox.minX - layout.anchor.x;
        const maxXRel = layout.bbox.maxX - layout.anchor.x;
        const minYRel = layout.bbox.minY - layout.anchor.y;
        const maxYRel = layout.bbox.maxY - layout.anchor.y;

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

        return (
          <>
            {bbox}
            <text
              transform="scale(1, -1)"
              x={anchorX}
              y={-anchorY}
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
};

export const text = createMark(
  Text,
  {
    fill: "color",
    text: "raw",
  },
  "text"
);
