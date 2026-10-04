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
  ORDINAL,
  isCONTINUOUS,
  isORDINAL,
  isUNDEFINED,
  forgetAllMeasures,
  mergeAllMeasures,
  continuousInterval,
  CONTINUOUS,
  originIs,
  spaceMeasure,
} from "../underlyingSpace";
import { impliedExtent } from "../extent";
import {
  overlayOrigin,
  seatedUnion,
  unionChildExtents,
} from "../graphicalOperators/alignment";
import type { Measure } from "../data";
import { axisScale, type AxisMap } from "../domain";
import { shadowCheckScaleRoot } from "../solver/shadow";
import { getScopeRegistry } from "../solver/scopes";
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

/** Union all child ORDINAL spaces on `axis` into one ORDINAL, carrying the
 *  grouping measure (FORGET on a clash) so a polar category axis names itself
 *  off its space — the coord-space analogue of `unionChildSpaces`'s ordinal
 *  fold. (Children are tuples; non-ordinal entries on `axis` are ignored.) */
const unionOrdinal = (
  children: Size<UnderlyingSpace>[],
  axis: 0 | 1
): UnderlyingSpace => {
  const keys = new Set<string>();
  const measures: (Measure | undefined)[] = [];
  // Anonymous only if EVERY contributing ordinal is anonymous.
  let anonymous = true;
  for (const child of children) {
    const s = child[axis];
    if (isORDINAL(s) && s.domain) {
      s.domain.forEach((k) => keys.add(k));
      measures.push(s.measure);
      if (!s.anonymous) anonymous = false;
    }
  }
  return ORDINAL(Array.from(keys), forgetAllMeasures(measures), anonymous);
};

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

          // Per axis, the coord's fold is the overlay fold (each child seated
          // on its baseline, the origin of the overlay), with two rules of its
          // own: any ORDINAL child makes the axis a category axis, and a
          // declared window pins the axis to that window. Measures unify as
          // types, as in every continuous composition: two units on one
          // coordinate axis would share one σ.
          const axisSpace = (axis: 0 | 1): UnderlyingSpace => {
            if (children.some((child) => child[axis].kind === "ordinal"))
              return unionOrdinal(children, axis);
            const spaces = children.map((child) => child[axis]);
            const conts = spaces.filter((s) => isCONTINUOUS(s));
            if (conts.length === 0) return UNDEFINED;
            const window = declared?.[axis];
            const origin =
              window !== undefined ? "pinned" : overlayOrigin(spaces);
            return CONTINUOUS(
              window ?? seatedUnion(conts, "baseline", origin),
              origin,
              mergeAllMeasures(
                conts.map((s) => s.measure),
                { axis, where: "inside a coordinate space" }
              ),
              coordTransform
            );
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
          ): [number | undefined, AxisMap | undefined, number | undefined] => {
            // The coord roots its axis's scope like the chart root: one σ
            // from the coord's own type and claim against its budget, and,
            // for a pinned axis, the map its children share.
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
            if (scope === undefined) return [1, undefined, undefined];
            return [
              scope.sigma,
              originIs(resolved, "pinned")
                ? { sigma: scope.sigma, originPx: scope.originPx! }
                : undefined,
              scope.originPx,
            ];
          };
          const [sfX, psX, originX] = fitAxis(0, budget[0]);
          const [sfY, psY, originY] = fitAxis(1, budget[1]);
          const childPlaceables = children.map((child) =>
            child.layout(size, [axisScale(sfX, psX), axisScale(sfY, psY)])
          );
          // A free child's local 0 is its baseline, so it sits at the scope's
          // pixel of data 0; a pinned child shares the coord's frame (the map
          // places it), and an origin-less one has no 0: both sit at 0.
          const seat = (child: (typeof children)[number], axis: 0 | 1) =>
            originIs(child.resolveUnderlyingSpace()[axis], "free")
              ? ((axis === 0 ? originX : originY) ?? 0)
              : 0;
          childPlaceables.forEach((c, i) => {
            c.place("x", seat(children[i], 0), "baseline");
            c.place("y", seat(children[i], 1), "baseline");
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

          // The transform layout resolved: the donut-hole radial shift (so
          // content, grid and axis all sit past the hole) or a `fit`-ted space's
          // budget-to-pixels map. Angular budget = the transform's CentralAngle
          // (domain[0].size) so a sub-2π sweep tiles ticks correctly.
          const effectiveTransform = transformRef.current;
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
          // `contentToPixel` only composes a translate onto `outer`, so it
          // preserves the incoming y-parity — the active flip scope
          // (`session.flip`) is unchanged (issue #629; coord self-normalization
          // is a Stage-1 concern).
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
              const lo = (d.transform.translate[axis] ?? 0) + iv.min;
              const hi = lo + iv.size;
              if (
                !IntervalLib.overlaps(
                  { min: lo, max: hi },
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
                  ...d.node.INTERNAL_lower(effectiveTransform, d.transform)
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
              if (originIs(xSpace, "pinned") && xIv) {
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
            if (axesY && originIs(ySpace, "pinned") && yIv) {
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
              const yOpt =
                typeof axes === "object" && axes !== null ? axes.y : undefined;
              const explicit =
                typeof yOpt === "object" && yOpt !== null
                  ? yOpt.title
                  : undefined;
              const title =
                explicit === false
                  ? undefined
                  : (explicit ??
                    spaceMeasure(ySpace) ??
                    effectiveTransform.aliases?.y ??
                    "r");
              if (title !== undefined) {
                const [ix, iy] = contentToPixel([x0 - H_GAP, y0]);
                const [ox, oy] = contentToPixel([x1 - H_GAP, y1]);
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
                  fontSize: 11,
                  rotate: deg,
                  role: "overlay",
                  style: lowerStyle({ fill: "gray" }),
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
    coordNode._aliases = coordTransform.aliases;
    // The coord's own box lives in its parent's space, so its `dims` option
    // resolves against the parent's names (the hook's `outer` scope).
    coordNode._elaborateInAxisScope = deferAxisDims(fancyDims, dims);
    return coordNode;
  }
);
