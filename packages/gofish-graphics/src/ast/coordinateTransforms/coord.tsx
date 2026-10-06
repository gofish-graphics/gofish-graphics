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
  deferAxisDims,
  FancyDims,
  Interval,
  Size,
} from "../dims";
import { flattenLayout } from "./bake";
import { orderChildrenForPaint } from "../paintOrder";
import * as IntervalLib from "../../util/interval";
import { computeSize } from "../../util";
import { black } from "../../color";
import {
  UnderlyingSpace,
  UNDEFINED,
  isCONTINUOUS,
  isORDINAL,
  isUNDEFINED,
  continuousInterval,
  CONTINUOUS,
  spaceMeasure,
} from "../underlyingSpace";
import { impliedExtent } from "../extent";
import {
  unionChildExtents,
  unionChildSpaces,
} from "../graphicalOperators/alignment";
import { axisScale, type AxisMap } from "../domain";
import { reflectInterval } from "../axisDirection";
import { shadowCheckScaleRoot } from "../solver/shadow";
import { getScopeRegistry, scopeFrame, seatInScope } from "../solver/scopes";
import { axisTitle, TITLE_COLOR, TITLE_FONT_SIZE } from "../axes/elaborate";
import { createNodeOperator } from "../withGoFish";
import { computeTransformedBoundingBox } from "./coordUtils";
import { empty, union } from "../../util/bbox";
import type { AxesOptions } from "../gofish";

/**
 * A coordinate space. Its `transform` is MATH-HANDED: it maps a point of the
 * coordinate space, whose y runs upward, to a point of the plane, whose y
 * also runs upward (polar's θ is measured counter-clockwise from 3 o'clock,
 * geo's north is up). The `coord` node is where that meets the canvas: it
 * gives its interior the coordinate space's upward y as its axis order (see
 * `axisDirection.ts`), and reflects y on the way in and out (`inPixels`) so
 * the warped geometry lands in y-down pixels.
 */
export type CoordinateTransform = {
  type: string;
  transform: (point: [number, number]) => [number, number];
  // inferDomain: ({ width, height }: { width: number; height: number }) => Interval[];
  domain: [Interval, Interval];
  /**
   * Axis names this space declares for its subtree (e.g. polar:
   * `{ x: "theta", y: "r" }`, geo: `{ x: "lon", y: "lat" }`), on top of the
   * `x`/`y` every space has. The only source of the names a mark's `dims`
   * option and an operator's `dir` may use inside this space.
   */
  aliases?: { x?: string; y?: string };
  /**
   * Donut-hole radius as a fraction [0,1) of the outer radius (polar family).
   * Default 0 (filled disc). `coord.layout` insets the radial range by this.
   */
  innerRadius?: number;
  /**
   * A data window this space imposes on an axis, replacing the union of its
   * children's POSITION domains (e.g. `geo`'s explicit lon/lat box). `null`
   * leaves that axis to the children.
   */
  dataWindow?: [IntervalLib.Interval | null, IntervalLib.Interval | null];
  /**
   * How the space turns its pixel allocation into the coordinate budget its
   * children lay out in. Absent ⇒ the polar-family rule: an angular budget
   * (`domain[0].size`) by a radial budget (half the shorter side, less padding
   * and the donut hole).
   *
   * A space whose coordinate units ARE its data units (`geo`: degrees)
   * implements this instead. It is handed the resolved data window and returns
   * the budget in those units plus the transform that maps the budget onto the
   * pixel box — which is what makes the children's position scale the identity
   * in data units, with no nicing, zero inclusion or padding, since the domain
   * and the range then have the same width by construction.
   */
  fit?: (args: {
    size: [number, number];
    padding: number;
    window: [IntervalLib.Interval, IntervalLib.Interval];
  }) => {
    budget: [number, number];
    transform: (point: [number, number]) => [number, number];
    /**
     * The window's extent in PIXELS under `transform` — the very measurement
     * `fit` already had to take to compute its scale factor, handed back so the
     * framed screen bbox below is the same box the fit was computed against.
     * Measuring it a second time out here would not give the same answer: a
     * projection's extremum can sit strictly inside the window (Equal Earth is
     * widest at the equator), which the boundary-only sampler misses, so the
     * centering would be computed against a box smaller than what is drawn.
     */
    extent: { width: number; height: number };
  };
};

/** The two axes, for the loops that walk both. */
const AXES = [0, 1] as const;

/**
 * A math-handed transform as the coord's interior lowers through it: the
 * interior stores its geometry in y-down pixels (y = −coordinate y), and the
 * plane point comes back in y-down pixels too. The one place a coordinate
 * space's handedness meets the canvas's.
 */
export const inPixels = (t: CoordinateTransform): CoordinateTransform => ({
  ...t,
  transform: ([x, y]) => {
    const [px, py] = t.transform([x, -y]);
    return [px, -py];
  },
});

export const coord = createNodeOperator(
  (
    {
      key,
      transform: coordTransform,
      grid = false,
      axes,
      padding = 30,
      ...fancyDims
    }: {
      key?: string;
      transform: CoordinateTransform;
      grid?: boolean;
      axes?: AxesOptions;
      padding?: number;
    } & FancyDims,
    children: GoFishAST[]
  ) => {
    const dims = elaborateDims(fancyDims);
    // THE discriminator: does this space frame its own window? A `fit`-ted space
    // (geo) lays out in a data window, so its budget IS the frame — which decides
    // the budget rule, the box, the culling frame and whether the polar overlays
    // apply. One test, so those four cannot drift apart. (`coordTransform.fit` is
    // re-tested where the call needs the narrowing.)
    const framesOwnWindow = coordTransform.fit !== undefined;
    const spaceRef: { current: Size<UnderlyingSpace> | null } = {
      current: null,
    };
    // The transform as `layout` resolved it — the donut-hole radial shift, or a
    // `fit`-ted space's budget-to-pixels map. `lower` must warp content through
    // exactly the transform the layout measured against, so it is stashed here
    // rather than rebuilt from `renderData` (the fitted map is a closure, not
    // data). Defaults to the declared transform until layout runs.
    const transformRef: { current: CoordinateTransform } = {
      current: coordTransform,
    };
    // The coordinate budget `layout` handed the children, for a FRAMED space
    // (one that declares its own window — see `cull` in `lower`). Null for the
    // polar family, whose budget is the content, not a frame.
    const frameRef: { current: [number, number] | null } = { current: null };

    const coordNode = new GoFishNode(
      {
        type: "coord",
        key,
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => {
          // A space may DECLARE its own data window per axis (geo's lon/lat
          // box), in which case it replaces the children's union — the window
          // is the frame the user asked for, not a summary of what is in it.
          const declared = coordTransform.dataWindow;

          // Per axis, the coord's fold is the overlay fold every layer uses
          // (`unionChildSpaces`), carrying this coord's transform, with one
          // rule of its own: a declared window pins a continuous axis to that
          // window, keeping the children's measure.
          const axisSpace = (axis: 0 | 1): UnderlyingSpace => {
            const union = unionChildSpaces(children, axis);
            if (!isCONTINUOUS(union)) return union;
            const window = declared?.[axis];
            return window
              ? CONTINUOUS(window, "pinned", union.measure, coordTransform)
              : { ...union, coordinateTransform: coordTransform };
          };
          // The coord roots its own σ-scope on both axes, resolved against
          // the budget it is given (`layout`): its children's data lives in
          // the coordinate space, not in its parent's. Like every σ-scope
          // root it keeps its type for its own scope (its axes and their
          // titles are drawn here, in `lower`) and reports nothing upward:
          // to its parent it is a pixel box.
          spaceRef.current = [axisSpace(0), axisSpace(1)];
          return [UNDEFINED, UNDEFINED];
        },
        layout: (shared, size, scales, children, node) => {
          // Stage 6b: a coord boundary is a σ-scope root — it re-roots σ for its
          // subtree. Derive through the render's one registry, shared with the
          // render root and every layer scope.
          const scopes = getScopeRegistry(node.tryGetRenderSession());
          /* TODO: need correct scale factors */
          // TODO: only works for polar-family transforms right now
          // An explicit `w`/`h` is the coord's box, as it is a layer's (#535).
          size = [
            computeSize(dims[0].size, scales?.[0]?.sigma ?? 1, size[0]) ??
              size[0],
            computeSize(dims[1].size, scales?.[1]?.sigma ?? 1, size[1]) ??
              size[1],
          ];
          const [origW, origH] = size;
          // The coordinate budget children lay out in, and the transform that
          // maps it to pixels. Two rules, chosen by whether the space supplies
          // its own `fit`:
          //
          //  - polar family (no `fit`): an angular budget — the transform's
          //    domain[0] size (CentralAngle) — by a radial budget of the outer
          //    radius less the inner-radius inset (donut hole). Children lay out
          //    in r ∈ [0, outerR − innerR] and are shifted out by innerR at
          //    transform time.
          //  - a `fit`-ted space (geo): the budget is in DATA units, so the
          //    space is handed its resolved data window and returns both the
          //    budget and the map from it onto the pixel box.
          let budget: [number, number];
          let effectiveTransform: CoordinateTransform;
          /** A fitted space's own measurement of its window in pixels — the box
           *  the framed screen bbox below IS (see `fit`'s `extent`). */
          let fittedExtent: { width: number; height: number } | undefined;
          // `framesOwnWindow`, re-tested so TS narrows `fit` for the call below.
          if (coordTransform.fit) {
            const windowOf = (axis: 0 | 1): IntervalLib.Interval => {
              const resolved = spaceRef.current?.[axis];
              const declared = coordTransform.dataWindow?.[axis];
              const iv =
                declared ??
                (resolved !== undefined
                  ? continuousInterval(resolved)
                  : undefined);
              if (iv === undefined || iv.max === iv.min) {
                throw new Error(
                  `[gofish] the "${coordTransform.type}" coordinate space has no ` +
                    `data window on ${axis === 0 ? "x" : "y"}: nothing in scope ` +
                    `carries a position there, and none was declared.`
                );
              }
              return iv;
            };
            const fitted = coordTransform.fit({
              size: [origW, origH],
              padding,
              window: [windowOf(0), windowOf(1)],
            });
            budget = fitted.budget;
            fittedExtent = fitted.extent;
            effectiveTransform = {
              ...coordTransform,
              transform: fitted.transform,
            };
          } else {
            const outerR = Math.min(origW, origH) / 2 - padding;
            const innerR = (coordTransform.innerRadius ?? 0) * outerR;
            budget = [
              coordTransform.domain[0].size ?? 2 * Math.PI,
              outerR - innerR,
            ];
            // The radius shift for the donut hole. At innerR=0 this is exactly
            // `coordTransform`, so the default disc is unchanged.
            effectiveTransform =
              innerR > 0
                ? {
                    ...coordTransform,
                    transform: ([theta, r]: [number, number]) =>
                      coordTransform.transform([theta, r + innerR]),
                  }
                : coordTransform;
          }
          transformRef.current = effectiveTransform;
          // `fit` is THE discriminator for "this space frames its own window"
          // (see `frameRef`): a fitted space's budget IS the frame, the polar
          // family's budget is its content. `dataWindow` is only the carrier of
          // a DECLARED window — its presence says nothing about framing.
          frameRef.current = framesOwnWindow ? budget : null;
          size = budget;
          // Fit the subtree into the coordinate budget, exactly as the ROOT
          // fits content to the canvas (gofish.tsx) — here the budget plays the
          // role of the canvas: σ solves the coord's claim against the budget
          // so the children fill the ring, and a pinned axis also maps its
          // data onto the budget. Only DATA-bound channels consume the scale — a plain
          // number bypasses both σ and the map (see `computeAesthetic`) — so
          // hand-sized (radian/pixel) stories are unchanged. This is what lets a
          // mark say `w: datum(count)` and have the ring auto-fit.
          const fitAxis = (
            axis: 0 | 1,
            budget: number
          ): [number | undefined, AxisMap | undefined] => {
            // The coord roots its axis's scope like the chart root: one σ
            // from the coord's own type and claim against its budget, and,
            // when the type has an origin, the frame its children sit in.
            // The coord's own claim: its children's claims overlaid as its
            // type overlays their data, or, on an axis pinned to a declared
            // window, the window's own data width.
            const resolved = spaceRef.current?.[axis];
            const claim =
              resolved === undefined
                ? undefined
                : coordTransform.dataWindow?.[axis] !== undefined
                  ? impliedExtent(resolved)
                  : unionChildExtents(
                      children.map((c) => c.resolveExtent()),
                      children.map((c) => c.resolveUnderlyingSpace()),
                      axis,
                      resolved
                    );
            const scope = scopes.solveScope(
              { kind: "coord", rootKey: node.key ?? node.type, axis },
              resolved,
              claim,
              budget
            );
            // Solver shadow (#39): a coord boundary RE-ROOTS σ for its subtree,
            // exactly as the root fits content to the canvas — assert the same
            // frame equation content(σ)=budget closes at the boundary. No-op
            // unless GOFISH_SOLVER_CHECK is set.
            shadowCheckScaleRoot(claim, budget, scope?.sigma, axis);
            if (scope === undefined) return [1, undefined];
            return [scope.sigma, scopeFrame(scope)];
          };
          const [sfX, frameX] = fitAxis(0, budget[0]);
          const [sfY, frameY] = fitAxis(1, budget[1]);
          // Each child sits in the coord's frame by the one seating rule
          // (`seatInScope`): a pinned child shares the frame and its map
          // places it; a free child's baseline sits at the frame's pixel of
          // data 0; a child with no 0 sits at 0. The coord and its interior
          // share one axis order, the coordinate space's upward y.
          const childPlaceables = children.map((child) => {
            const space = child.resolveUnderlyingSpace();
            const x = seatInScope(frameX, space[0]);
            const y = seatInScope(frameY, space[1]);
            const placeable = child.layout(size, [
              axisScale(sfX, x.childMap),
              axisScale(sfY, y.childMap),
            ]);
            placeable.place("x", x.seatPx, "baseline");
            placeable.place("y", y.seatPx, "baseline");
            return placeable;
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

          // A space with a declared window (geo's lon/lat box) is FRAMED by that
          // window: its box is the window's projected extent, not the union of
          // whatever its children happen to draw. A country outside the window
          // still draws, and overhangs the box — the SVG viewport clips it, the
          // way a map frame does. Without this the frame would silently zoom out
          // to fit the rest of the world. Decided BEFORE the loop so a fitted
          // space never pays for the per-child screen bboxes it would discard.
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

            if (!framesOwnWindow) {
              screenBbox = union(
                screenBbox,
                computeTransformedBoundingBox(
                  coordMinX,
                  coordMaxX,
                  coordMinY,
                  coordMaxY,
                  effectiveTransform
                )
              );
            }
          });

          if (framesOwnWindow) {
            // The fitted space already measured this exact box (that measurement
            // IS its scale factor), and its transform puts the window's low
            // corner at the origin — so take its answer rather than re-sampling
            // with a different sampler. `fit` is what makes `framesOwnWindow`
            // true, so `fittedExtent` is always set here.
            screenBbox = {
              minX: 0,
              maxX: fittedExtent!.width,
              minY: 0,
              maxY: fittedExtent!.height,
            };
          }

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
          // to draw the plane's origin within the box, in the coord's upward
          // axis order; `contentOffset` keeps it in pixels, which `lower`
          // draws — not placement: the polar
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
              contentOffset: [translateX, -translateY] as [number, number],
            },
          };
        },
        // IR lowering. Everything lives under the coord's translate plus its
        // `contentOffset` (the plane origin inside the box, in the coord's
        // upward axis order), so a single `contentToPixel` maps a y-down plane
        // point to the canvas. Content children warp through `inPixels(...)`
        // in their own `lower` (rect/ellipse/petal emit paths); the grid +
        // polar axes are computed in the math-handed plane and map through
        // `planeToPixel`.
        lower: ({ transform, renderData }, _children, node) => {
          const session = node.getRenderSession();
          const outer = session.toPixel!;
          const [coordTx, coordTy] = displayTranslate(transform);
          const [offsetX, offsetY] = (renderData?.contentOffset as
            | [number, number]
            | undefined) ?? [0, 0];
          const contentToPixel: ToPixel = ([cx, cy]) =>
            outer([coordTx + offsetX + cx, coordTy + offsetY + cy]);
          /** A math-handed plane point (y up) to the canvas. */
          const planeToPixel: ToPixel = ([cx, cy]) => contentToPixel([cx, -cy]);

          // The transform layout resolved: the donut-hole radial shift (so
          // content, grid and axis all sit past the hole) or a `fit`-ted space's
          // budget-to-pixels map. Angular budget = the transform's CentralAngle
          // (domain[0].size) so a sub-2π sweep tiles ticks correctly.
          const effectiveTransform = transformRef.current;
          const pixelTransform = inPixels(effectiveTransform);
          const angularBudget = coordTransform.domain[0].size ?? 2 * Math.PI;

          // Overlay primitive helpers (all in the math-handed plane, y up).
          const lineItem = (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            stroke: string,
            sw: number
          ): DisplayList.PathItem => ({
            kind: "path",
            d: `M${planeToPixel([x1, y1]).join(",")} L${planeToPixel([x2, y2]).join(",")}`,
            role: "overlay",
            style: lowerStyle({ fill: "none", stroke, strokeWidth: sw }),
          });
          // Axis labels: the anchor point (x, y) is in the plane (y up).
          const textItem = (
            x: number,
            y: number,
            text: string,
            anchor: DisplayList.TextItem["textAnchor"],
            baseline: DisplayList.TextItem["dominantBaseline"],
            fontSize: number,
            fill: string
          ): DisplayList.TextItem => {
            const [px, py] = planeToPixel([x, y]);
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

          // Content: warp each flattened child through the coord transform,
          // in pixels (`inPixels`).
          // A FRAMED space (one declaring its own window, e.g. `geo`'s lon/lat
          // box) draws only what falls inside the frame: a flattened item whose
          // coordinate-space box lies wholly outside the budget is skipped, the
          // way a map frame excludes the continents it is not showing. An item
          // only PARTLY outside is still drawn whole and overhangs the frame —
          // cutting it needs a polygon clipper, and nothing else needs one yet.
          const frame = frameRef.current;
          const outsideFrame = (d: {
            node: GoFishAST;
            transform: { translate: (number | undefined)[] };
          }): boolean => {
            if (!frame) return false;
            const dims = (d.node as GoFishNode).intrinsicDims;
            if (!dims) return false;
            for (const axis of AXES) {
              const iv = dims[axis];
              if (iv?.min === undefined || iv?.size === undefined) return false;
              // The interior stores pixels; the frame is in the coordinate
              // space, whose y runs upward (see `axisDirection.ts`).
              const pxLo = (d.transform.translate[axis] ?? 0) + iv.min;
              const px = { min: pxLo, max: pxLo + iv.size };
              const { min, max } = axis === 1 ? reflectInterval(px) : px;
              if (
                !IntervalLib.overlaps(
                  { min: min!, max: max! },
                  { min: 0, max: frame[axis] }
                )
              )
                return true;
            }
            return false;
          };

          session.toPixel = contentToPixel;
          try {
            // Children paint in the shared paint order (#982), so a z
            // constraint that parts at this coord takes effect here.
            for (const child of orderChildrenForPaint(node)) {
              for (const d of flattenLayout(child)) {
                if (outsideFrame(d)) continue;
                items.push(
                  ...d.node.INTERNAL_lower(pixelTransform, d.transform)
                );
              }
            }
          } finally {
            session.toPixel = outer;
          }

          // The grid + axis overlays below are the POLAR family's: they read
          // `domain` as (theta, r) and tile ticks across `angularBudget`
          // radians. A fitted space's budget is a DATA window in its own units
          // (geo: degrees), so those overlays would draw rings at 2π radians of
          // longitude. Say so rather than emitting that.
          if (framesOwnWindow && (axes || grid)) {
            throw new Error(
              `[gofish] axes are not supported under a fitted ("${coordTransform.type}") ` +
                `space yet: its coordinate budget is a data window, not (theta, r), so the ` +
                `polar ring/grid overlay would draw at 2π. Leave axes and grid off until a ` +
                `geo graticule lands.`
            );
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
                planeToPixel
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
              const [px, py] = planeToPixel([gx, gy]);
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
              const [px, py] = planeToPixel([gx, gy]);
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
              const [ringCx, ringCy] = planeToPixel([0, 0]);
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
              if (xIv) {
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
            if (axesY && yIv) {
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
              // The radial axis title. Only the coord knows where its radial
              // ray is, so it titles its own axis here; the chart-level title
              // pass reads only the root's own space. The title continues
              // the ray past its outer end, reading along the ray, so it never
              // sits on top of the data. It names
              // the axis from the `axes` option's title, else the radial
              // space's measure, else the coordinate space's own name for the
              // axis (`r`) (#621).
              //
              // Deliberately no angular (theta) title by default: the ring's
              // tick labels already say what goes around, and a title has no
              // natural single place on a circle.
              const title = axisTitle(
                typeof axes === "object" && axes !== null ? axes.y : undefined,
                spaceMeasure(ySpace) ?? effectiveTransform.aliases?.y ?? "r"
              );
              if (title !== undefined) {
                const [ix, iy] = planeToPixel([x0 - H_GAP, y0]);
                const [ox, oy] = planeToPixel([x1 - H_GAP, y1]);
                const len = Math.hypot(ox - ix, oy - iy) || 1;
                const [ux, uy] = [(ox - ix) / len, (oy - iy) / len];
                // Reading direction along the ray, kept upright: a ray that
                // points left reads the other way.
                let deg = (Math.atan2(uy, ux) * 180) / Math.PI;
                const flipped = deg > 90 || deg < -90;
                if (flipped) deg += deg > 0 ? -180 : 180;
                // Past the ray's outer end (past the last tick): the text
                // starts a gap beyond it and runs outward, away from the data.
                const GAP = 8;
                const px = ox + ux * GAP;
                const py = oy + uy * GAP;
                items.push({
                  kind: "text",
                  x: px,
                  y: py,
                  text: title,
                  textAnchor: flipped ? "end" : "start",
                  dominantBaseline: "middle",
                  fontSize: TITLE_FONT_SIZE,
                  rotate: deg,
                  role: "overlay",
                  style: lowerStyle({ fill: TITLE_COLOR }),
                });
              }
            }
          }

          return items;
        },
      },
      children
    );
    // Declare this space's axis names (e.g. polar `{ x: "theta", y: "r" }`) so
    // resolveAliases can rebind the axis-name scope for the coord's subtree.
    coordNode._space = {
      aliases: coordTransform.aliases,
      type: coordTransform.type,
    };
    // The coord's own box lives in its parent's space, so its `dims` option
    // resolves against the parent's names (the hook's `outer` scope).
    coordNode._elaborateInAxisScope = deferAxisDims(fancyDims, dims);
    return coordNode;
  }
);
