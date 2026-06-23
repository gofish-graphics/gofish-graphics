import { resolveColorChannel } from "../../color";
import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import type { DisplayList } from "gofish-ir";
import { lowerStyle, rectItemFromBox } from "../displayList/lowerHelpers";
import {
  getMeasure,
  getValue,
  inferEmbedded,
  isValue,
  MaybeValue,
  Value,
} from "../data";
import {
  Dimensions,
  displayDims as displayDimsOf,
  elaborateDims,
  extractAliasCandidates,
  FancyDims,
  FancySize,
  Size,
  Transform,
} from "../dims";
import { aesthetic, continuous, Domain } from "../domain";
import * as Monotonic from "../../util/monotonic";
import { POSITION, SIZE, UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { interval } from "../../util/interval";
import { createMark } from "../withGoFish";
/* Implementation inspired by https://web.archive.org/web/20220808041640/http://bl.ocks.org/herrstucki/6199768 */
/* TODO: what should default embedding behavior be when all values are aesthetic? */
export const Petal = ({
  name,
  fill = "black",
  stroke = fill,
  strokeWidth = 0,
  ...fancyDims
}: {
  name?: string;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
} & FancyDims<MaybeValue<number>>) => {
  const dims = elaborateDims(fancyDims).map(inferEmbedded);
  const node = new GoFishNode(
    {
      name,
      type: "petal",
      // Seed the unit color scale. Prefer whichever channel is data-driven, so
      // `fill: "species"` registers its category (like rect/ellipse do).
      color: isValue(fill) ? fill : stroke,
      // inferDomains: () => {
      //   return [
      //     isValue(dims[0].size)
      //       ? continuous({
      //           value: [0, getValue(dims[0].size)],
      //           dataType: getDataType(dims[0].size),
      //         })
      //       : dims[0].size
      //       ? aesthetic(dims[0].size)
      //       : undefined,
      //     isValue(dims[1].size)
      //       ? continuous({
      //           value: [0, getValue(dims[1].size)],
      //           dataType: getDataType(dims[1].size),
      //         })
      //       : dims[1].size
      //       ? aesthetic(dims[1].size)
      //       : undefined,
      //   ];
      // },
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: GoFishAST[]
      ) => {
        const sizeDomain = (axis: 0 | 1): Monotonic.Monotonic =>
          isValue(dims[axis].size)
            ? Monotonic.linear(getValue(dims[axis].size!), 0)
            : Monotonic.linear(0, dims[axis].size ?? 0);

        const resolveAxis = (axis: 0 | 1): UnderlyingSpace => {
          const d = dims[axis];
          if (isValue(d.min)) {
            const min = getValue(d.min) ?? 0;
            return POSITION(interval(min, min), getMeasure(d.min));
          }
          if (isValue(d.size)) {
            // data-driven size only — literals handled at layout time.
            return SIZE(sizeDomain(axis), getMeasure(d.size));
          }
          return UNDEFINED;
        };

        return [resolveAxis(0), resolveAxis(1)];
      },
      layout: (shared, size, scaleFactors, children) => {
        const w = isValue(dims[0].size)
          ? getValue(dims[0].size!) * scaleFactors[0]!
          : (dims[0].size ?? size[0]);
        const h = isValue(dims[1].size)
          ? getValue(dims[1].size!) * scaleFactors[1]!
          : (dims[1].size ?? size[1]);

        return {
          intrinsicDims: [
            {
              min: 0,
              size: w,
            },
            {
              min: 0,
              size: h,
            },
          ],
          transform: {
            /* TODO: handle the case where they are scaled... */
            translate: [getValue(dims[0].min!), getValue(dims[1].min!)],
          },
        };
      },
      // IR lowering — mirror of render. Petal is polar-only; `toPixel` is the
      // coord content map set by coord.lower. The both-aesthetic branch is a
      // point rect; otherwise the petal path is built from polar-transformed
      // points and rotated by its angular center (the legacy `rotate(deg)`),
      // baked into each point before `toPixel`.
      lower: (
        { intrinsicDims, transform, coordinateTransform, toPixel },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        if (!coordinateTransform || coordinateTransform.type !== "polar") {
          return [];
        }
        const space = coordinateTransform;
        const isXEmbedded = dims[0].embedded;
        const isYEmbedded = dims[1].embedded;
        const displayDims = displayDimsOf(intrinsicDims, transform);

        const unitScale = node.getRenderSession().scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill;

        // Both aesthetic — transformed point rect.
        if (!isXEmbedded && !isYEmbedded) {
          const w = displayDims[0].size ?? 0;
          const h = displayDims[1].size ?? 0;
          const [tX, tY] = space.transform([
            (displayDims[0].min ?? 0) + w / 2,
            (displayDims[1].min ?? 0) + h / 2,
          ]);
          return [
            rectItemFromBox(
              tX - w / 2,
              tX + w / 2,
              tY - h / 2,
              tY + h / 2,
              toPixel,
              {
                role: "node",
                datum: node.datum,
                style: lowerStyle({
                  fill: resolvedFill,
                  stroke: resolvedStroke ?? "black",
                  strokeWidth: strokeWidth ?? 0,
                }),
              }
            ),
          ];
        }

        // Petal shape — same points as render, rotated by the angular center
        // (radians) and mapped to pixels.
        const halfRadius = (displayDims[1].size ?? 0) / 2;
        const s = space.transform([
          -displayDims[0].size / 2 + Math.PI / 2,
          halfRadius,
        ]);
        const e = space.transform([
          displayDims[0].size / 2 + Math.PI / 2,
          halfRadius,
        ]);
        const r = displayDims[1].size ?? 0;
        const m: [number, number] = [halfRadius + r / 2, 0];
        const c1: [number, number] = [halfRadius + r / 4, s[1]];
        const c2: [number, number] = [halfRadius + r / 4, e[1]];

        const center = displayDims[0].center ?? 0; // radians
        const cos = Math.cos(center);
        const sin = Math.sin(center);
        const petalToPixel = ([x, y]: [number, number]): [number, number] =>
          toPixel([x * cos - y * sin, x * sin + y * cos]);
        const p = (pt: [number, number]) => petalToPixel(pt).join(",");

        const d =
          `M${p([0, 0])} L${p([s[0], s[1]])} Q${p(c1)} ${p(m)} ` +
          `L${p(m)} Q${p(c2)} ${p([e[0], e[1]])} Z`;

        return [
          {
            kind: "path",
            d,
            role: "node",
            datum: node.datum,
            style: lowerStyle({ fill: resolvedFill }),
          },
        ];
      },
    },
    []
  );
  // Stash alias-keyed dims (theta/r/…) for the resolveAliases pass.
  node._pendingAliases = extractAliasCandidates(fancyDims);
  return node;
};

export const petal = createMark(
  Petal,
  {
    w: "size",
    h: "size",
    fill: "color",
    stroke: "color",
  },
  "petal"
);
