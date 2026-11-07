/**
 * PROTOTYPE (#1331, petal-user-space branch only; not exported from lib.ts).
 *
 * `glyph({ w, h, d })`: an outline drawn in its own flat frame, which the
 * coord places, turns and sizes but never bends. The outline `d` (an SVG path
 * of M/L/Q/C/Z) lives in the unit box: u across the slot, v from the slot's
 * base out to its far side.
 *
 * The frame, read off the coord at the slot (any coord, no polar case):
 * - origin: the base point, the coord at (middle of the slot, inner side);
 * - v axis: from the base point to the coord at (middle, outer side);
 * - u axis: the slot's chord at its middle height, from the coord at
 *   (start, middle) to the coord at (end, middle).
 * A unit point (u, v) goes to base + (u - 0.5) * chord + v * axis. The map is
 * affine, so curves stay exact screen curves. With no coord the frame is the
 * slot box itself.
 */
import type { DisplayList } from "gofish-ir";
import { GoFishNode } from "../_node";
import { createMark } from "../withGoFish";
import { getValue, isValue, MaybeValue } from "../data";
import {
  displayDims,
  elaborateDims,
  deferAxisDims,
  type FancyDims,
} from "../dims";
import { pointOrMagnitude } from "../underlyingSpace";
import {
  lowerStyle,
  pathToPixelSVG,
  roleFor,
} from "../displayList/lowerHelpers";
import { resolveColorChannel } from "../../color";
import { MARK_CHANNELS } from "../markChannels.generated";
import { parseOutline, mapSegment } from "./polygon";
import type { Point } from "../../path";

export const Glyph = ({
  d,
  fill = "black",
  ...fancyDims
}: {
  d: string;
  fill?: MaybeValue<string>;
} & FancyDims<MaybeValue<number>>) => {
  const dims = elaborateDims(fancyDims);
  const outline = parseOutline(d);
  const node = new GoFishNode(
    {
      type: "glyph",
      args: { dims },
      color: fill,
      resolveUnderlyingSpace: () => [
        pointOrMagnitude(dims[0].min, dims[0].size),
        pointOrMagnitude(dims[1].min, dims[1].size),
      ],
      layout: (size: any, scales: any) => {
        const side = (i: 0 | 1) =>
          isValue(dims[i].size)
            ? getValue(dims[i].size!) * (scales?.[i]?.sigma ?? 1)
            : ((dims[i].size as number | undefined) ?? size[i]);
        return {
          intrinsicDims: [
            { min: 0, size: side(0) },
            { min: 0, size: side(1) },
          ],
          transform: {
            translate: [getValue(dims[0].min!), getValue(dims[1].min!)],
          },
        };
      },
      lower: (
        { intrinsicDims, transform, coordinateTransform, toPixel }: any,
        _children: any,
        node: any
      ): DisplayList.DisplayItem[] => {
        const box = displayDims(intrinsicDims, transform);
        const t0 = box[0].min ?? 0;
        const tw = box[0].size ?? 0;
        // The interior is y-down: interior y is the negated radius, so the
        // slot's inner side is at -(min + size) and its outer side at -min.
        const rh = box[1].size ?? 0;
        const r0 = -((box[1].min ?? 0) + rh);
        const f = (t: number, r: number): Point =>
          coordinateTransform && coordinateTransform.type !== "linear"
            ? (coordinateTransform.transform([t, -r]) as Point)
            : [t, -r];
        const tm = t0 + tw / 2;
        const rm = r0 + rh / 2;
        const base = f(tm, r0);
        const tip = f(tm, r0 + rh);
        const a = f(t0, rm);
        const b = f(t0 + tw, rm);
        const ax: Point = [tip[0] - base[0], tip[1] - base[1]];
        const ch: Point = [b[0] - a[0], b[1] - a[1]];
        const frame = ([u, v]: Point): Point => [
          base[0] + (u - 0.5) * ch[0] + v * ax[0],
          base[1] + (u - 0.5) * ch[1] + v * ax[1],
        ];
        const unitScale = node.getRenderSession().scaleContext?.unit;
        return [
          {
            kind: "path",
            d: pathToPixelSVG(
              outline.map((s) => mapSegment(s, frame)),
              toPixel
            ),
            role: roleFor(node.datum),
            datum: node.datum,
            style: lowerStyle({ fill: resolveColorChannel(fill, unitScale) }),
          },
        ];
      },
    } as any,
    []
  );
  (node as any)._elaborateInAxisScope = deferAxisDims(fancyDims, dims);
  return node;
};

/** PROTOTYPE (#1331): borrows petal's channels (w/h sizes, fill color). */
export const glyph = createMark(
  Glyph as any,
  { ...MARK_CHANNELS.petal } as any
) as any;
