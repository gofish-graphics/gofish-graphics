import { resolveColorChannel } from "../../color";
import { computeAesthetic } from "../../util";
import { posFn } from "../domain";
import { GoFishNode } from "../_node";
import { orientDims } from "../axisDirection";
import { getValue, isValue, MaybeValue } from "../data";
import {
  displayTranslate,
  elaborateDims,
  type Interval,
  deferAxisDims,
  FancyDims,
  Transform,
} from "../dims";
import { glyphAxis } from "../underlyingSpace";
import { FALLBACK_FONT_FAMILY } from "./fontUtils";
import { createMark } from "../withGoFish";
import { MARK_CHANNELS } from "../markChannels.generated";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  rectItemFromBox,
  roleFor,
} from "../displayList/lowerHelpers";
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

export const estimateTextDimensions = (
  text: string,
  fontSize: number,
  fontFamily: string,
  fontStyle?: string,
  fontWeight?: number | string
): TextDimensions => {
  const ctx = getMeasureContext();
  if (ctx) {
    // Measure using the same font-family/style/weight that the <text> element
    // will use (CSS shorthand order: style weight size family).
    ctx.font = `${fontStyle ? `${fontStyle} ` : ""}${
      fontWeight !== undefined ? `${fontWeight} ` : ""
    }${fontSize}px ${fontFamily}`;
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
 * Rotate an anchor-relative pixel bbox (y-down) by `deg` degrees, clockwise on
 * screen (SVG's `rotate`), about the anchor and return the axis-aligned
 * min/max of the rotated corners. Standard rotation matrix in y-down pixels:
 * x' = x·cosθ − y·sinθ, y' = x·sinθ + y·cosθ.
 *
 * Sanity for rotate:−90 — x∈[0,w], y∈[−ascent,−descent] (the unrotated box,
 * anchor at the start baseline) maps to x∈[−ascent,−descent], y∈[−w,0]: a
 * narrow strip left of the anchor extending up — exactly the footprint a
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
  dominantBaseline: "auto" | "central" | "hanging" | "mathematical",
  fontStyle?: string,
  fontWeight?: number | string
): TextLayout => {
  const dims = estimateTextDimensions(
    text ?? "",
    fontSize,
    fontFamily,
    fontStyle,
    fontWeight
  );
  // Pixel (y-down) box about the baseline: the glyphs rise `ascent` above it
  // (negative y) and hang `-descent` below it.
  const bbox = {
    minX: 0,
    minY: -dims.ascent,
    maxX: dims.width,
    maxY: -dims.descent,
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
    anchorY = bbox.minY;
  } else if (dominantBaseline === "mathematical") {
    anchorY = -dims.ascent * 0.5;
  }

  return { dims, bbox, anchor: { x: anchorX, y: anchorY } };
};

export const Text = ({
  key,
  text: textContent,
  fill = "black",
  stroke,
  strokeWidth = 0,
  filter,
  fontSize = 12,
  fontFamily = FALLBACK_FONT_FAMILY,
  fontStyle,
  fontWeight,
  debugBoundingBox = false,
  rotate = 0,
  textAnchor = "start",
  ...fancyDims
}: {
  key?: string;
  text: MaybeValue<string | number>;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  filter?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fontWeight?: number | string;
  debugBoundingBox?: boolean;
  /** Rotation in degrees, clockwise on screen, about the text anchor (SVG's
   *  `rotate`). `rotate: -90` yields a conventional y-axis title — it reads
   *  bottom-to-top with glyph tops facing left. */
  rotate?: number;
  /** Which end of the (pre-rotation) text is its x origin — the x of the
   *  point `rotate` pivots about, and the x an `align`/`position`
   *  constraint's `"baseline"` anchor pins (see `_node.ts`'s `_pinAnchor`).
   *  (In y the origin is the box's start edge, as for a rect.) Defaults to
   *  `"start"` (the first character), matching ordinary left-to-right text
   *  flow; `"end"` pivots at the last character instead — used for an
   *  obliquely-rotated label that should hang from its end rather than its
   *  start (see `axes/elaborate.tsx`'s hanging-point rule for rotated axis
   *  labels). */
  textAnchor?: "start" | "middle" | "end";
} & FancyDims<MaybeValue<number>>) => {
  // `embedded` is authored by the resolveEmbedding pass — see rect.tsx.
  const dims = elaborateDims(fancyDims);

  const dominantBaseline = "auto";

  const node = new GoFishNode(
    {
      key,
      type: "text",
      args: {
        key,
        text: textContent,
        fill,
        stroke,
        strokeWidth,
        filter,
        fontSize,
        fontFamily,
        fontStyle,
        fontWeight,
        textAnchor,
        debugBoundingBox,
        rotate,
        dims,
      },
      color: fill,
      resolveUnderlyingSpace: () => {
        const xPos = dims[0].center ?? dims[0].min;
        const yPos = dims[1].center ?? dims[1].min;

        return [glyphAxis(xPos, dims[0].size), glyphAxis(yPos, dims[1].size)];
      },
      layout: (size, scales, children, node) => {
        const finalText = isValue(textContent)
          ? getValue(textContent)
          : textContent;
        const layout = resolveTextLayout(
          finalText == null ? "" : String(finalText),
          fontSize,
          fontFamily,
          textAnchor,
          dominantBaseline,
          fontStyle,
          fontWeight
        );

        // Anchor-relative pixel bbox. When the text is rotated, its layout
        // footprint is the rotated box (e.g. rotate:-90 turns a wide label
        // into a tall strip left of the anchor — a y-title gutter), so we
        // measure the axis-aligned extent of the rotated corners. rotate:0 is
        // the identity here, but we skip the matrix so unrotated text is
        // bit-for-bit unchanged.
        const relRaw: RelBBox = {
          minX: layout.bbox.minX - layout.anchor.x,
          maxX: layout.bbox.maxX - layout.anchor.x,
          minY: layout.bbox.minY - layout.anchor.y,
          maxY: layout.bbox.maxY - layout.anchor.y,
        };
        const { minX, maxX, minY, maxY } = rotate
          ? rotateRelBBox(relRaw, rotate)
          : relRaw;
        // A text is a box, placed exactly like a rect of the same size: its
        // origin (local 0, the point parents seat it by and the `baseline`
        // anchor) is the box's START edge in its own axis order — the top in
        // a frame that reads top-down, the bottom in one whose y grows upward
        // — and `y`/`cy` place that box as they place a rect's. The glyphs'
        // anchor (the baseline point `textAnchor` and `rotate` refer to) sits
        // inside the box, `glyphDy` screen pixels down from the origin (up,
        // when negative). In x the origin
        // is the `textAnchor` point, which for the default `"start"` is again
        // the box's start edge.
        const height = maxY - minY;

        const positionX =
          computeAesthetic(
            dims[0].center,
            posFn(scales?.[0]?.map)!,
            undefined
          ) ??
          computeAesthetic(dims[0].min, posFn(scales?.[0]?.map)!, undefined);
        const centerY = computeAesthetic(
          dims[1].center,
          posFn(scales?.[1]?.map)!,
          undefined
        );
        const positionY =
          centerY !== undefined
            ? centerY - height / 2
            : computeAesthetic(
                dims[1].min,
                posFn(scales?.[1]?.map)!,
                undefined
              );

        const box: [Interval, Interval] = [
          {
            min: minX,
            size: maxX - minX,
            embedded: dims[0].embedded,
          },
          {
            min: 0,
            size: height,
            embedded: dims[1].embedded,
          },
        ];
        // The glyph anchor in screen pixels below the origin: the box's top
        // in pixels, less the glyphs' top.
        const glyphDy = orientDims(box, node.yFrame.direction)[1].min! - minY;
        return {
          intrinsicDims: box,
          transform: {
            translate: [positionX, positionY],
          },
          renderData: { layout, glyphDy },
        };
      },
      // IR lowering. The glyph anchor is the origin mapped through `toPixel`
      // and moved `glyphDy` down the screen; the rotation is SVG's,
      // clockwise on screen.
      lower: (
        { transform, renderData, toPixel, intrinsicDims },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const finalText = isValue(textContent)
          ? getValue(textContent)
          : textContent;
        const text = finalText == null ? "" : String(finalText);

        const [anchorX, anchorY] = displayTranslate(transform);
        // `glyphDy` is in screen pixels (a text is drawn upright at its
        // point even inside a coordinate space), so it applies after the
        // origin maps through `toPixel`.
        const glyphDy = (renderData as { glyphDy?: number })?.glyphDy ?? 0;
        const [px, originPy] = toPixel([anchorX, anchorY]);
        const py = originPy + glyphDy;

        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke = resolveColorChannel(stroke, unitScale);

        const items: DisplayList.DisplayItem[] = [];

        // Debug bbox (rare): the true rotated footprint, dashed.
        if (debugBoundingBox) {
          const layout =
            (renderData as { layout?: TextLayout })?.layout ??
            resolveTextLayout(
              text,
              fontSize,
              fontFamily,
              textAnchor,
              dominantBaseline,
              fontStyle,
              fontWeight
            );
          const relRaw = {
            minX: layout.bbox.minX - layout.anchor.x,
            minY: layout.bbox.minY - layout.anchor.y,
            maxX: layout.bbox.maxX - layout.anchor.x,
            maxY: layout.bbox.maxY - layout.anchor.y,
          };
          const relRot = rotate ? rotateRelBBox(relRaw, rotate) : relRaw;
          if (Number.isFinite(relRot.minX) && Number.isFinite(relRot.minY)) {
            items.push(
              rectItemFromBox(
                anchorX + relRot.minX,
                anchorX + relRot.maxX,
                anchorY + glyphDy + relRot.minY,
                anchorY + glyphDy + relRot.maxY,
                toPixel,
                {
                  role: "overlay",
                  style: lowerStyle({
                    fill: "none",
                    stroke: "#ff00aa",
                    strokeWidth: 1,
                    strokeDasharray: "4 3",
                  }),
                }
              )
            );
          }
        }

        const textItem: DisplayList.TextItem = {
          kind: "text",
          x: px,
          y: py,
          text,
          fontSize,
          fontFamily,
          fontStyle,
          fontWeight,
          textAnchor: textAnchor as DisplayList.TextItem["textAnchor"],
          dominantBaseline:
            dominantBaseline as DisplayList.TextItem["dominantBaseline"],
          role: roleFor(node.datum),
          datum: node.datum,
          style: lowerStyle({
            fill: resolvedFill,
            stroke: resolvedStroke,
            strokeWidth: strokeWidth ?? 0,
            filter,
          }),
        };
        if (rotate) textItem.rotate = rotate;
        items.push(textItem);
        return items;
      },
    },
    []
  );
  // Defer the axis-name-keyed `dims` option to the resolveAliases pass.
  node._elaborateInAxisScope = deferAxisDims(fancyDims, dims);
  return node;
};

export const text = createMark(Text, MARK_CHANNELS.text, "text");
