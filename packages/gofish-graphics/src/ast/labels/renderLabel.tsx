import type { JSX } from "solid-js";
import chroma from "chroma-js";
import { luv } from "culori";
import type { GoFishNode } from "../_node";
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

export function renderLabelJSX(
  node: GoFishNode,
  transformOverride?: Transform
): JSX.Element | null {
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

  const labelColor = node._label.color ?? autoLabelColor(node, position);
  const textAnchor = getLabelTextAnchor(position);

  const rotate = node._label.rotate;
  const transform = rotate
    ? `rotate(${-rotate},${cx + offset.x},${cy + offset.y}) scale(1,-1)`
    : "scale(1,-1)";

  return (
    <text
      transform={transform}
      x={cx + offset.x}
      y={-(cy + offset.y)}
      fill={labelColor}
      font-size={`${node._label.fontSize ?? 11}px`}
      font-family={"source-sans-pro, sans-serif"}
      text-anchor={textAnchor}
      dominant-baseline="central"
      pointer-events="none"
    >
      {labelText}
    </text>
  );
}
