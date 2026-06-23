// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import { Show } from "solid-js";
import { ticks as d3Ticks, nice as d3Nice } from "d3-array";
import type { JSX } from "solid-js";
import { path, pathToSVGPath, transformPath } from "../../path";
import { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import {
  elaborateDims,
  FancyDims,
  Interval,
  Size,
  translateString,
} from "../dims";
import { flattenLayout } from "./bake";
import * as IntervalLib from "../../util/interval";
import { black } from "../../color";
import {
  UnderlyingSpace,
  UNDEFINED,
  POSITION,
  ORDINAL,
  isORDINAL,
  isPOSITION,
  isUNDEFINED,
  forgetAllMeasures,
  continuousInterval,
} from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";
import { computeTransformedBoundingBox } from "./coordUtils";
import { empty, union } from "../../util/bbox";
import type { AxesOptions } from "../gofish";

export type CoordinateTransform = {
  type: string;
  transform: (point: [number, number]) => [number, number];
  // inferDomain: ({ width, height }: { width: number; height: number }) => Interval[];
  domain: [Interval, Interval];
  /**
   * Axis-name aliases this space contributes to its scope (e.g. polar:
   * `{ x: "theta", y: "r" }`). Position aliases; size aliases are `<name>Size`.
   * Propagated by `coord` so marks/operators in scope can use them.
   */
  aliases?: { x?: string; y?: string };
  /**
   * Donut-hole radius as a fraction [0,1) of the outer radius (polar family).
   * Default 0 (filled disc). `coord.layout` insets the radial range by this.
   */
  innerRadius?: number;
};

export const coord = createNodeOperator(
  (
    {
      key,
      name,
      transform: coordTransform,
      grid = false,
      axes,
      padding = 30,
      ...fancyDims
    }: {
      key?: string;
      name?: string;
      transform: CoordinateTransform;
      grid?: boolean;
      axes?: AxesOptions;
      padding?: number;
    } & FancyDims,
    children: GoFishAST[]
  ) => {
    const dims = elaborateDims(fancyDims);
    const spaceRef: { current: Size<UnderlyingSpace> | null } = {
      current: null,
    };

    const coordNode = new GoFishNode(
      {
        type: "coord",
        key,
        name,
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => {
          let xSpace = UNDEFINED;
          const xChildrenPositionSpaces = children.filter((child) =>
            isPOSITION(child[0])
          );
          const xChildrenOrdinalSpaces = children.filter(
            (child) => child[0].kind === "ordinal"
          );

          if (
            xChildrenPositionSpaces.length > 0 &&
            xChildrenOrdinalSpaces.length === 0
          ) {
            const xPos = xChildrenPositionSpaces
              .map((child) => child[0])
              .filter(isPOSITION);
            const domain = IntervalLib.unionAll(
              ...xPos.map((s) => continuousInterval(s)!)
            );
            // A coord transform maps these data positions into its own fixed
            // coordinate space (e.g. angle/radius). Cross-unit unions are the
            // transform's business, not the marginal-style corruption the guard
            // targets, so forget on conflict rather than throwing.
            const xMeasure = forgetAllMeasures(xPos.map((s) => s.measure));
            xSpace = POSITION(domain, xMeasure, coordTransform);
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
          const yChildrenPositionSpaces = children.filter((child) =>
            isPOSITION(child[1])
          );
          const yChildrenOrdinalSpaces = children.filter(
            (child) => child[1].kind === "ordinal"
          );

          if (
            yChildrenPositionSpaces.length > 0 &&
            yChildrenOrdinalSpaces.length === 0
          ) {
            const yPos = yChildrenPositionSpaces
              .map((child) => child[1])
              .filter(isPOSITION);
            const domain = IntervalLib.unionAll(
              ...yPos.map((s) => continuousInterval(s)!)
            );
            // See the x branch: coord maps into its own coordinate space, so
            // forget on cross-unit conflict rather than throwing.
            const yMeasure = forgetAllMeasures(yPos.map((s) => s.measure));
            ySpace = POSITION(domain, yMeasure, coordTransform);
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

          const result: Size<UnderlyingSpace> = [xSpace, ySpace];
          spaceRef.current = result;
          return result;
        },
        layout: (shared, size, scaleFactors, children, posScales) => {
          /* TODO: need correct scale factors */
          // TODO: only works for polar-family transforms right now
          const [origW, origH] = size;
          // Angular budget = the transform's domain[0] size (CentralAngle), not a
          // hardcoded 2π. Radial budget = outer radius minus the inner-radius inset
          // (donut hole): children lay out in r ∈ [0, outerR − innerR] and are
          // shifted out by innerR at transform time (see `effectiveTransform`).
          const outerR = Math.min(origW, origH) / 2 - padding;
          const innerR = (coordTransform.innerRadius ?? 0) * outerR;
          const angularBudget = coordTransform.domain[0].size ?? 2 * Math.PI;
          size = [angularBudget, outerR - innerR];
          // The radius shift for the donut hole. At innerR=0 this is exactly
          // `coordTransform`, so the default disc is unchanged.
          const effectiveTransform: CoordinateTransform =
            innerR > 0
              ? {
                  ...coordTransform,
                  transform: ([theta, r]: [number, number]) =>
                    coordTransform.transform([theta, r + innerR]),
                }
              : coordTransform;
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
              effectiveTransform
            );

            screenBbox = union(screenBbox, transformedBbox);
          });

          const {
            minX: screenBboxMinX,
            maxX: screenBboxMaxX,
            minY: screenBboxMinY,
            maxY: screenBboxMaxY,
          } = screenBbox;

          // When axes are enabled and no placed min was allocated, the circle
          // must be centered in the full allocated space so labels aren't
          // clipped at the edges. Otherwise (a placed min exists, or there are
          // no axes — e.g. pie glyphs in scatter) use the tighter content-bbox
          // sizing so the glyph doesn't claim excess space.
          const hasAxes = !!axes;
          const useAllocated = dims[0].min === undefined && hasAxes;
          const intrinsicW = useAllocated
            ? origW
            : screenBboxMaxX - screenBboxMinX;
          const intrinsicH = useAllocated
            ? origH
            : screenBboxMaxY - screenBboxMinY;

          const half = Math.min(origW, origH) / 2;
          const translateX =
            dims[0].min !== undefined
              ? effectiveTransform.transform([
                  dims[0].min,
                  dims[1].min ?? 0,
                ])[0] - screenBboxMinX
              : hasAxes
                ? half
                : -screenBboxMinX;
          const translateY =
            dims[1].min !== undefined
              ? effectiveTransform.transform([
                  dims[0].min ?? 0,
                  dims[1].min,
                ])[1] - screenBboxMinY
              : hasAxes
                ? half
                : -screenBboxMinY;

          // coord's box is simply `[0, size]` on each axis — the region the
          // parent allocates (`finalW`/`finalH` read `size`) — with `max`/`center`
          // reported so consumers like the legend's `distribute` (reads the placed
          // `max`) and a `scatter` glyph (placed by its `center`) get real values.
          const intrinsicDims = {
            x: 0,
            y: 0,
            w: intrinsicW,
            h: intrinsicH,
            x2: intrinsicW,
            y2: intrinsicH,
            cx: intrinsicW / 2,
            cy: intrinsicH / 2,
          };

          // coord does NOT self-place. `translateX/Y` is a CONTENT OFFSET — where
          // to draw the coord origin within the box — not placement: the polar
          // content is drawn centered on the origin (spanning negative screen
          // coords), so it must be shifted to sit inside `[0, size]`. Carrying it
          // as `transform.translate` (as before) collided with the parent placing
          // the node: a `scatter` positioning a polar glyph had to OVERRIDE that
          // self-placed translate, the one case no other node creates. So emit it
          // as `renderData.contentOffset`, applied in render, and leave
          // `transform.translate` unplaced — the parent places coord like any node.
          return {
            intrinsicDims,
            transform: { translate: [undefined, undefined] },
            renderData: {
              coordinateSpaceBbox: coordSpaceBbox,
              contentOffset: [translateX, translateY] as [number, number],
              // Absolute donut-hole inset (px). render rebuilds the same radial
              // shift so display objects, grid and axis all sit past the hole.
              innerRadius: innerR,
            },
          };
        },
        render: ({ transform, renderData }, _children, node) => {
          // Rebuild the donut-hole radial shift layout computed (see
          // renderData.innerRadius) so display objects, grid and axis all sit
          // past the hole. At innerR=0 this is exactly `coordTransform`.
          const innerR = (renderData as any)?.innerRadius ?? 0;
          const effectiveTransform: CoordinateTransform =
            innerR > 0
              ? {
                  ...coordTransform,
                  transform: ([theta, r]: [number, number]) =>
                    coordTransform.transform([theta, r + innerR]),
                }
              : coordTransform;
          // Angular budget = the transform's domain[0] size (CentralAngle), so a
          // sub-2π sweep tiles the axis ticks correctly. Default 2π is unchanged.
          const angularBudget = coordTransform.domain[0].size ?? 2 * Math.PI;
          const gridLines = () => {
            /* take an evenly space net of lines covering the space, map them through the space, and
          render the paths */
            // const domain = space.inferDomain({ width, height });
            const lines = [];
            const ticks = [];

            const domain = effectiveTransform.domain;

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
                effectiveTransform
              );
              lines.push(
                <path d={pathToSVGPath(line)} stroke={black} fill="none" />
              );
              const [x, y] = effectiveTransform.transform([i, domain[1].max!]);
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
                effectiveTransform
              );
              lines.push(
                <path d={pathToSVGPath(line)} stroke={black} fill="none" />
              );
              const [x, y] = effectiveTransform.transform([
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

          const displayObjects = children.flatMap((child) =>
            flattenLayout(child)
          );

          const polarAxisJSX = (): JSX.Element | null => {
            if (!axes || !spaceRef.current) return null;
            // Start from the chart-level axes option, then let per-operator
            // axis: true/false overrides (collected in resolveAxes) take precedence.
            let axesX = typeof axes === "boolean" ? axes : (axes?.x ?? true);
            let axesY = typeof axes === "boolean" ? axes : (axes?.y ?? true);
            if ((node as any)._polarAxisX !== undefined)
              axesX = (node as any)._polarAxisX;
            if ((node as any)._polarAxisY !== undefined)
              axesY = (node as any)._polarAxisY;
            const [xSpace, ySpace] = spaceRef.current;
            const rContent =
              (renderData as any)?.coordinateSpaceBbox?.rMax ??
              effectiveTransform.domain[1].max ??
              100;
            const RING_GAP = 20;
            const rOuter = rContent + RING_GAP;
            const elements: JSX.Element[] = [];

            // Theta axis: outer ring + tick marks + labels.
            if (axesX && !isUNDEFINED(xSpace)) {
              // Outer ring
              elements.push(
                <circle
                  cx={0}
                  cy={0}
                  r={rOuter}
                  fill="none"
                  stroke="gray"
                  stroke-width="1"
                />
              );

              const xIv = continuousInterval(xSpace);
              if (isPOSITION(xSpace) && xIv) {
                // Continuous theta axis: regular count ticks around the ring.
                // Use a niced max so ticks evenly divide the circle — no small leftover gap.
                const xMin = xIv.min;
                const xMax = xIv.max;
                const [, nicedMax] = d3Nice(xMin, xMax, 8);
                const tickVals = d3Ticks(xMin, nicedMax, 8).filter(
                  (t) => t < nicedMax
                );
                for (const t of tickVals) {
                  const theta = (t / (nicedMax - xMin)) * angularBudget;
                  const [ix, iy] = effectiveTransform.transform([
                    theta,
                    rOuter,
                  ]);
                  const [ox, oy] = effectiveTransform.transform([
                    theta,
                    rOuter + 6,
                  ]);
                  elements.push(
                    <line
                      x1={ix}
                      y1={iy}
                      x2={ox}
                      y2={oy}
                      stroke="gray"
                      stroke-width="1"
                    />
                  );
                  const [lx, ly] = effectiveTransform.transform([
                    theta,
                    rOuter + 16,
                  ]);
                  const anchor = lx < -5 ? "end" : lx > 5 ? "start" : "middle";
                  elements.push(
                    <text
                      transform="scale(1,-1)"
                      x={lx}
                      y={-ly}
                      text-anchor={anchor}
                      dominant-baseline="middle"
                      font-size="10px"
                      fill="gray"
                    >
                      {t}
                    </text>
                  );
                }
              } else if (isORDINAL(xSpace) && xSpace.domain) {
                // Ordinal theta axis: evenly-spaced sector labels by index
                const keys = xSpace.domain;
                const n = keys.length;
                const sectorWidth = angularBudget / n;
                for (let i = 0; i < n; i++) {
                  const thetaStart = i * sectorWidth;
                  const thetaCenter = thetaStart + sectorWidth / 2;
                  const [ix, iy] = effectiveTransform.transform([
                    thetaStart,
                    rOuter,
                  ]);
                  const [ox, oy] = effectiveTransform.transform([
                    thetaStart,
                    rOuter + 6,
                  ]);
                  elements.push(
                    <line
                      x1={ix}
                      y1={iy}
                      x2={ox}
                      y2={oy}
                      stroke="gray"
                      stroke-width="1"
                    />
                  );
                  const [lx, ly] = effectiveTransform.transform([
                    thetaCenter,
                    rOuter + 16,
                  ]);
                  const anchor = lx < -5 ? "end" : lx > 5 ? "start" : "middle";
                  elements.push(
                    <text
                      transform="scale(1,-1)"
                      x={lx}
                      y={-ly}
                      text-anchor={anchor}
                      dominant-baseline="middle"
                      font-size="10px"
                      fill="gray"
                    >
                      {keys[i]}
                    </text>
                  );
                }
              }
            }

            // Continuous radial axis at theta=0.
            const yIv = continuousInterval(ySpace);
            if (axesY && isPOSITION(ySpace) && yIv) {
              const yMin = yIv.min;
              const yMax = yIv.max;
              const dataToScreenR = (v: number) =>
                yMax === yMin ? 0 : ((v - yMin) / (yMax - yMin)) * rContent;

              // Horizontal offset so the axis sits slightly left of center
              const H_GAP = 6;
              const tickVals = d3Ticks(yMin, yMax, 5);
              // Line runs from center (r=0) to the outer ring (rContent), past the tallest chunk
              const [x0, y0] = effectiveTransform.transform([
                0,
                dataToScreenR(yMin),
              ]);
              const [x1, y1] = effectiveTransform.transform([0, rContent]);
              elements.push(
                <line
                  x1={x0 - H_GAP}
                  y1={y0}
                  x2={x1 - H_GAP}
                  y2={y1}
                  stroke="gray"
                  stroke-width="1"
                />
              );
              for (const t of tickVals) {
                const [tx, ty] = effectiveTransform.transform([
                  0,
                  dataToScreenR(t),
                ]);
                elements.push(
                  <line
                    x1={tx - H_GAP - 4}
                    y1={ty}
                    x2={tx - H_GAP + 4}
                    y2={ty}
                    stroke="gray"
                    stroke-width="1"
                  />
                );
                elements.push(
                  <text
                    transform="scale(1,-1)"
                    x={tx - H_GAP - 6}
                    y={-ty}
                    text-anchor="end"
                    dominant-baseline="middle"
                    font-size="10px"
                    fill="gray"
                  >
                    {t}
                  </text>
                );
              }
            }

            return elements.length > 0 ? <g>{elements}</g> : null;
          };

          // Parent placement (`transform`) then coord's content offset (where the
          // coord origin sits inside the box — coord's own render concern, NOT
          // placement). The two compose to the single translate coord used to
          // self-place with, so it's pixel-equivalent — but now `transform` is the
          // parent's placement and the offset is separate, so coord no longer
          // collides with being placed.
          const [offsetX, offsetY] = (renderData?.contentOffset as
            | [number, number]
            | undefined) ?? [0, 0];
          return (
            <g
              transform={`${translateString(transform)} translate(${offsetX}, ${offsetY})`}
            >
              {displayObjects.map((d) =>
                d.node.INTERNAL_render(effectiveTransform, d.transform)
              )}
              <Show when={grid}>{gridLines()}</Show>
              {polarAxisJSX()}
            </g>
          );
        },
      },
      children
    );
    // Declare this space's axis aliases (e.g. polar `{ x: "theta", y: "r" }`) so
    // resolveAliases can rebind the alias scope for the coord's subtree.
    coordNode._aliases = coordTransform.aliases;
    return coordNode;
  }
);
