import { resolveColorChannel } from "../../color";
import { GoFishNode, outlineOverhang } from "../_node";
import { GoFishAST } from "../_ast";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  rectItemFromBox,
  roleFor,
} from "../displayList/lowerHelpers";
import { getValue, isValue, MaybeValue, Value } from "../data";
import {
  Dimensions,
  displayDims as displayDimsOf,
  elaborateDims,
  deferAxisDims,
  FancyDims,
  FancySize,
  Size,
  Transform,
} from "../dims";
import { aesthetic, continuous, Domain } from "../domain";
import { UnderlyingSpace, pointOrMagnitude } from "../underlyingSpace";
import { createMark } from "../withGoFish";
import { MARK_CHANNELS } from "../markChannels.generated";
/* Implementation inspired by https://web.archive.org/web/20220808041640/http://bl.ocks.org/herrstucki/6199768 */
/* TODO: what should default embedding behavior be when all values are aesthetic? */
export const Petal = ({
  fill = "black",
  stroke = fill,
  strokeWidth = 0,
  ...fancyDims
}: {
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
} & FancyDims<MaybeValue<number>>) => {
  // `embedded` is authored by the resolveEmbedding pass — see rect.tsx.
  const dims = elaborateDims(fancyDims);
  const node = new GoFishNode(
    {
      type: "petal",
      // Expose `dims` so resolveAliases / resolveEmbedding can author it in place
      // (same array the closures below capture). See rect.tsx / _node passes.
      args: { dims },
      // Seed the unit color scale. Prefer whichever channel is data-driven, so
      // `fill: "species"` registers its category (like rect/ellipse do).
      color: isValue(fill) ? fill : stroke,
      strokeOverhang: outlineOverhang(stroke, strokeWidth),
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
        return [
          pointOrMagnitude(dims[0].min, dims[0].size),
          pointOrMagnitude(dims[1].min, dims[1].size),
        ];
      },
      layout: (size, scales, children) => {
        const w = isValue(dims[0].size)
          ? getValue(dims[0].size!) * scales[0]?.sigma!
          : (dims[0].size ?? size[0]);
        const h = isValue(dims[1].size)
          ? getValue(dims[1].size!) * scales[1]?.sigma!
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
      // IR lowering. Petal is polar-family-only (`polar()` or `clock()`);
      // `toPixel` is the coord content map set by coord.lower and
      // `coordinateTransform` is the polar transform in pixels (`inPixels`: it
      // takes the interior's pixel y, the negated radius, and returns y-down
      // points). The both-aesthetic branch is a point rect; otherwise the
      // petal path is built pointing along +x and turned to the screen
      // direction of its angular center, baked into each point before
      // `toPixel`.
      lower: (
        { intrinsicDims, transform, coordinateTransform, toPixel },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        if (!coordinateTransform?.polar) return [];
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
                role: roleFor(node.datum),
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

        // Petal shape: built pointing along +x in y-down pixels, half its
        // angular width on each side, then turned to the screen direction of
        // its angular center and mapped to pixels.
        const halfRadius = (displayDims[1].size ?? 0) / 2;
        const halfAngle = (displayDims[0].size ?? 0) / 2;
        const s: [number, number] = [
          halfRadius * Math.cos(halfAngle),
          -halfRadius * Math.sin(halfAngle),
        ];
        const e: [number, number] = [
          halfRadius * Math.cos(halfAngle),
          halfRadius * Math.sin(halfAngle),
        ];
        const r = displayDims[1].size ?? 0;
        const m: [number, number] = [halfRadius + r / 2, 0];
        const c1: [number, number] = [halfRadius + r / 4, s[1]];
        const c2: [number, number] = [halfRadius + r / 4, e[1]];

        // The screen direction of θ = the angular center, read off the coord
        // so the preset's start angle and direction apply. `space` is in
        // y-down pixels, where radius r sits at pixel y = -r.
        const center = displayDims[0].center ?? 0;
        const [ox, oy] = space.transform([center, 0]);
        const [ux, uy] = space.transform([center, -1]);
        const cos = ux - ox;
        const sin = -(uy - oy);
        const petalToPixel = ([x, y]: [number, number]): [number, number] =>
          toPixel([x * cos + y * sin, -x * sin + y * cos]);
        const p = (pt: [number, number]) => petalToPixel(pt).join(",");

        const d =
          `M${p([0, 0])} L${p([s[0], s[1]])} Q${p(c1)} ${p(m)} ` +
          `L${p(m)} Q${p(c2)} ${p([e[0], e[1]])} Z`;

        return [
          {
            kind: "path",
            d,
            role: roleFor(node.datum),
            datum: node.datum,
            style: lowerStyle({ fill: resolvedFill }),
          },
        ];
      },
    },
    []
  );
  // Defer the axis-name-keyed `dims` option to the resolveAliases pass.
  node._elaborateInAxisScope = deferAxisDims(fancyDims, dims);
  return node;
};

export const petal = createMark(Petal, MARK_CHANNELS.petal, "petal");
