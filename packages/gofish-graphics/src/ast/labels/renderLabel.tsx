import type { JSX } from "solid-js";
import chroma from "chroma-js";
import { luv } from "culori";
import type { GoFishNode } from "../_node";
import { getValue } from "../data";
import {
  type LabelPosition,
  type ShapeInfo,
  inferLabelPosition,
  calculateLabelOffset,
  getLabelTextAnchor,
  resolveLabelText,
} from "./labelPlacement";

/**
 * Resolve the fill color of a node to a CSS color string.
 * Checks scaleContext for category-key colors first, falls back to literal values.
 */
function resolveNodeFill(node: GoFishNode): string | null {
  if (node.color == null) return null;

  const colorValue = getValue(node.color);
  if (colorValue == null) return null;

  try {
    const scaleContext = node.getRenderSession().scaleContext;
    const resolved = (scaleContext as any)?.unit?.color?.get(colorValue);
    if (resolved) return resolved as string;
  } catch {
    // no session yet
  }

  return typeof colorValue === "string" ? colorValue : null;
}

/**
 * Compute an auto label color.
 * - Inside the shape: contrast against the fill.
 * - Outside the shape: darken the fill for a readable tint on white background.
 */
function autoLabelColor(node: GoFishNode, isInside: boolean): string {
  const fill = resolveNodeFill(node);

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

export function renderLabelJSX(node: GoFishNode): JSX.Element | null {
  if (!node._label || !node.intrinsicDims) return null;
  const datum = node.datum;
  if (datum === undefined) return null;

  const labelText = resolveLabelText(node._label.accessor, datum);
  if (!labelText) return null;

  const placement = node._label.placement;

  // ─── Strategy-resolved placement ──────────────────────────────────────────
  if (placement) {
    if (placement.kind === "hidden") return null;

    const fontSize = placement.fontSize ?? node._label.fontSize ?? 11;
    const fontFamily = "source-sans-pro, sans-serif";

    if (placement.kind === "textPath") {
      const labelColor =
        node._label.color ??
        autoLabelColor(
          node,
          /* isInside= */ true /* path labels sit on the line */
        );
      // Render path into <defs> so the textPath flows along the same geometry
      // the connect operator drew. The chart's outer <g> applies scale(1, -1);
      // we counter-scale on the <text> so the glyphs remain upright.
      return (
        <>
          <defs>
            <path
              id={placement.pathId}
              d={placement.d}
              fill="none"
              stroke="none"
            />
          </defs>
          <text
            transform="scale(1, -1)"
            fill={labelColor}
            font-size={`${fontSize}px`}
            font-family={fontFamily}
            text-anchor="middle"
            dominant-baseline="central"
            pointer-events="none"
          >
            <textPath
              href={`#${placement.pathId}`}
              startOffset={placement.startOffset}
            >
              {labelText}
            </textPath>
          </text>
        </>
      );
    }

    // placement.kind === "transform"
    const isInside = node._labelKind === "area" || node._labelKind === "ribbon";
    const labelColor = node._label.color ?? autoLabelColor(node, isInside);
    const rotate = node._label.rotate;
    const transform = rotate
      ? `rotate(${-rotate},${placement.x},${placement.y}) scale(1,-1)`
      : "scale(1,-1)";

    return (
      <text
        transform={transform}
        x={placement.x}
        y={-placement.y}
        fill={labelColor}
        font-size={`${fontSize}px`}
        font-family={fontFamily}
        text-anchor={placement.anchor}
        dominant-baseline={placement.baseline}
        pointer-events="none"
      >
        {labelText}
      </text>
    );
  }

  // ─── Legacy declarative fallback (no strategy resolved) ──────────────────
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
    { position: node._label.position ?? "auto", offset: node._label.offset }
  );

  const offset = calculateLabelOffset(position, [w, h], {
    offset: node._label.offset,
  });

  const cx = (node.transform?.translate?.[0] ?? 0) + w / 2;
  const cy = (node.transform?.translate?.[1] ?? 0) + h / 2;

  const isInside =
    position === "center" || (position as string).startsWith("inset");
  const labelColor = node._label.color ?? autoLabelColor(node, isInside);
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
