import type { JSX } from "solid-js";
import chroma from "chroma-js";
import { luv } from "culori";
import type { DisplayList } from "gofish-ir";
import type { GoFishNode, ToPixel } from "../_node";
import { displayTranslate, type Transform } from "../dims";
import { getValue, type MaybeValue } from "../data";
import { resolveColorChannel } from "../../color";
import {
  type LabelPosition,
  type ShapeInfo,
  inferLabelPosition,
  calculateLabelOffset,
  getLabelTextAnchor,
  resolveLabelText,
} from "./labelPlacement";

/**
 * Resolve the fill color of a node to a CSS color string — the SAME resolution
 * the shape's own fill uses (`resolveColorChannel`), so a label contrasts
 * against the color actually drawn: a categorical swatch, a continuous gradient
 * `scaleFn(value)`, or a literal color. Falls back to a literal string value.
 */
function resolveNodeFill(node: GoFishNode): string | null {
  if (node.color == null) return null;

  try {
    const scaleContext = node.getRenderSession().scaleContext;
    const resolved = resolveColorChannel(
      node.color as MaybeValue<string>,
      scaleContext?.unit
    );
    if (typeof resolved === "string") return resolved;
  } catch {
    // no session yet
  }

  const colorValue = getValue(node.color);
  return typeof colorValue === "string" ? colorValue : null;
}

/**
 * Compute an auto label color.
 * - Inside the shape: contrast against the fill.
 * - Outside the shape: darken the fill for a readable tint on white background.
 */
function autoLabelColor(node: GoFishNode, position: LabelPosition): string {
  const fill = resolveNodeFill(node);
  const isInside =
    position === "center" || (position as string).startsWith("inset");

  if (isInside) {
    if (!fill) return "black";

    const luvColor = luv(fill);
    const lightness = luvColor?.l ?? 0;
    const [, , hue] = chroma(fill).lch();
    if (lightness < 60) {
      return "white";
    } else {
      return chroma.lch(8, 18, hue).hex();
    }
  }

  if (!fill) return "#333333";
  try {
    const [, chr, hue] = chroma(fill).lch();
    return chroma.lch(30, chr, hue).hex();
  } catch {
    return "#333333";
  }
}

/** The resolved geometry + style of a node's label, shared by the JSX renderer
 *  and the IR lowering so the two never drift. `(ax, ay)` is the anchor point in
 *  GoFish y-up display coordinates. */
type LabelLayout = {
  labelText: string;
  ax: number;
  ay: number;
  labelColor: string;
  textAnchor: "start" | "middle" | "end";
  /** Label rotation as authored (degrees). */
  rotate: number | undefined;
  fontSize: number;
};

const LABEL_FONT_FAMILY = "source-sans-pro, sans-serif";

function computeLabel(
  node: GoFishNode,
  transformOverride?: Transform
): LabelLayout | null {
  if (!node._label || !node.intrinsicDims) return null;
  const datum = node.datum;
  if (datum === undefined) return null;

  const labelText = resolveLabelText(node._label.accessor, datum);
  if (!labelText) return null;

  const w = node.intrinsicDims[0].size ?? 0;
  const h = node.intrinsicDims[1].size ?? 0;

  const shapeType = (
    ["rect", "ellipse", "petal", "line", "area"].includes(node.type)
      ? node.type
      : "rect"
  ) as ShapeInfo["type"];

  const position = inferLabelPosition(
    { type: shapeType, dimensions: [w, h] },
    {
      chartBounds: { width: w, height: h },
      availableSpace: { top: 20, right: 20, bottom: 20, left: 20 },
    },
    {
      position: node._label.position ?? "outset",
      offset: node._label.offset,
    }
  );

  const offset = calculateLabelOffset(position, [w, h], {
    offset: node._label.offset,
  });

  const [tx, ty] = displayTranslate(transformOverride ?? node.transform);
  const cx = tx + w / 2;
  const cy = ty + h / 2;

  return {
    labelText,
    ax: cx + offset.x,
    ay: cy + offset.y,
    labelColor: node._label.color ?? autoLabelColor(node, position),
    textAnchor: getLabelTextAnchor(position),
    rotate: node._label.rotate,
    fontSize: node._label.fontSize ?? 11,
  };
}

/**
 * Lower a node's label to a display-list `TextItem` (role `overlay`). Mirrors
 * {@link renderLabelJSX}: the anchor is mapped to a final pixel via `toPixel`,
 * and the label's `rotate(-rotate) scale(1,-1)` under the root flip becomes a
 * screen-space `rotate(+rotate)` about the pixel anchor (the extra flip negates
 * the angle; see the rendering essay).
 */
export function lowerLabelItems(
  node: GoFishNode,
  transformOverride: Transform | undefined,
  toPixel: ToPixel
): DisplayList.DisplayItem[] {
  const l = computeLabel(node, transformOverride);
  if (!l) return [];

  const [x, y] = toPixel([l.ax, l.ay]);
  const item: DisplayList.TextItem = {
    kind: "text",
    x,
    y,
    text: l.labelText,
    fontSize: l.fontSize,
    fontFamily: LABEL_FONT_FAMILY,
    textAnchor: l.textAnchor as DisplayList.TextItem["textAnchor"],
    dominantBaseline: "central",
    role: "overlay",
    style: { fill: l.labelColor },
  };
  if (l.rotate) item.rotate = l.rotate;
  return [item];
}
