// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import { ticks as d3Ticks, nice as d3Nice } from "d3-array";
import { path, transformPath } from "../../path";
import { GoFishAST } from "../_ast";
import { GoFishNode, type ToPixel } from "../_node";
import type { DisplayList } from "gofish-ir";
import { lowerStyle, pathToPixelSVG } from "../displayList/lowerHelpers";
import {
  displayTranslate,
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
        // IR lowering — mirror of render. Everything lives under the coord's
        // `translate(transform) translate(contentOffset)` group, so a single
        // `contentToPixel` folds that offset + the root flip. Content children
        // warp through `coordTransform` in their own `lower` (rect/ellipse/petal
        // emit paths); the grid + polar axes port the same overlay primitives.
        lower: ({ transform, renderData }, _children, node) => {
          const session = node.getRenderSession();
          const outer = session.toPixel!;
          const [coordTx, coordTy] = displayTranslate(transform);
          const [offsetX, offsetY] = (renderData?.contentOffset as
            | [number, number]
            | undefined) ?? [0, 0];
          const contentToPixel: ToPixel = ([cx, cy]) =>
            outer([coordTx + offsetX + cx, coordTy + offsetY + cy]);

          // Donut-hole radial shift (renderData.innerRadius) so content, grid,
          // and axis all sit past the hole; at innerR=0 this is coordTransform.
          // Angular budget = the transform's CentralAngle (domain[0].size) so a
          // sub-2π sweep tiles ticks correctly. Mirrors the render.
          const innerR =
            (renderData as { innerRadius?: number })?.innerRadius ?? 0;
          const effectiveTransform: CoordinateTransform =
            innerR > 0
              ? {
                  ...coordTransform,
                  transform: ([theta, r]: [number, number]) =>
                    coordTransform.transform([theta, r + innerR]),
                }
              : coordTransform;
          const angularBudget = coordTransform.domain[0].size ?? 2 * Math.PI;

          // Overlay primitive helpers (all in coord-local y-up coords).
          const lineItem = (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            stroke: string,
            sw: number
          ): DisplayList.PathItem => ({
            kind: "path",
            d: `M${contentToPixel([x1, y1]).join(",")} L${contentToPixel([x2, y2]).join(",")}`,
            role: "overlay",
            style: lowerStyle({ fill: "none", stroke, strokeWidth: sw }),
          });
          // Axis labels: legacy emits `transform="scale(1,-1)" x y=-y`, so the
          // anchor point is (x, y) in y-up — upright under contentToPixel.
          const textItem = (
            x: number,
            y: number,
            text: string,
            anchor: DisplayList.TextItem["textAnchor"],
            baseline: DisplayList.TextItem["dominantBaseline"],
            fontSize: number,
            fill: string
          ): DisplayList.TextItem => {
            const [px, py] = contentToPixel([x, y]);
            return {
              kind: "text",
              x: px,
              y: py,
              text,
              textAnchor: anchor,
              dominantBaseline: baseline,
              fontSize,
              role: "overlay",
              style: lowerStyle({ fill }),
            };
          };

          const items: DisplayList.DisplayItem[] = [];

          // Content: warp each flattened child through the coord transform.
          session.toPixel = contentToPixel;
          try {
            for (const child of children) {
              for (const d of flattenLayout(child)) {
                items.push(
                  ...d.node.INTERNAL_lower(effectiveTransform, d.transform)
                );
              }
            }
          } finally {
            session.toPixel = outer;
          }

          // Grid lines (rare; grid defaults off). Lines port faithfully; the
          // grid tick text uses pt sizing and no flip in the legacy path — a
          // latent corner reproduced approximately here.
          if (grid) {
            const domain = effectiveTransform.domain;
            const gridPath = (a: [number, number], b: [number, number]) =>
              pathToPixelSVG(
                transformPath(
                  path([a, b], { subdivision: 100 }),
                  effectiveTransform
                ),
                contentToPixel
              );
            for (
              let i = domain[0].min!;
              i <= domain[0].max!;
              i += domain[0].size! / 10
            ) {
              items.push({
                kind: "path",
                d: gridPath([i, domain[1].min!], [i, domain[1].max!]),
                role: "overlay",
                style: lowerStyle({ fill: "none", stroke: black }),
              });
              const [gx, gy] = effectiveTransform.transform([
                i,
                domain[1].max!,
              ]);
              const [px, py] = contentToPixel([gx, gy]);
              items.push({
                kind: "text",
                x: px,
                y: py,
                text: i.toFixed(0),
                fontSize: 8 * (96 / 72),
                role: "overlay",
                style: lowerStyle({ fill: black }),
              });
            }
            for (
              let i = domain[1].min!;
              i <= domain[1].max!;
              i += domain[1].size! / 10
            ) {
              items.push({
                kind: "path",
                d: gridPath([domain[0].min!, i], [domain[0].max!, i]),
                role: "overlay",
                style: lowerStyle({ fill: "none", stroke: black }),
              });
              const [gx, gy] = effectiveTransform.transform([
                domain[0].max! + domain[0].size! / 20,
                i,
              ]);
              const [px, py] = contentToPixel([gx, gy]);
              items.push({
                kind: "text",
                x: px,
                y: py,
                text: i.toFixed(0),
                fontSize: 8 * (96 / 72),
                role: "overlay",
                style: lowerStyle({ fill: black }),
              });
            }
          }

          // Polar axes — port of polarAxisJSX.
          if (axes && spaceRef.current) {
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

            if (axesX && !isUNDEFINED(xSpace)) {
              // Outer ring.
              const [ringCx, ringCy] = contentToPixel([0, 0]);
              items.push({
                kind: "ellipse",
                cx: ringCx,
                cy: ringCy,
                rx: rOuter,
                ry: rOuter,
                role: "overlay",
                style: lowerStyle({
                  fill: "none",
                  stroke: "gray",
                  strokeWidth: 1,
                }),
              });

              const xIv = continuousInterval(xSpace);
              const tickRing = (theta: number, label: string) => {
                const [ix, iy] = effectiveTransform.transform([theta, rOuter]);
                const [ox, oy] = effectiveTransform.transform([
                  theta,
                  rOuter + 6,
                ]);
                items.push(lineItem(ix, iy, ox, oy, "gray", 1));
                const [lx, ly] = effectiveTransform.transform([
                  theta,
                  rOuter + 16,
                ]);
                const anchor = lx < -5 ? "end" : lx > 5 ? "start" : "middle";
                items.push(
                  textItem(lx, ly, label, anchor, "middle", 10, "gray")
                );
              };
              if (isPOSITION(xSpace) && xIv) {
                const xMin = xIv.min;
                const xMax = xIv.max;
                const [, nicedMax] = d3Nice(xMin, xMax, 8);
                const tickVals = d3Ticks(xMin, nicedMax, 8).filter(
                  (t) => t < nicedMax
                );
                for (const t of tickVals)
                  tickRing((t / (nicedMax - xMin)) * angularBudget, String(t));
              } else if (isORDINAL(xSpace) && xSpace.domain) {
                const keys = xSpace.domain;
                const n = keys.length;
                const sectorWidth = angularBudget / n;
                for (let i = 0; i < n; i++) {
                  const thetaStart = i * sectorWidth;
                  const [ix, iy] = effectiveTransform.transform([
                    thetaStart,
                    rOuter,
                  ]);
                  const [ox, oy] = effectiveTransform.transform([
                    thetaStart,
                    rOuter + 6,
                  ]);
                  items.push(lineItem(ix, iy, ox, oy, "gray", 1));
                  const [lx, ly] = effectiveTransform.transform([
                    thetaStart + sectorWidth / 2,
                    rOuter + 16,
                  ]);
                  const anchor = lx < -5 ? "end" : lx > 5 ? "start" : "middle";
                  items.push(
                    textItem(
                      lx,
                      ly,
                      String(keys[i]),
                      anchor,
                      "middle",
                      10,
                      "gray"
                    )
                  );
                }
              }
            }

            const yIv = continuousInterval(ySpace);
            if (axesY && isPOSITION(ySpace) && yIv) {
              const yMin = yIv.min;
              const yMax = yIv.max;
              const dataToScreenR = (v: number) =>
                yMax === yMin ? 0 : ((v - yMin) / (yMax - yMin)) * rContent;
              const H_GAP = 6;
              const tickVals = d3Ticks(yMin, yMax, 5);
              const [x0, y0] = effectiveTransform.transform([
                0,
                dataToScreenR(yMin),
              ]);
              const [x1, y1] = effectiveTransform.transform([0, rContent]);
              items.push(lineItem(x0 - H_GAP, y0, x1 - H_GAP, y1, "gray", 1));
              for (const t of tickVals) {
                const [tx, ty] = effectiveTransform.transform([
                  0,
                  dataToScreenR(t),
                ]);
                items.push(
                  lineItem(tx - H_GAP - 4, ty, tx - H_GAP + 4, ty, "gray", 1)
                );
                items.push(
                  textItem(
                    tx - H_GAP - 6,
                    ty,
                    String(t),
                    "end",
                    "middle",
                    10,
                    "gray"
                  )
                );
              }
            }
          }

          return items;
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
