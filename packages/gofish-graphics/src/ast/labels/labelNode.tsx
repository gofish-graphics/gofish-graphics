// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import type { DisplayList } from "gofish-ir";
import { GoFishNode } from "../_node";
import { displayTranslate } from "../dims";
import { UNDEFINED } from "../underlyingSpace";
import { lowerStyle, roleFor } from "../displayList/lowerHelpers";
import { estimateTextDimensions } from "../shapes/text";

/** A text outline painted behind the glyphs (SVG `paint-order: stroke`),
 *  so a label stays legible over lines and fills. */
export type LabelHalo = {
  /** Default `"white"`. */
  color?: string;
  /** The outline's width in pixels. Default 3. */
  width?: number;
};

/** A filled box behind the text. */
export type LabelBackground = {
  /** Default `"white"`. */
  fill?: string;
  /** Pixels around the text: one number for both axes, or `[x, y]`.
   *  Default `[2, 1]`. */
  padding?: number | [number, number];
};

const DEFAULT_HALO_WIDTH = 3;
const DEFAULT_BACKGROUND_PADDING: [number, number] = [2, 1];

/**
 * What a placement step may change on a label after layout: the angle the
 * text is drawn at (a sloped label takes its path's), and whether it is
 * hidden (no free spot). Reset by every layout.
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
  /** The text color, or a function that picks it when the label is lowered
   *  (the auto color reads where the label landed). */
  fill: string | ((node: GoFishNode) => string);
  /** A fixed rotation in degrees, clockwise on screen. */
  rotate?: number;
  halo?: LabelHalo;
  background?: LabelBackground;
};

/** The label's measured text, and the room its chrome takes, in pixels. */
export type LabelMetrics = {
  /** Text width and height (ascent + descent). */
  w: number;
  h: number;
  ascent: number;
  /** Pixels the chrome adds on each side of the text, per axis. */
  pad: [number, number];
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
 * A label: text with optional chrome (a halo, a background box), drawn as
 * one mark, the node `.label()` elaborates into. Its box is the text's box
 * plus the chrome, rotated by its angle and centered on the node's local
 * origin, so it reads the same in either y direction. A placement step may
 * turn it to another angle after layout (`setExtent` then resizes its box)
 * or hide it.
 *
 * Unrotated and with no chrome, it draws exactly as a `Text` of the same
 * font does: the glyphs start at the box's left edge, on the baseline
 * `ascent` below its top. Rotated, the text turns about the box's center;
 * the box is the rotated text's bounding box, which is where a `Text` turned
 * about its anchor sits too, once its box is placed.
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
  const haloPad = opts.halo ? (opts.halo.width ?? DEFAULT_HALO_WIDTH) / 2 : 0;
  const bgPad: [number, number] =
    opts.background === undefined
      ? [0, 0]
      : typeof opts.background.padding === "number"
        ? [opts.background.padding, opts.background.padding]
        : (opts.background.padding ?? DEFAULT_BACKGROUND_PADDING);
  const metrics: LabelMetrics = {
    w: dims.width,
    h: dims.height,
    ascent: dims.ascent,
    pad: [Math.max(haloPad, bgPad[0]), Math.max(haloPad, bgPad[1])],
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
          [metrics.w / 2 + metrics.pad[0], metrics.h / 2 + metrics.pad[1]],
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
        const { w, h, ascent, pad } = metrics;
        const items: DisplayList.DisplayItem[] = [];
        if (opts.background !== undefined) {
          const fill = opts.background.fill ?? "white";
          const bw = w / 2 + pad[0];
          const bh = h / 2 + pad[1];
          if (!deg)
            items.push({
              kind: "rect",
              x: cx - bw,
              y: cy - bh,
              w: 2 * bw,
              h: 2 * bh,
              rx: 2,
              ry: 2,
              role: "overlay",
              style: lowerStyle({ fill }),
            });
          else
            items.push({
              kind: "path",
              d:
                "M" +
                [at(-bw, -bh), at(bw, -bh), at(bw, bh), at(-bw, bh)]
                  .map(([px, py]) => `${+px.toFixed(2)},${+py.toFixed(2)}`)
                  .join("L") +
                "Z",
              role: "overlay",
              style: lowerStyle({ fill }),
            });
        }
        // The glyph anchor: the start of the baseline.
        const [gx, gy] = at(-w / 2, -h / 2 + ascent);
        const fill =
          typeof opts.fill === "string" ? opts.fill : opts.fill(self);
        const style = lowerStyle({
          fill,
          stroke:
            opts.halo === undefined ? undefined : (opts.halo.color ?? "white"),
          strokeWidth:
            opts.halo === undefined
              ? 0
              : (opts.halo.width ?? DEFAULT_HALO_WIDTH),
        });
        if (opts.halo !== undefined) {
          style.paintOrder = "stroke";
          style.strokeLinejoin = "round";
        }
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
          style,
        };
        if (deg) item.rotate = deg;
        items.push(item);
        return items;
      },
    },
    []
  );
  return { node, state, metrics };
}
