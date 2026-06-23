import { mix } from "spectral.js";
import { black, resolveColorChannel, white } from "../../color";
import {
  path,
  Path,
  pathToSVGPath,
  segment,
  subdividePath,
  transformPath,
} from "../../path";
import { GoFishNode } from "../_node";
import { GoFishAST } from "../_ast";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { linear } from "../coordinateTransforms/linear";
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
      render: (
        {
          intrinsicDims,
          transform,
          coordinateTransform,
        }: {
          intrinsicDims?: Dimensions;
          transform?: Transform;
          coordinateTransform?: CoordinateTransform;
        },
        _children,
        node: GoFishNode
      ) => {
        if (coordinateTransform === undefined) {
          return <></>;
        }
        if (coordinateTransform?.type !== "polar") {
          throw new Error(
            "Petal mark must be used in a polar coordinate transform"
          );
        }

        const space = coordinateTransform;

        // const isDataX = isValue(dims[0].size);
        // const isDataY = isValue(dims[1].size);
        const isXEmbedded = dims[0].embedded;
        const isYEmbedded = dims[1].embedded;

        // combine intrinsicDims with transform
        // center/max derived from min+size (shared helper)
        const displayDims = displayDimsOf(intrinsicDims, transform);

        // Resolve data-bound fill/stroke through the unit color scale, the same
        // way `rect` and `ellipse` do (e.g. `fill: "species"` → a categorical
        // color), then apply any post-scale color ops (`.lighten`/`.darken`).
        // A literal color string passes through unchanged.
        const scaleContext = node.getRenderSession().scaleContext;
        const unitScale = scaleContext?.unit;
        const resolvedFill = resolveColorChannel(fill, unitScale);
        const resolvedStroke =
          resolveColorChannel(stroke, unitScale) ?? resolvedFill;

        // Both dimensions are aesthetic - render as transformed point
        if (!isXEmbedded && !isYEmbedded) {
          const center: [number, number] = [
            (displayDims[0].min ?? 0) + (displayDims[0].size ?? 0) / 2,
            (displayDims[1].min ?? 0) + (displayDims[1].size ?? 0) / 2,
          ];
          const [transformedX, transformedY] = space.transform(center);
          const width = displayDims[0].size ?? 0;
          const height = displayDims[1].size ?? 0;

          return (
            <rect
              x={transformedX - width / 2}
              y={transformedY - height / 2}
              width={width}
              height={height}
              fill={resolvedFill}
              stroke={resolvedStroke ?? "black"}
              stroke-width={strokeWidth ?? 0}
            />
          );
        }

        // One dimension is data - render as line
        if (isXEmbedded !== isYEmbedded || (isXEmbedded && isYEmbedded)) {
          const dataAxis = isXEmbedded ? 0 : 1;
          const aestheticAxis = isXEmbedded ? 1 : 0;
          const thickness = displayDims[aestheticAxis].size ?? 0;

          // Calculate midpoint of aesthetic axis
          const aestheticMid =
            (displayDims[aestheticAxis].min ?? 0) +
            (displayDims[aestheticAxis].size ?? 0) / 2;

          // Create path along midline
          const linePath = path(
            [
              [
                isXEmbedded ? (displayDims[0].min ?? 0) : aestheticMid,
                isXEmbedded ? aestheticMid : (displayDims[1].min ?? 0),
              ],
              [
                isXEmbedded ? (displayDims[0].max ?? 0) : aestheticMid,
                isXEmbedded ? aestheticMid : (displayDims[1].max ?? 0),
              ],
            ],
            { subdivision: 1000 }
          );

          // Subdivide and transform path
          const transformed = transformPath(linePath, space);

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
          const m = [halfRadius + r / 2, 0];
          const c1 = [halfRadius + r / 4, s[1]];
          const c2 = [halfRadius + r / 4, e[1]];
          const svgPath =
            "M0,0L" +
            s[0] +
            "," +
            s[1] +
            "Q" +
            c1[0] +
            "," +
            c1[1] +
            " " +
            m[0] +
            "," +
            m[1] +
            "L" +
            m[0] +
            "," +
            m[1] +
            "Q" +
            c2[0] +
            "," +
            c2[1] +
            " " +
            e[0] +
            "," +
            e[1] +
            "Z";

          // 0.5 removes weird white space at least for some charts
          return (
            <path
              transform={`rotate(${((displayDims[0].center ?? 0) / Math.PI) * 180})`}
              d={svgPath}
              fill={resolvedFill}
            />
          );
        }

        // Both dimensions are data - render as area

        const corners = path(
          [
            [displayDims[0].min ?? 0, displayDims[1].min ?? 0],
            [displayDims[0].max ?? 0, displayDims[1].min ?? 0],
            [displayDims[0].max ?? 0, displayDims[1].max ?? 0],
            [displayDims[0].min ?? 0, displayDims[1].max ?? 0],
          ],
          { closed: true, subdivision: 1000 }
        );

        const transformed = transformPath(corners, space);

        return (
          <path
            d={pathToSVGPath(transformed)}
            fill={resolvedFill}
            stroke={resolvedStroke ?? "black"}
            stroke-width={strokeWidth ?? 0}
          />
        );
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
