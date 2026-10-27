// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import type { DisplayList } from "gofish-ir";
import { GoFishNode } from "../_node";
import { displayTranslate } from "../dims";
import { UNDEFINED } from "../underlyingSpace";
import { lowerStyle, roleFor } from "../displayList/lowerHelpers";
import { estimateTextDimensions } from "../shapes/text";

/**
 * What a placement step may change on a label after layout: the angle the
 * text is drawn at, and whether it is hidden. Reset by every layout.
 */
export type LabelState = {
  angle: number;
  hidden: boolean;
};

export type LabelNodeOptions = {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: number | string;
  fontStyle?: string;
  /** The text color, or a function that picks it when the label is lowered. */
  fill: string | ((node: GoFishNode) => string);
  /** A fixed rotation in degrees, clockwise on screen. */
  rotate?: number;
};

/** The label's measured text, in pixels. */
export type LabelMetrics = {
  /** Text width and height (ascent + descent). */
  w: number;
  h: number;
  ascent: number;
};

/** The axis-aligned half extents of a `2hx × 2hy` box rotated by `deg`. */
export const rotatedHalfExtents = (
  [hx, hy]: [number, number],
  deg: number
): [number, number] => {
  if (!deg) return [hx, hy];
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return [c * hx + s * hy, s * hx + c * hy];
};

/** A label node and the state a placement writes. */
export type LabelNode = {
  node: GoFishNode;
  state: LabelState;
  metrics: LabelMetrics;
};

/**
 * A label: text drawn as one mark, the node `.label()` elaborates into. Its
 * box is the text's box, rotated by its angle and centered on the node's
 * local origin, so it reads the same in either y direction.
 *
 * Unrotated, it draws exactly as a `Text` of the same font does: the glyphs
 * start at the box's left edge, on the baseline `ascent` below its top.
 * Rotated, the text turns about the box's center; the box is the rotated
 * text's bounding box, which is where a `Text` turned about its anchor sits
 * too, once its box is placed.
 */
export function LabelText(opts: LabelNodeOptions): LabelNode {
  const { text, fontSize, fontFamily, fontWeight, fontStyle } = opts;
  const dims = estimateTextDimensions(
    text,
    fontSize,
    fontFamily,
    fontStyle,
    fontWeight
  );
  const metrics: LabelMetrics = {
    w: dims.width,
    h: dims.height,
    ascent: dims.ascent,
  };
  const baseAngle = opts.rotate ?? 0;
  const state: LabelState = { angle: baseAngle, hidden: false };

  const node: GoFishNode = new GoFishNode(
    {
      type: "label",
      color: typeof opts.fill === "string" ? opts.fill : undefined,
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
      layout: () => {
        state.angle = baseAngle;
        state.hidden = false;
        const [hx, hy] = rotatedHalfExtents(
          [metrics.w / 2, metrics.h / 2],
          baseAngle
        );
        return {
          intrinsicDims: [
            { min: -hx, size: 2 * hx },
            { min: -hy, size: 2 * hy },
          ],
          transform: { translate: [undefined, undefined] },
        };
      },
      lower: ({ intrinsicDims, transform, toPixel }, _children, self) => {
        if (state.hidden) return [];
        const [tx, ty] = displayTranslate(transform);
        const x = intrinsicDims![0];
        const y = intrinsicDims![1];
        // The box's center, in pixels.
        const [cx, cy] = toPixel([
          tx + x.min! + x.size! / 2,
          ty + y.min! + y.size! / 2,
        ]);
        const deg = state.angle;
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        // A point given relative to the center of the unrotated text, in
        // pixels, turned by the label's angle.
        const at = (dx: number, dy: number): [number, number] =>
          deg
            ? [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
            : [cx + dx, cy + dy];
        const { w, h, ascent } = metrics;
        // The glyph anchor: the start of the baseline.
        const [gx, gy] = at(-w / 2, -h / 2 + ascent);
        const fill =
          typeof opts.fill === "string" ? opts.fill : opts.fill(self);
        const item: DisplayList.TextItem = {
          kind: "text",
          x: gx,
          y: gy,
          text,
          fontSize,
          fontFamily,
          fontStyle,
          fontWeight,
          textAnchor: "start",
          dominantBaseline: "auto",
          role: roleFor(self.datum),
          datum: self.datum,
          style: lowerStyle({ fill, strokeWidth: 0 }),
        };
        if (deg) item.rotate = deg;
        return [item];
      },
    },
    []
  );
  return { node, state, metrics };
}
