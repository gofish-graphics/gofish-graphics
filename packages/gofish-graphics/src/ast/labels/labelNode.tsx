// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import { Frontend, type DisplayList } from "gofish-ir";
import { GoFishNode } from "../_node";
import { displayTranslate } from "../dims";
import { UNDEFINED } from "../underlyingSpace";
import { boxExtent } from "../extent";
import { lowerStyle, roleFor } from "../displayList/lowerHelpers";
import { estimateTextDimensions } from "../shapes/text";
import {
  ringPathData,
  turnPoint,
  turnedBox,
  turnedCorners,
} from "../geometry/plane";
import type { HalfSize } from "./collide";

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

/** The default of one field of a label's `halo` or `background`, as
 *  `Frontend.LABEL_OPTIONS` declares it. */
function chromeDefault<T>(option: "halo" | "background", field: string): T {
  const type = Frontend.LABEL_OPTIONS[option].type;
  if (type.kind !== "object")
    throw new Error(`[gofish] label option ${option} is not an object`);
  return type.fields[field].default as T;
}
const HALO = {
  color: chromeDefault<string>("halo", "color"),
  width: chromeDefault<number>("halo", "width"),
};
const BACKGROUND = {
  fill: chromeDefault<string>("background", "fill"),
  padding: chromeDefault<[number, number]>("background", "padding"),
};

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

/** A label node and the state a placement writes. */
export type LabelNode = {
  node: GoFishNode;
  state: LabelState;
  metrics: LabelMetrics;
  /** Half the width and height of the label's box (text and chrome) turned
   *  by `angle` degrees: the box a placement seats. */
  halfSize(angle: number): HalfSize;
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
  const haloPad = opts.halo ? (opts.halo.width ?? HALO.width) / 2 : 0;
  const bgPad: [number, number] =
    opts.background === undefined
      ? [0, 0]
      : typeof opts.background.padding === "number"
        ? [opts.background.padding, opts.background.padding]
        : (opts.background.padding ?? BACKGROUND.padding);
  const metrics: LabelMetrics = {
    w: dims.width,
    h: dims.height,
    ascent: dims.ascent,
    pad: [Math.max(haloPad, bgPad[0]), Math.max(haloPad, bgPad[1])],
  };
  const baseAngle = opts.rotate ?? 0;
  const state: LabelState = { angle: baseAngle, hidden: false };
  const halfSize = (angle: number): HalfSize => {
    const hx = metrics.w / 2 + metrics.pad[0];
    const hy = metrics.h / 2 + metrics.pad[1];
    const b = turnedBox({ minX: -hx, maxX: hx, minY: -hy, maxY: hy }, angle);
    return { hx: b.maxX, hy: b.maxY };
  };

  const node: GoFishNode = new GoFishNode(
    {
      type: "label",
      color: typeof opts.fill === "string" ? opts.fill : undefined,
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
      // A label has a size of its own, known before layout: its box at its
      // base angle, centered on its origin, as `layout` lays it out. So a
      // label a position string seats beside its mark takes room, as a
      // `Text` does (#493).
      resolveExtent: (_ce, _cs, spaces) => {
        const { hx, hy } = halfSize(baseAngle);
        return [boxExtent(spaces[0], hx, hx), boxExtent(spaces[1], hy, hy)];
      },
      layout: () => {
        state.angle = baseAngle;
        state.hidden = false;
        const { hx, hy } = halfSize(baseAngle);
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
        const { w, h, ascent, pad } = metrics;
        const items: DisplayList.DisplayItem[] = [];
        if (opts.background !== undefined) {
          const fill = opts.background.fill ?? BACKGROUND.fill;
          const bw = w / 2 + pad[0];
          const bh = h / 2 + pad[1];
          const style = lowerStyle({ fill });
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
              style,
            });
          else
            items.push({
              kind: "path",
              d: ringPathData(
                turnedCorners(
                  { minX: -bw, maxX: bw, minY: -bh, maxY: bh },
                  deg,
                  [cx, cy]
                )
              ),
              role: "overlay",
              style,
            });
        }
        // The glyph anchor: the start of the baseline.
        const [gx, gy] = turnPoint([-w / 2, -h / 2 + ascent], deg, [cx, cy]);
        const fill =
          typeof opts.fill === "string" ? opts.fill : opts.fill(self);
        const style = lowerStyle({
          fill,
          stroke:
            opts.halo === undefined
              ? undefined
              : (opts.halo.color ?? HALO.color),
          strokeWidth:
            opts.halo === undefined ? 0 : (opts.halo.width ?? HALO.width),
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
  return { node, state, metrics, halfSize };
}
