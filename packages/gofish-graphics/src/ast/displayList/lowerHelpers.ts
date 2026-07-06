// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// </gofish-wiki>

/**
 * Shared helpers for per-primitive `lower` bodies — the IR counterparts of the
 * small JSX-emitting snippets each shape's `render` uses. Keeping them here
 * means rect/ellipse/petal/connect/coord lower their warped paths identically.
 */

import type { DisplayList } from "gofish-ir";
import type { GoFishNode, ToPixel } from "../_node";
import type { CoordinateTransform } from "../coordinateTransforms/coord";
import { bakeChildren } from "../coordinateTransforms/bake";
import { displayTranslate, type Transform } from "../dims";
import { type Path, type Point, pathToSVGPath } from "../../path";

/**
 * The display-list `role` of a lowered item, derived from whether it is
 * data-bound. `role` is a *projection of datum-presence*: an item that carries a
 * `datum` is a data mark (`"node"` — a hit target); an item with no datum is
 * generated chrome / decoration (`"overlay"` — axes, legends, annotations,
 * value labels). Defining role this way keeps the two fields from ever
 * disagreeing, so a host can trust `role` alone to split data from chrome
 * without also inspecting `datum`. Shape `lower` bodies call this instead of
 * hard-coding `role: "node"`, which previously mis-tagged datum-less chrome.
 */
export const roleFor = (datum: unknown): DisplayList.DisplayItem["role"] =>
  datum !== undefined ? "node" : "overlay";

/** Map every point of a path through `toPixel`, then serialize to an SVG `d`.
 *  `toPixel` is affine (translate + y-flip), so no resampling is needed. */
export const pathToPixelSVG = (path: Path, toPixel: ToPixel): string =>
  pathToSVGPath(
    path.map((seg) =>
      seg.type === "line"
        ? {
            type: "line",
            points: [toPixel(seg.points[0]), toPixel(seg.points[1])] as [
              Point,
              Point,
            ],
          }
        : {
            type: "bezier",
            start: toPixel(seg.start),
            control1: toPixel(seg.control1),
            control2: toPixel(seg.control2),
            end: toPixel(seg.end),
          }
    )
  );

/** Map the two diagonal corners of an axis-aligned GoFish box through `toPixel`
 *  and return the flip-AGNOSTIC SVG rect: top-left = component-wise min, w/h =
 *  abs of the mapped span. Correct under any axis-aligned affine `toPixel` —
 *  y-down free space (top-left = `toPixel(c0)`) or the `yUp` chart scope (the
 *  flip makes `toPixel(c1)` the top-left) — so rect / image / compositor lower
 *  bodies share one box mapping (issue #143/#16). */
export const pixelBox = (
  c0: Point,
  c1: Point,
  toPixel: ToPixel
): { x: number; y: number; w: number; h: number } => {
  const [ax, ay] = toPixel(c0);
  const [bx, by] = toPixel(c1);
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  };
};

/** Build a `RectItem` from a GoFish box (min/max per axis) — see {@link pixelBox}. */
export const rectItemFromBox = (
  gxMin: number,
  gxMax: number,
  gyMin: number,
  gyMax: number,
  toPixel: ToPixel,
  extra: Partial<DisplayList.RectItem> = {}
): DisplayList.RectItem => ({
  kind: "rect",
  ...pixelBox([gxMin, gyMin], [gxMax, gyMax], toPixel),
  ...extra,
});

/** True when `toPixel` mirrors the y axis (pixel-y decreases as GoFish-y
 *  increases) — i.e. an active `yUp` chart scope. Lets orientation-dependent
 *  shapes (text rotation) pick the right sign by reading the flip out of
 *  `toPixel` rather than carrying a separate flag (issue #143/#16). */
export const toPixelFlipsY = (toPixel: ToPixel): boolean =>
  toPixel([0, 1])[1] < toPixel([0, 0])[1];

/** Assemble a `Style` from resolved presentation values, dropping undefined
 *  keys (and a zero/undefined stroke-width, which the legacy render omitted). */
export const lowerStyle = (vals: {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fillOpacity?: number;
  mixBlendMode?: string;
  strokeDasharray?: string;
  filter?: string;
}): DisplayList.Style => {
  const style: DisplayList.Style = {};
  if (vals.fill !== undefined) style.fill = vals.fill;
  if (vals.stroke !== undefined) style.stroke = vals.stroke;
  if (vals.strokeWidth !== undefined) style.strokeWidth = vals.strokeWidth;
  if (vals.opacity !== undefined) style.opacity = vals.opacity;
  if (vals.fillOpacity !== undefined) style.fillOpacity = vals.fillOpacity;
  if (vals.mixBlendMode !== undefined) style.mixBlendMode = vals.mixBlendMode;
  if (vals.strokeDasharray !== undefined)
    style.strokeDasharray = vals.strokeDasharray;
  if (vals.filter !== undefined) style.filter = vals.filter;
  return style;
};

/** The inline value-label a `rect`/`ellipse` emits when `label` is set: white,
 *  12px, centered at the mark's transformed center. Empty when no label. */
export const valueLabelItems = (
  labelText: string | undefined,
  cx: number,
  cy: number,
  toPixel: ToPixel
): DisplayList.TextItem[] => {
  if (!labelText) return [];
  const [x, y] = toPixel([cx, cy]);
  return [
    {
      kind: "text",
      x,
      y,
      text: labelText,
      fontSize: 12,
      textAnchor: "middle",
      dominantBaseline: "central",
      role: "overlay",
      style: { fill: "white" },
    },
  ];
};

/** Run `run` with the render session's `toPixel` swapped to `next`, restoring it
 *  afterward — the boundary-lowering primitive (a boundary maps its subtree into
 *  a shifted/warped pixel frame for the duration of the child walk). */
export const withToPixel = <T>(
  node: GoFishNode,
  next: ToPixel,
  run: () => T
): T => {
  const session = node.getRenderSession();
  const outer = session.toPixel!;
  session.toPixel = next;
  try {
    return run();
  } finally {
    session.toPixel = outer;
  }
};

/** Lower a translate-only boundary's children at BAKED ABSOLUTE coordinates,
 *  plus an optional extra `(dx, dy)` shift — the shared body of the simple
 *  translate-only boundaries (offset, enclose). #39 stage 6d: instead of
 *  composing the boundary's translate into a child-local `toPixel` closure, the
 *  subtree is flattened to absolute-transform display objects (seeded at the
 *  boundary's own absolute translate) and each is lowered at that transform —
 *  the same mechanism the root bake uses. */
export const lowerChildrenOffset = (
  node: GoFishNode,
  transform: Transform | undefined,
  coordinateTransform: CoordinateTransform | undefined,
  dx = 0,
  dy = 0
): DisplayList.DisplayItem[] => {
  const [tx, ty] = displayTranslate(transform);
  return bakeChildren(node, [tx + dx, ty + dy]).flatMap((d) =>
    d.node.INTERNAL_lower(coordinateTransform, d.transform)
  );
};
