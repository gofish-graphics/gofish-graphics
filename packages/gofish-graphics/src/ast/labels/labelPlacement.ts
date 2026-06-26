import { Direction, Size } from "../dims";

export type LabelAccessor<D = any> = string | ((d: D) => string);

export interface LabelOptions {
  position?: LabelPosition;
  fontSize?: number;
  color?: string;
  offset?: number;
  minSpace?: number;
  rotate?: number;
}

export interface LabelSpec<D = any> extends LabelOptions {
  accessor: LabelAccessor<D>;
}

export function resolveLabelText(accessor: LabelAccessor, datum: any): string {
  if (typeof accessor === "function") return String(accessor(datum) ?? "");
  if (datum == null) return "";
  const obj = Array.isArray(datum) ? datum[0] : datum;
  return obj?.[accessor] != null ? String(obj[accessor]) : "";
}

export type LabelSide = "inset" | "outset";
export type LabelEdge = "top" | "bottom" | "left" | "right";
export type LabelAlignment = "start" | "center" | "end";

/**
 * Label position — three optional dimensions separated by hyphens:
 *
 * `side-edge-align`
 *
 * - `side`: `inset | outset` — whether the label sits inside or outside the shape
 * - `edge`: `top | bottom | left | right` — which edge to anchor to
 * - `align`: `start | center | end` — alignment along the perpendicular axis
 *
 * Special tokens:
 * - `"center"` — dead center of the shape (no edge)
 * - `"outset"` — shorthand for `outset-top-center`
 * - `inset` always requires an edge: `"inset-top"`, `"inset-bottom"`, etc.
 *
 * Defaults: side → `outset`, edge → `top`, align → `center`
 *
 * Alignment semantics:
 * - `outset-top` / `outset-bottom` / `inset-top` / `inset-bottom`:
 *   align is along x — `start` = left edge, `end` = right edge
 * - `outset-left` / `outset-right` / `inset-left` / `inset-right`:
 *   align is along y — `start` = top edge, `end` = bottom edge
 */
export type LabelPosition =
  | "center"
  | "outset"
  | `${LabelSide}-${LabelEdge}`
  | `${LabelSide}-${LabelEdge}-${LabelAlignment}`;

const SIDES = new Set<string>(["inset", "outset"]);
const EDGES = new Set<string>(["top", "bottom", "left", "right"]);
const ALIGNMENTS = new Set<string>(["start", "center", "end"]);

interface ParsedPosition {
  side: LabelSide;
  edge: LabelEdge | null;
  align: LabelAlignment;
}

/** Parse a position string into its three dimensions. */
function parseLabelPosition(position: LabelPosition): ParsedPosition {
  if (position === "center")
    return { side: "inset", edge: null, align: "center" };

  const parts = (position as string).split("-");

  let side: LabelSide = "outset";
  let edge: LabelEdge | null = null;
  let align: LabelAlignment = "center";

  let i = 0;

  if (parts[i] && SIDES.has(parts[i])) {
    side = parts[i] as LabelSide;
    i++;
  }

  if (parts[i] && EDGES.has(parts[i])) {
    edge = parts[i] as LabelEdge;
    i++;
  }

  if (parts[i] && ALIGNMENTS.has(parts[i])) {
    align = parts[i] as LabelAlignment;
  }

  return { side, edge, align };
}

export interface LabelConfig {
  position?: LabelPosition;
  offset?: number;
  minSpace?: number;
  preferInside?: boolean;
}

export interface ShapeInfo {
  type: "rect" | "ellipse" | "petal" | "line" | "ribbon";
  dimensions: Size;
  direction?: Direction;
  coordinateSystem?: "linear" | "polar" | "bipolar";
  isStacked?: boolean;
  stackDirection?: Direction;
  isSpread?: boolean;
  spreadDirection?: Direction;
}

export interface LayoutContext {
  chartBounds: { width: number; height: number };
  availableSpace: { top: number; right: number; bottom: number; left: number };
  hasAxes?: boolean;
  isMultiSeries?: boolean;
}

export const inferLabelPosition = (
  shape: ShapeInfo,
  context: LayoutContext,
  config: LabelConfig = {}
): LabelPosition => {
  if (config.position) {
    return config.position;
  }

  if (shape.coordinateSystem === "polar") {
    const area = shape.dimensions[0] * shape.dimensions[1];
    const threshold =
      context.chartBounds.width * context.chartBounds.height * 0.05;
    return area < threshold ? "center" : "outset-right";
  }

  if (shape.isStacked) {
    const stackDim = shape.stackDirection ?? 1;
    const size = shape.dimensions[stackDim];
    const minSize = config.minSpace ?? 20;

    if (size > minSize && config.preferInside !== false) {
      return "center";
    }

    if (shape.stackDirection === 1) {
      return context.availableSpace.bottom > context.availableSpace.top
        ? "outset-bottom"
        : "outset-top";
    } else {
      return context.availableSpace.right > context.availableSpace.left
        ? "outset-right"
        : "outset-left";
    }
  }

  if (shape.isSpread) {
    const spreadDim = shape.spreadDirection ?? 0;
    if (spreadDim === 0) {
      return context.hasAxes ? "outset-bottom" : "outset-top";
    }
    if (spreadDim === 1) {
      return context.hasAxes ? "outset-left" : "outset-top";
    }
  }

  if (
    (shape.type === "line" || shape.type === "ribbon") &&
    context.isMultiSeries
  ) {
    return "outset-right";
  }

  if (shape.type === "rect" || shape.type === "ellipse") {
    const area = shape.dimensions[0] * shape.dimensions[1];
    const threshold = config.minSpace ?? 20;
    if (area > threshold * threshold) {
      return "center";
    }
  }

  return "outset-top";
};

export const calculateLabelOffset = (
  position: LabelPosition,
  shapeSize: Size,
  config: LabelConfig = {}
): { x: number; y: number } => {
  if (position === "center") return { x: 0, y: 0 };
  const baseOffset = config.offset ?? 10;
  const [width, height] = shapeSize;
  const { side, edge, align } = parseLabelPosition(position);

  if (side === "outset") {
    switch (edge ?? "top") {
      case "top": {
        const xAlign =
          align === "start" ? -width / 2 : align === "end" ? width / 2 : 0;
        return { x: xAlign, y: height / 2 + baseOffset };
      }
      case "bottom": {
        const xAlign =
          align === "start" ? -width / 2 : align === "end" ? width / 2 : 0;
        return { x: xAlign, y: -(height / 2 + baseOffset) };
      }
      case "left": {
        const yAlign =
          align === "start" ? height / 2 : align === "end" ? -height / 2 : 0;
        return { x: -(width / 2 + baseOffset), y: yAlign };
      }
      case "right": {
        const yAlign =
          align === "start" ? height / 2 : align === "end" ? -height / 2 : 0;
        return { x: width / 2 + baseOffset, y: yAlign };
      }
    }
  }

  // side === "inset"
  if (edge === null) {
    return { x: 0, y: 0 };
  }

  switch (edge) {
    case "top": {
      const xAlign =
        align === "start"
          ? -(width / 2 - baseOffset)
          : align === "end"
            ? width / 2 - baseOffset
            : 0;
      return { x: xAlign, y: height / 2 - baseOffset };
    }
    case "bottom": {
      const xAlign =
        align === "start"
          ? -(width / 2 - baseOffset)
          : align === "end"
            ? width / 2 - baseOffset
            : 0;
      return { x: xAlign, y: -(height / 2 - baseOffset) };
    }
    case "left": {
      const yAlign =
        align === "start"
          ? height / 2 - baseOffset
          : align === "end"
            ? -(height / 2 - baseOffset)
            : 0;
      return { x: -(width / 2 - baseOffset), y: yAlign };
    }
    case "right": {
      const yAlign =
        align === "start"
          ? height / 2 - baseOffset
          : align === "end"
            ? -(height / 2 - baseOffset)
            : 0;
      return { x: width / 2 - baseOffset, y: yAlign };
    }
    default:
      return { x: 0, y: 0 };
  }
};

/** Derive the SVG text-anchor from the label position. */
export const getLabelTextAnchor = (
  position: LabelPosition
): "start" | "middle" | "end" => {
  if (position === "center") return "middle";
  const { side, edge, align } = parseLabelPosition(position);

  const resolvedEdge = edge ?? (side === "inset" ? null : "top");

  // Horizontal edges (top/bottom): alignment is along x → maps directly to text-anchor
  if (
    resolvedEdge === "top" ||
    resolvedEdge === "bottom" ||
    resolvedEdge === null
  ) {
    if (align === "start") return "start";
    if (align === "end") return "end";
    return "middle";
  }

  // Vertical edges (left/right): text reads inward from the edge
  if (resolvedEdge === "left") return side === "inset" ? "start" : "end";
  if (resolvedEdge === "right") return side === "inset" ? "end" : "start";

  return "middle";
};

export const shouldShowLabel = (
  shape: ShapeInfo,
  labelText: string,
  position: LabelPosition,
  config: LabelConfig = {}
): boolean => {
  const minSpace = config.minSpace ?? 20;
  const isInset =
    position === "center" || (position as string).startsWith("inset");

  const area = shape.dimensions[0] * shape.dimensions[1];
  if (area < minSpace && !isInset) {
    return false;
  }

  if (isInset) {
    const [w, h] = shape.dimensions;
    const estimatedTextWidth = labelText.length * 8;
    const estimatedTextHeight = 12;

    if (position === "center") {
      // Centered — must fit in both dimensions
      return w > estimatedTextWidth + 10 && h > estimatedTextHeight + 5;
    }

    const { edge } = parseLabelPosition(position);

    // Edge-anchored inside labels: check the relevant dimension
    if (edge === "top" || edge === "bottom") {
      // Label sits at top/bottom interior — needs width to fit text, and enough height to not overlap center
      return w > estimatedTextWidth + 10 && h > estimatedTextHeight + 5;
    }
    if (edge === "left" || edge === "right") {
      // Label sits at left/right interior — needs height to fit text, and enough width
      return w > estimatedTextWidth + 10 && h > estimatedTextHeight + 5;
    }
  }

  return true;
};
