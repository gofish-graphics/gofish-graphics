// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import { Show } from "solid-js";
import { path, pathToSVGPath, transformPath } from "../../path";
import { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import { elaborateDims, FancyDims, Interval, Size } from "../dims";
import * as IntervalLib from "../../util/interval";
import { black } from "../../color";
import {
  UnderlyingSpace,
  UNDEFINED,
  POSITION,
  ORDINAL,
  isORDINAL,
  isPOSITION,
} from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";
import { computeTransformedBoundingBox } from "./coordUtils";
import { empty, union } from "../../util/bbox";

export type CoordinateTransform = {
  type: string;
  transform: (point: [number, number]) => [number, number];
  // inferDomain: ({ width, height }: { width: number; height: number }) => Interval[];
  domain: [Interval, Interval];
};

/* TODO: implement this. I don't actually need it until I have more complex examples tho */
const flattenLayout = (
  node: GoFishAST,
  transform: [number, number] = [0, 0],
  scale: [number, number] = [1, 1]
): GoFishAST[] => {
  // recursive function
  // as we go down the tree we accumulate transforms
  // we apply the cumulative transform to all nodes we hit and remove their children
  //   this includes operators and marks
  // for now we return GoFishNodes, but we could return DisplayObjects
  // DisplayObjects are probably more principled b/c of how rendering them works... idk yet

  /* TODO: `connect` is a hack to get the operator to render in coordinate spaces
       A more principled way to do this would be to have "connect" produce a child path mark.  
  */
  if (
    !("children" in node) ||
    !node.children ||
    node.children.length === 0 ||
    node.type === "connect" ||
    node.type === "box"
  ) {
    node.transform = {
      translate: [
        (node.transform?.translate?.[0] ?? 0) + transform[0]!,
        (node.transform?.translate?.[1] ?? 0) + transform[1]!,
      ],
      scale: [
        (node.transform?.scale?.[0] ?? 1) * (scale[0] ?? 1),
        (node.transform?.scale?.[1] ?? 1) * (scale[1] ?? 1),
      ],
    };
    return [node];
  }

  const newTransform: [number, number] = [
    transform[0]! + (node.transform?.translate?.[0] ?? 0),
    transform[1]! + (node.transform?.translate?.[1] ?? 0),
  ];

  const newScale: [number, number] = [
    (node.transform?.scale?.[0] ?? 1) * (scale[0] ?? 1),
    (node.transform?.scale?.[1] ?? 1) * (scale[1] ?? 1),
  ];

  return node.children.flatMap((child) =>
    flattenLayout(child, newTransform, newScale)
  );
};

/* takes in a GoFishNode and converts it to some set of DisplayObjects
- layout: during layout, they flatten their child hierarchy completely, so it's easy to transform them (and
  also because coord doesn't care about graphical operators, only positions)
- rendering: then, during rendering, each mark applies its coordinate transform context. its behavior is
  influenced by its mark embedding "mode"
- DisplayObjects don't have children (inspired by tldraw a bit). also makes stuff like z-indexing
  easier later...
- TODO: we can actually mix DisplayObjects with GoFishNodes and Refs, which wil require some
  additional thought...

  For now we'll just assume that it's a GoFishNode tho... maybe it's a GoFishNode that contains DisplayObjects
  inside it?
*/
export const coord = createNodeOperator(
  (
    {
      key,
      name,
      transform: coordTransform,
      grid = false,
      ...fancyDims
    }: {
      key?: string;
      name?: string;
      transform: CoordinateTransform;
      grid?: boolean;
    } & FancyDims,
    children: GoFishAST[]
  ) => {
    const dims = elaborateDims(fancyDims);

    return new GoFishNode(
      {
        type: "coord",
        key,
        name,
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => {
          let xSpace = UNDEFINED;
          const xChildrenPositionSpaces = children.filter(
            (child) => child[0].kind === "position"
          );
          const xChildrenOrdinalSpaces = children.filter(
            (child) => child[0].kind === "ordinal"
          );

          if (
            xChildrenPositionSpaces.length > 0 &&
            xChildrenOrdinalSpaces.length === 0
          ) {
            const domain = IntervalLib.unionAll(
              ...xChildrenPositionSpaces
                .map((child) => child[0])
                .filter(isPOSITION)
                .map((space) => space.domain)
            );
            xSpace = POSITION(domain, coordTransform);
          } else if (xChildrenOrdinalSpaces.length > 0) {
            // Collect and merge domains from all child ordinal spaces
            const allKeys = new Set<string>();
            xChildrenOrdinalSpaces.forEach((child) => {
              const ordinalSpace = child[0];
              if (isORDINAL(ordinalSpace) && ordinalSpace.domain) {
                ordinalSpace.domain.forEach((key) => allKeys.add(key));
              }
            });
            xSpace = ORDINAL(Array.from(allKeys));
          }

          let ySpace = UNDEFINED;
          const yChildrenPositionSpaces = children.filter(
            (child) => child[1].kind === "position"
          );
          const yChildrenOrdinalSpaces = children.filter(
            (child) => child[1].kind === "ordinal"
          );

          if (
            yChildrenPositionSpaces.length > 0 &&
            yChildrenOrdinalSpaces.length === 0
          ) {
            const domain = IntervalLib.unionAll(
              ...yChildrenPositionSpaces
                .map((child) => child[1])
                .filter(isPOSITION)
                .map((space) => space.domain)
            );
            ySpace = POSITION(domain, coordTransform);
          } else if (yChildrenOrdinalSpaces.length > 0) {
            // Collect and merge domains from all child ordinal spaces
            const allKeys = new Set<string>();
            yChildrenOrdinalSpaces.forEach((child) => {
              const ordinalSpace = child[1];
              if (isORDINAL(ordinalSpace) && ordinalSpace.domain) {
                ordinalSpace.domain.forEach((key) => allKeys.add(key));
              }
            });
            ySpace = ORDINAL(Array.from(allKeys));
          }

          return [xSpace, ySpace];
        },
        layout: (shared, size, scaleFactors, children, posScales) => {
          /* TODO: need correct scale factors */
          // TODO: only works for polar2 right now
          size = [2 * Math.PI, Math.min(size[0], size[1]) / 2 - 30];
          const childPlaceables = children.map((child) =>
            child.layout(size, [1, 1], [undefined, undefined])
          );
          childPlaceables.forEach((c) => {
            c.place("x", 0, "baseline");
            c.place("y", 0, "baseline");
          });

          // Compute bounding box in screen space by transforming sample points
          // For each child placeable, compute its transformed bounding box and union them
          let screenBbox = empty();

          // Track coordinate-space bounding box (before transformation)
          let coordSpaceBbox: {
            thetaMin: number;
            thetaMax: number;
            rMin: number;
            rMax: number;
          } | null = null;

          childPlaceables.forEach((childPlaceable) => {
            const coordMinX = childPlaceable.dims[0].min!;
            const coordMaxX = childPlaceable.dims[0].max!;
            const coordMinY = childPlaceable.dims[1].min!;
            const coordMaxY = childPlaceable.dims[1].max!;

            // Track coordinate-space bounds (theta = X, radius = Y for polar/clock)
            if (coordSpaceBbox === null) {
              coordSpaceBbox = {
                thetaMin: coordMinX,
                thetaMax: coordMaxX,
                rMin: coordMinY,
                rMax: coordMaxY,
              };
            } else {
              coordSpaceBbox.thetaMin = Math.min(
                coordSpaceBbox.thetaMin,
                coordMinX
              );
              coordSpaceBbox.thetaMax = Math.max(
                coordSpaceBbox.thetaMax,
                coordMaxX
              );
              coordSpaceBbox.rMin = Math.min(coordSpaceBbox.rMin, coordMinY);
              coordSpaceBbox.rMax = Math.max(coordSpaceBbox.rMax, coordMaxY);
            }

            const transformedBbox = computeTransformedBoundingBox(
              coordMinX,
              coordMaxX,
              coordMinY,
              coordMaxY,
              coordTransform
            );

            screenBbox = union(screenBbox, transformedBbox);
          });

          const {
            minX: screenBboxMinX,
            maxX: screenBboxMaxX,
            minY: screenBboxMinY,
            maxY: screenBboxMaxY,
          } = screenBbox;

          // Return intrinsicDims in screen space, normalized to start at (0, 0) for parent layouts
          const intrinsicDims = {
            x: 0,
            y: 0,
            w: screenBboxMaxX - screenBboxMinX,
            h: screenBboxMaxY - screenBboxMinY,
          };

          // Translate to offset the negative values and position correctly
          const translateX =
            dims[0].min !== undefined
              ? coordTransform.transform([dims[0].min, dims[1].min ?? 0])[0] -
                screenBboxMinX
              : -screenBboxMinX;
          const translateY =
            dims[1].min !== undefined
              ? coordTransform.transform([dims[0].min ?? 0, dims[1].min])[1] -
                screenBboxMinY
              : -screenBboxMinY;

          return {
            intrinsicDims,
            transform: {
              translate: [translateX, translateY],
            },
            renderData: {
              coordinateSpaceBbox: coordSpaceBbox,
            },
          };
        },
        render: ({ transform }) => {
          const gridLines = () => {
            /* take an evenly space net of lines covering the space, map them through the space, and
          render the paths */
            // const domain = space.inferDomain({ width, height });
            const lines = [];
            const ticks = [];

            const domain = coordTransform.domain;

            for (
              let i = domain[0].min!;
              i <= domain[0].max!;
              i += domain[0].size! / 10
            ) {
              const line = transformPath(
                path(
                  [
                    [i, domain[1].min!],
                    [i, domain[1].max!],
                  ],
                  { subdivision: 100 }
                ),
                coordTransform
              );
              lines.push(
                <path d={pathToSVGPath(line)} stroke={black} fill="none" />
              );
              const [x, y] = coordTransform.transform([i, domain[1].max!]);
              ticks.push(
                <text x={x} y={y} /* dy="-1em" */ font-size="8pt" fill={black}>
                  {i.toFixed(0)}
                </text>
              );
            }
            for (
              let i = domain[1].min!;
              i <= domain[1].max!;
              i += domain[1].size! / 10
            ) {
              const line = transformPath(
                path(
                  [
                    [domain[0].min!, i],
                    [domain[0].max!, i],
                  ],
                  { subdivision: 100 }
                ),
                coordTransform
              );
              lines.push(
                <path d={pathToSVGPath(line)} stroke={black} fill="none" />
              );
              const [x, y] = coordTransform.transform([
                domain[0].max! + domain[0].size! / 20,
                i,
              ]);
              ticks.push(
                <text x={x} y={y} /* dy="-1em" */ font-size="8pt" fill={black}>
                  {i.toFixed(0)}
                </text>
              );
            }
            return (
              <g>
                {lines}
                {ticks}
              </g>
            );
          };

          const flattenedChildren = children.flatMap((child) =>
            flattenLayout(child)
          );

          return (
            <g
              transform={`translate(${transform?.translate?.[0] ?? 0}, ${transform?.translate?.[1] ?? 0})`}
            >
              {flattenedChildren.map((child) =>
                child.INTERNAL_render(coordTransform)
              )}
              <Show when={grid}>{gridLines()}</Show>
            </g>
          );
        },
      },
      children
    );
  }
);
