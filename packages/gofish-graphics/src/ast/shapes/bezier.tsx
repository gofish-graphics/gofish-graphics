/**
 * `bezier` — PROTOTYPE mark (gun-deaths animation prototype, not exported
 * from `lib.ts`): one open cubic Bézier stroke whose four points are in DATA
 * coordinates, so they go through the axis scales the way a data-bound
 * `polygon` ring does (this file is `polygon.tsx`'s data-bound branch with
 * the closed ring swapped for one cubic).
 *
 *   bezier({ points: [p0, c1, c2, p3], stroke: "#f26c21" })
 *
 * PROTOTYPE SHORTCUT: no `line` / `polygon` spelling draws a Bézier from
 * explicit control points (`line` routes between operand marks, and
 * `Curve.bezier()` is the d3 link convention, with control points at the
 * midpoint). Whether this should be its own mark, a `path` mark taking
 * segments, or an option on `polygon` (open, cubic) is an open design
 * question; this is the smallest thing that draws the Periscopic arcs. No
 * descriptor, no Python wrapper, no wire form; literal points only; linear
 * coordinates only (no resampling under a curved coordinate space).
 */
import { GoFishNode } from "../_node";
import { boxOfDims } from "../geometry";
import type { GoFishAST } from "../_ast";
import type { Size } from "../dims";
import { CONTINUOUS, type UnderlyingSpace } from "../underlyingSpace";
import { createMark } from "../withGoFish";
import { posFn } from "../domain";
import { interval } from "../../util/interval";
import { curve, type Point } from "../../path";
import type { DisplayList } from "gofish-ir";
import { lowerStyle, pathToPixelSVG } from "../displayList/lowerHelpers";

export type BezierProps = {
  /** Start, first control point, second control point, end: data units. */
  points: [Point, Point, Point, Point];
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
};

const extent = (ps: Point[]) => ({
  minX: Math.min(...ps.map((p) => p[0])),
  maxX: Math.max(...ps.map((p) => p[0])),
  minY: Math.min(...ps.map((p) => p[1])),
  maxY: Math.max(...ps.map((p) => p[1])),
});

const Bezier = ({
  points,
  stroke = "black",
  strokeWidth = 1,
  opacity = 1,
}: BezierProps) => {
  if (points.length !== 4) {
    throw new Error(
      `bezier(): takes exactly 4 points (start, two controls, end), got ` +
        `${points.length}.`
    );
  }
  // The curve lies inside the hull of its control points, so their extent
  // bounds it (loosely: the box is the hull's, not the curve's).
  const { minX, maxX, minY, maxY } = extent(points);
  const localRef: { current: Point[] } = { current: points };
  return new GoFishNode(
    {
      type: "bezier",
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: GoFishAST[]
      ): Size<UnderlyingSpace> => [
        CONTINUOUS(interval(minX, maxX), "pinned"),
        CONTINUOUS(interval(minY, maxY), "pinned"),
      ],
      layout: (_shared, _size, scales) => {
        const mapX = posFn(scales?.[0]?.map) ?? ((d: number) => d);
        const mapY = posFn(scales?.[1]?.map) ?? ((d: number) => d);
        const mapped: Point[] = points.map(([x, y]) => [mapX(x), mapY(y)]);
        const e = extent(mapped);
        localRef.current = mapped.map(([x, y]) => [x - e.minX, y - e.minY]);
        return {
          intrinsicDims: [
            { min: 0, size: e.maxX - e.minX },
            { min: 0, size: e.maxY - e.minY },
          ],
          transform: { translate: [e.minX, e.minY] },
        };
      },
      lower: (
        { toPixel, local },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const [p0, c1, c2, p3] = localRef.current.map((p) => local(p));
        return [
          {
            kind: "path",
            d: pathToPixelSVG([curve(p0, c1, c2, p3)], toPixel),
            datum: node.datum,
            role: "node",
            style: lowerStyle({
              fill: "none",
              stroke,
              strokeWidth,
              opacity,
            }),
          },
        ];
      },
      geometry: ({ intrinsicDims }, _children, node) => ({
        box: boxOfDims(intrinsicDims, node.type),
      }),
    },
    []
  );
};

export const bezier = createMark(Bezier);
