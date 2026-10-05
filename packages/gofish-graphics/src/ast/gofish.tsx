// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Rendering — /internals/core/rendering
// @wiki Overview — /internals/layout/passes
// @wiki Architecture Overview — /internals/overview/architecture
// </gofish-wiki>

import { createResource, Show, Suspense, type JSX } from "solid-js";
import { type ColorConfig, type GradientScale } from "./colorSchemes";
import { render as solidRender } from "solid-js/web";
import {
  debugInputSceneGraph,
  debugNodeTree,
  debugUnderlyingSpaceTree,
  GoFishNode,
  type RenderSession,
} from "./_node";
import type { GoFishAST } from "./_ast";
import { axisScale, pxOf, type AxisMap, type AxisScale } from "./domain";
import { lowerToDisplayList } from "./displayList/lower";
import { paintSVG } from "./displayList/paintSVG";
import type { InteractionRuntime } from "../interaction/runtime";
import { renderWithInteraction } from "../interaction/renderTerminal";
import type { ToPixel } from "./_node";
import type { Size } from "./dims";
import {
  continuousInterval,
  isCONTINUOUS,
  spaceMeasure,
  type UnderlyingSpace,
} from "./underlyingSpace";
import { niceScope, type Extent } from "./extent";
import {
  axisDirection,
  fromFrameStart,
  orientScales,
  wrapperDirection,
} from "./axisDirection";
import { shadowCheckScaleRoot } from "./solver/shadow";
import {
  perfNow,
  perfAdd,
  perfBeginRun,
  perfEnabled,
  perfSetCount,
} from "./perf";
import {
  axisTitle,
  elaborateAxes,
  elaborateAxisTitles,
  defaultAxisSide,
  labelRowSettingsFromAngles,
  type LabelRowSettings,
} from "./axes/elaborate";
import { layoutWithAutoLabelAngles } from "./axes/autoLabelAngle";
import {
  getScopeRegistry,
  scopeFrame,
  seatInScope,
  type EqualMeasureAxis,
  type ScopeSolution,
} from "./solver/scopes";
import { elaborateLegend, legendOverhang } from "./legends/elaborate";
import { elaborateLabels } from "./labels/elaborate";

export type CategoricalScale = {
  color: Map<any, string>;
  colorConfig?: ColorConfig;
  /** The data fields the scale maps from: the `field` each mark's color value
   *  was read from, when its color channel named one (see
   *  `DatumValueImpl.field`). A scale shared by several layers can
   *  map several fields. Empty or absent when every color came from a
   *  function accessor or a hand-made value. */
  fields?: Set<string>;
};

export type ContinuousScale = {
  domain: [number, number];
  scaleFactor: number;
};

/**
 * A continuous (gradient) color scale: a single `scaleFn` over the numeric
 * `domain`, built by `createGradientScale`. It is the source of truth for a
 * gradient color encoding — mark fills and the colorbar legend both read it,
 * rather than enumerating one swatch per distinct value (which is what
 * {@link CategoricalScale} does for palettes).
 */
export type ContinuousColorScale = {
  scaleFn: (value: number) => string;
  domain: [number, number];
  colorConfig: GradientScale;
  /** The data fields the scale maps from (see `CategoricalScale.fields`). */
  fields?: Set<string>;
  /**
   * Internal: set once the gradient domain has been resolved over the full
   * subtree (first writer wins), so deeper nodes don't recompute a narrower one.
   */
  resolved?: boolean;
};

export type Scale = CategoricalScale | ContinuousScale | ContinuousColorScale;

export type ScaleContext = {
  [measure: string]: Scale;
};

export const isCategoricalScale = (
  s: Scale | undefined
): s is CategoricalScale => s !== undefined && "color" in s;

export const isContinuousColorScale = (
  s: Scale | undefined
): s is ContinuousColorScale => s !== undefined && "scaleFn" in s;
/** Root data → layout-pixel maps, per axis (undefined where the root has no
 *  continuous position scale). */
export type PixelPosScales = [
  ((value: number) => number) | undefined,
  ((value: number) => number) | undefined,
];

export type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
/** `side` (issue #143/#16): which frame edge the axis seats on — `"start"` (the
 *  start of the frame's axis order: the top of a y that reads top-down, the
 *  bottom of a continuous y, which grows upward) or `"end"` (the far side).
 *  Frame-relative, matching the start/end vocabulary of alignment/distribute.
 *  When OMITTED, a continuous/difference X-axis defaults to the visual BOTTOM
 *  (see `defaultAxisSide` in `axes/elaborate.tsx`); an explicit `side`
 *  overrides that with the literal frame-relative seating. */
export type AxisOptions =
  | boolean
  | {
      title?: string | false;
      side?: "start" | "end";
      /** Rotate tick/category labels by this many degrees, clockwise on screen
       *  — matches Vega-Lite's `labelAngle` (e.g. `45` slants a label down to
       *  the right, `90` reads top-to-bottom).
       *
       *  **`"auto"`** picks the angle for you, separately for each label row
       *  (each tier of a nested ordinal axis): the first of 0°, 45°, 90° at
       *  which no two labels in that row collide (at least 2px apart). A
       *  category row that collides at every angle is hidden and takes no
       *  space; a continuous tick row cannot be hidden and keeps the angle
       *  with the least overlap. So a grouped bar chart's crowded inner row
       *  can slant (or disappear) while its roomy outer row stays upright.
       *  Collisions are counted across the whole chart. The chart is
       *  laid out once per angle tried, so it must be rebuildable: a chart
       *  builder or a component thunk, not a prebuilt node (see
       *  axes/autoLabelAngle.ts). "auto" cannot be an entry of a per-tier
       *  array.
       *
       *  A plain **number** applies to every tier of a nested ordinal axis
       *  (e.g. both the city and year rows of a grouped bar chart). An
       *  **array** is per-tier, indexed from the INNERMOST tier outward —
       *  `[45]` rotates only the innermost category row (e.g. the year row
       *  directly under grouped bars) and leaves outer tiers (e.g. the city
       *  row) unrotated; `[45, 0]` is the explicit two-tier form. An index
       *  beyond the array's length means unrotated/undefined. A continuous
       *  axis has a single tier: it uses the number, or `array[0]` for the
       *  array form. */
      labelAngle?: number | number[] | "auto";
    };

/** Read one `AxisOptions` field per dim, AS AUTHORED — `undefined` wherever the
 *  caller did not specify it, so an elaboration can tell an explicit value apart
 *  from the default (e.g. an explicit `side: "start"` vs. a continuous x-axis
 *  defaulting to the bottom). */
function perDimAxisOption<K extends keyof Extract<AxisOptions, object>>(
  axes: AxesOptions | undefined,
  key: K
): [Extract<AxisOptions, object>[K], Extract<AxisOptions, object>[K]] {
  const read = (o: AxisOptions | undefined) =>
    o && typeof o === "object" ? o[key] : undefined;
  if (axes && typeof axes === "object") return [read(axes.x), read(axes.y)];
  return [undefined, undefined];
}

export const resolveAxisSides = (
  axes: AxesOptions | undefined
): ["start" | "end" | undefined, "start" | "end" | undefined] =>
  perDimAxisOption(axes, "side");

type LabelAngleOption = number | number[] | "auto" | undefined;

/** Reject a malformed `labelAngle` (see `AxisOptions.labelAngle`). The type
 *  already forbids these; this catches untyped callers (Python, plain JS). */
function checkLabelAngle(v: unknown, axis: "x" | "y"): LabelAngleOption {
  if (v === undefined || v === "auto" || typeof v === "number") return v;
  if (Array.isArray(v)) {
    if (v.includes("auto"))
      throw new Error(
        `axes.${axis}.labelAngle: "auto" applies to the whole axis, so it ` +
          `cannot be one entry of a per-tier array; use labelAngle: "auto".`
      );
    if (v.every((a) => typeof a === "number")) return v as number[];
  }
  throw new Error(
    `axes.${axis}.labelAngle: unknown value ${JSON.stringify(v)} ` +
      `(expected a number, an array of numbers, or "auto").`
  );
}

/** A `number` applies to every tier; a `number[]` is per-tier, innermost first;
 *  `"auto"` is chosen per axis by `runLayout` (see `AxisOptions.labelAngle`). */
export const resolveAxisLabelAngles = (
  axes: AxesOptions | undefined
): [LabelAngleOption, LabelAngleOption] => {
  const [x, y] = perDimAxisOption(axes, "labelAngle");
  return [checkLabelAngle(x, "x"), checkLabelAngle(y, "y")];
};

/** The label-row settings a manual `labelAngle` describes. "auto" has none of
 *  its own: `runLayout` chooses them and hands them to `layout()` directly. */
function manualLabelRowSettings(
  axes: AxesOptions | undefined
): LabelRowSettings {
  const angles = resolveAxisLabelAngles(axes);
  if (angles[0] === "auto" || angles[1] === "auto") {
    throw new Error(
      'labelAngle: "auto" must be resolved before layout(); render through ' +
        "gofish(), a chart builder, or runLayout()."
    );
  }
  return labelRowSettingsFromAngles(
    angles as [number | number[] | undefined, number | number[] | undefined]
  );
}

// Fallback extent for an omitted `w`/`h` on a POSITION or data-driven SIZE axis,
// which needs a concrete canvas to scale data into (see the per-axis comment in
// `layout()` for the full behavior, including the shrink-to-fit case).
const DEFAULT_CANVAS_SIZE = 400;

// A chart-level axis is titled only when `axes` turns it on (`true`, or a
// dim's entry that is not `false`); its title is then `axisTitle`'s.
function resolveAxisTitles(
  axes: AxesOptions | undefined,
  measures?: { x?: string; y?: string }
): { xTitle: string | undefined; yTitle: string | undefined } {
  const title = (dim: "x" | "y"): string | undefined => {
    if (axes === true) return measures?.[dim];
    const opt = axes && typeof axes === "object" ? axes[dim] : undefined;
    return opt === undefined || opt === false
      ? undefined
      : axisTitle(opt, measures?.[dim]);
  };
  return { xTitle: title("x"), yTitle: title("y") };
}

export async function layout(
  {
    w,
    h,
    x,
    y,
    transform,
    debug = false,
    axes = false,
    legend = true,
    labelRowSettings,
  }: {
    w?: number;
    h?: number;
    x?: number;
    y?: number;
    transform?: { x?: number; y?: number };
    debug?: boolean;
    axes?: AxesOptions;
    legend?: boolean;
    /** Internal: how each axis label row is drawn, as chosen by
     *  `labelAngle: "auto"` (see `runLayout`). Overrides the angles in `axes`. */
    labelRowSettings?: LabelRowSettings;
  },
  child: GoFishNode | Promise<GoFishNode>,
  contexts?: {
    session: RenderSession;
  }
): Promise<{
  underlyingSpaceX: UnderlyingSpace;
  underlyingSpaceY: UnderlyingSpace;
  posScales: PixelPosScales;
  child: GoFishNode;
  width: number;
  height: number;
  rightOverhang: number;
  rightContentOverhang: number;
  topOverhang: number;
  leftOverhang: number;
  bottomOverhang: number;
  legendFields: ReadonlySet<string>;
}> {
  child = await child;
  if (contexts?.session) {
    child.setRenderSession(contexts.session);
  }
  // Note: callers must await `document.fonts.ready` before invoking
  // `layout()`. The public `gofish()` entry handles this; standalone
  // callers of `layout()` are responsible for the wait themselves.

  if (debug) {
    console.log("🌳 Input Scene Graph:");
    debugInputSceneGraph(child);
  }

  const __tResolve = perfNow();
  child.resolveColorScale();
  child.resolveNames();
  // Resolve axis names (polar theta/r, geo lon/lat, …) BEFORE space inference
  // reads the dims: run each node's deferred axis-scope work (a mark's `dims`,
  // spread's `dir`, scatter's `dims`). Top-down + scope-bounded (see resolveAliases).
  await child.resolveAliases();
  child.resolveUnderlyingSpace();
  perfAdd("resolve", perfNow() - __tResolve);

  // Chart-level axis TITLE measure, captured PRE-elaboration. The root space
  // here carries the OUTERMOST grouping's measure (the outer operator's fold is
  // authoritative over its subtree), e.g. a grouped bar's x = "lake". After
  // axis elaboration inserts the inner (per-facet) ordinal axis nodes, the
  // re-resolved root unions those up and a finer grouping's measure ("species")
  // can win — but the chart-level title should name the outermost axis, so we
  // read it before that. (Nicing changes domains, not measures, so pre/post
  // agree except for this elaboration bubble-up.)
  const titleMeasures = {
    x: spaceMeasure(child._underlyingSpace?.[0]),
    y: spaceMeasure(child._underlyingSpace?.[1]),
  };

  // The original root content object stays in the tree as the plot after any
  // wrapping below (axis / legend / title elaboration each wrap, never replace,
  // the content). Captured here so the title pass can center on it as the
  // fallback anchor when a dim has no elaborated axis line. If axis elaboration
  // changes nothing, `plotNode === child`.
  const plotNode = child;

  // Per-dim axis-line node for chart-level title centering (root-most owner
  // wins). Defaults to no anchors when the `axes` block below doesn't run.
  let titleAnchors: [GoFishNode | undefined, GoFishNode | undefined] = [
    undefined,
    undefined,
  ];

  // Re-resolve after an elaboration pass rewrote `child`. The inserted nodes
  // need the session and name resolution (a `ref()` stand-in resolves its
  // target here, or layout throws "Selected node not found"), and because
  // `resolveUnderlyingSpace` memoizes while a rewrite moves keys onto fresh
  // wrappers, every cached space is cleared and recomputed from scratch.
  //
  // `withColorScale` is for the AXIS pass only: the color scale must be final
  // before the legend pass consumes it, and the later passes insert chrome with
  // non-literal fills ("gray" titles, swatches) that would otherwise be folded
  // into the palette as if they were data values.
  const reresolve = async (n: GoFishNode, withColorScale = false) => {
    if (contexts?.session) n.setRenderSession(contexts.session);
    if (withColorScale) n.resolveColorScale();
    n.resolveNames();
    // The inserted chrome is built from operators (Spread) whose constraints
    // install in this pass; nodes resolved before are consumed and untouched.
    await n.resolveAliases();
    n.clearUnderlyingSpace();
    n.resolveUnderlyingSpace();
  };

  // Node-based axis pipeline: mark axis nodes and apply nice-rounding in-place
  const __tAxes = perfNow();
  if (axes) {
    // Which dims the chart-level `axes` option enables. `true` → both. For an
    // `{ x?, y? }` object, a dim is enabled unless it is explicitly `false` —
    // an unspecified (undefined) dim still shows (specifying one axis doesn't
    // disable the other); only `false` suppresses.
    const enabled = new Set<0 | 1>();
    if (axes === true) {
      enabled.add(0);
      enabled.add(1);
    } else if (typeof axes === "object") {
      if (axes.x !== false) enabled.add(0);
      if (axes.y !== false) enabled.add(1);
    }
    child.resolveAxes(new Map(), enabled);

    // Axis elaboration: turn inferred axes into ordinary shapes + constraints.
    // Wraps axis-owning content in a Layer with tick/label shapes and clears the
    // handled axis flags; the new subtree is then re-resolved below. A flag the
    // pass doesn't handle (e.g. an UNDEFINED space) is inert — nothing else
    // consumes `node.axis`.
    const elaborated = await elaborateAxes(
      child,
      resolveAxisSides(axes),
      labelRowSettings ?? manualLabelRowSettings(axes)
    );
    titleAnchors = elaborated.titleAnchors;
    if (elaborated.changed) {
      child = elaborated.node;
      await reresolve(child, true);
    }
  }

  // Label elaboration: turn every `.label(...)` spec into a real `Text` node +
  // constraints (src/ast/labels/elaborate.tsx), the same technique the axis
  // pass above uses. Runs after axis elaboration (a label may target a node
  // an axis pass just wrapped) and before the contentNode/title/legend passes
  // below, so a label's own bbox is folded into what those passes measure.
  const labelRes = await elaborateLabels(child);
  if (labelRes.changed) {
    child = labelRes.node;
    await reresolve(child);
  }

  // The ROOT σ-scope's spaces, demand-niced (issue #659): nicing is per-scope,
  // applied AT the scope's solve (there is no pre-layout tree walk), and it is
  // DEMAND-DRIVEN — the root scope nices a POSITION domain iff some node in it
  // renders that dim's axis (`scopeRendersAxis` reads the persistent stamps
  // `resolveAxes` left; with axes off no stamp exists, so axis-less content
  // stays at the honest raw scale). When an axis IS drawn, every root consumer
  // below — the posScale, the baseline-magnitude size solve, the equal-measure
  // recentering, `needsCanvas` — reads this one niced domain, the same domain
  // the tick elaboration niced, so content and ticks agree by construction.
  // Each nested scope root (self-scaled region, shared-scale scope) applies the
  // same rule at its own solve; a coord scope never nices.
  const rootAxisDemand: [boolean, boolean] = [
    child.scopeRendersAxis(0),
    child.scopeRendersAxis(1),
  ];
  // The root's types and their size claims, niced together (a niced pinned
  // domain implies its claim).
  const rootExtent = child.resolveExtent();
  const [niceUnderlyingSpaceX, niceExtentX] = niceScope(
    child._underlyingSpace![0],
    rootExtent[0],
    rootAxisDemand[0]
  );
  const [niceUnderlyingSpaceY, niceExtentY] = niceScope(
    child._underlyingSpace![1],
    rootExtent[1],
    rootAxisDemand[1]
  );

  // Reference to the content node whose extent defines the final canvas
  // (`finalW`/`finalH` via the `finalDim` readback below). Both the title pass
  // and the legend pass wrap `child`, so `contentNode` keeps pointing at the
  // PRE-title, pre-legend content. This matters two ways:
  //  - The inferred canvas is measured off the content, never inflated by a long
  //    title or a tall legend column.
  //  - Title, legend, and constraint-displaced extents past the content are
  //    reserved separately as measured per-side overhangs (`leftOverhang`,
  //    `bottomOverhang`, `topOverhang`, the legend `rightOverhang`, and the
  //    non-legend `rightContentOverhang` below).
  const contentNode = child;

  // Axis-title elaboration: seat up to two title Text nodes (x below, y rotated
  // left) as ordinary shapes + constraints (src/ast/axes/elaborate.tsx), each
  // centered on the axis line it describes via a `ref()` stand-in (falling back
  // to the plot node). Runs BEFORE the legend block on purpose: the legend
  // distributes off the titled content's bbox, and title centering must never
  // see the legend column. Title Texts resolve UNDEFINED spaces on both dims, so
  // the wrapper preserves the content's underlying spaces and the nice spaces
  // captured above remain valid. The caller owns the "any title?" guard.
  // The title names each axis off its space `measure` (continuous → unit,
  // ordinal → grouping field), read from `titleMeasures` (the OUTERMOST grouping,
  // captured pre-elaboration). An axis whose space carries no measure (e.g. a
  // magnitude whose measures forgot on conflict) simply gets no title.
  // A title names an axis the root has: a dim the root has no space on (the
  // root is a coordinate space, whose axes and their titles it draws itself,
  // or has nothing data-driven there) gets no chart-level title.
  const titles = resolveAxisTitles(axes, titleMeasures);
  const rootHasAxis = (dim: 0 | 1) =>
    (dim === 0 ? niceUnderlyingSpaceX : niceUnderlyingSpaceY).kind !==
    "undefined";
  const xTitle = rootHasAxis(0) ? titles.xTitle : undefined;
  const yTitle = rootHasAxis(1) ? titles.yTitle : undefined;
  if (xTitle !== undefined || yTitle !== undefined) {
    // Each title seats on the same side as its axis line (the axis's own
    // default, or the explicit `side`), in the plot's axis order.
    const baseSides = resolveAxisSides(axes);
    const titleSides: ["start" | "end", "start" | "end"] = [
      baseSides[0] ??
        defaultAxisSide(
          0,
          niceUnderlyingSpaceX,
          wrapperDirection(contentNode, 1)
        ),
      baseSides[1] ??
        defaultAxisSide(
          1,
          niceUnderlyingSpaceY,
          wrapperDirection(contentNode, 0)
        ),
    ];
    const titled = await elaborateAxisTitles(child, {
      xTitle,
      yTitle,
      anchors: titleAnchors,
      plotNode,
      sides: titleSides,
    });
    child = titled;
    await reresolve(child);
  }

  // Legend elaboration: turn the color scale into an ordinary subtree seated
  // beside the (now possibly titled) content (src/ast/legends/elaborate.tsx) —
  // a swatch column for a categorical scale, or a colorbar for a continuous
  // (gradient) one. Runs after the last resolveColorScale (it consumes the
  // resolved scale; legend fills are literal strings, never isValue, so the
  // scale pass is NOT re-run). The wrapper preserves the content's underlying
  // spaces (unionChildSpaces ignores the legend's UNDEFINED spaces), so the
  // nice spaces captured above remain valid.
  // `legend: false` (the chart option) suppresses this pass entirely: the
  // color scale still paints the marks, only the chrome is dropped. Mirrors
  // `axes: false`, and nothing downstream reserves space for a legend that
  // was never added (`legendAdded` stays false).
  let legendAdded = false;
  const unitScale = contexts?.session.scaleContext.unit;
  const hasLegend =
    legend !== false &&
    ((isCategoricalScale(unitScale) && unitScale.color.size > 0) ||
      isContinuousColorScale(unitScale));
  if (hasLegend && unitScale) {
    // The legend reads top→bottom; its rows follow the plot's own stacking
    // when the color series are stacked along a y axis (see `elaborateLegend`).
    child = await elaborateLegend(
      child,
      unitScale as CategoricalScale | ContinuousColorScale,
      contentNode
    );
    legendAdded = true;
    await reresolve(child);
  }
  perfAdd("axes", perfNow() - __tAxes);

  if (debug) {
    console.log("🌳 Underlying Space Tree:");
    debugUnderlyingSpaceTree(child);
  }

  // An omitted overall dimension is resolved per axis from the root's size
  // claim:
  //  - a claim (a scatter axis, bar heights = value, bar widths = value laid
  //    side by side): there's data to scale into pixels, so fall back to a
  //    concrete canvas (DEFAULT_CANVAS_SIZE).
  //  - no claim (a bar chart's category axis, or a bare fixed-size shape):
  //    nothing to scale, so lay out *unsized* — marks keep their default
  //    sizes and the operator shrinks to fit. The natural extent is recovered by
  //    the `finalDim` readback below, so the SVG is still sized concretely.
  // Unsized axes are handed `UNSIZED` (NaN); marks treat a non-finite size as
  // "use my default" (e.g. rect's DEFAULT_RECT_SIZE) via their `Number.isFinite`
  // guards, the same path the layout engine already relies on.
  const UNSIZED = NaN;
  const needsCanvas = (claim: Extent | undefined) => claim !== undefined;
  // Concrete canvas for scaling a claimed axis (always a real number).
  const canvasW = w ?? DEFAULT_CANVAS_SIZE;
  const canvasH = h ?? DEFAULT_CANVAS_SIZE;
  // Size handed to `child.layout`: a shrink-to-fit axis is left unsized.
  const layoutW = w ?? (needsCanvas(niceExtentX) ? canvasW : UNSIZED);
  const layoutH = h ?? (needsCanvas(niceExtentY) ? canvasH : UNSIZED);

  // The render's σ-scope registry: the ONE place σ / posScale is derived
  // (Stage 6b). The root is the first scope root; every other scope (self-scaled
  // axis, constraint budget, shared, coord boundary) solves through the same
  // registry. Reset so a re-run layout pass starts clean.
  const scopes = getScopeRegistry(contexts?.session);
  scopes.reset();

  // The root σ-scope on each continuous axis, solved by the registry from the
  // root's type and size claim against the canvas: σ, and the pixel of data 0
  // when the axis has an origin. Equal-measure recentering may replace both.
  const rootSpaces = [niceUnderlyingSpaceX, niceUnderlyingSpaceY] as const;
  const rootClaims = [niceExtentX, niceExtentY] as const;
  const canvas = [canvasW, canvasH] as const;
  let rootScopes: Size<ScopeSolution | undefined> = [
    scopes.solveScope(
      { kind: "root", rootKey: "root", axis: 0 },
      rootSpaces[0],
      rootClaims[0],
      canvas[0]
    ),
    scopes.solveScope(
      { kind: "root", rootKey: "root", axis: 1 },
      rootSpaces[1],
      rootClaims[1],
      canvas[1]
    ),
  ];

  if (debug) {
    console.log("width and height constraints:", layoutW, layoutH);
  }

  // Shared-measure scale equality (#582): when x and y carry the SAME unit of
  // measure, "1 unit on x" and "1 unit on y" are the same quantity, so their
  // data→pixel scales must be equal — a circle stays circular, a 45° line looks
  // 45°. This is type equality, not an opt-in knob: it follows from the measures
  // matching, the same way `circle({ r })` lowers to a `w`/`h` that share a
  // measure and so cannot render as an ellipse. The scope-level operation —
  // take the binding (smaller) σ and equate both axes' scopes — lives on the
  // registry (Stage 6c: the ONE post-solve σ adjustment, so every slope stays
  // registry-sourced and the dump shows the FINAL σ). Silently skipped when an
  // axis has no solved scope to equate.
  const measureX = spaceMeasure(niceUnderlyingSpaceX);
  const measureY = spaceMeasure(niceUnderlyingSpaceY);
  if (measureX !== undefined && measureX === measureY) {
    const axisInfo = ([0, 1] as const).map(
      (axis): EqualMeasureAxis | undefined => {
        const space = rootSpaces[axis];
        const scope = rootScopes[axis];
        return scope !== undefined && isCONTINUOUS(space)
          ? {
              space,
              claim: rootClaims[axis]!,
              canvas: canvas[axis],
              unitPx: scope.sigma,
            }
          : undefined;
      }
    ) as [EqualMeasureAxis | undefined, EqualMeasureAxis | undefined];
    rootScopes = scopes.recenterEqualMeasure("root", axisInfo) ?? rootScopes;
  }
  const rootScaleFactors: Size<number | undefined> = [
    rootScopes[0]?.sigma,
    rootScopes[1]?.sigma,
  ];

  // Solver shadow (#39): the ROOT σ-scope — the SIZE frame equation
  // content(σ)=canvas the whole chart resolves against. No-op unless
  // GOFISH_SOLVER_CHECK is set.
  shadowCheckScaleRoot(niceExtentX, canvasW, rootScaleFactors[0], 0);
  shadowCheckScaleRoot(niceExtentY, canvasH, rootScaleFactors[1], 1);

  // The root content sits in the root scope's frame by the one seating rule
  // (`seatInScope`): a pinned content shares the frame and places its data
  // through its map; a free content's baseline is placed at `originPx`
  // below (`placeRoot`) and it gets a frame of its own whose 0 is that
  // baseline. Who applies the pixel of data 0 is inherent to the two origin
  // states: a pinned extent's position is fixed by its data, a free
  // extent's is set by its parent.
  const rootSeats = ([0, 1] as const).map((axis) =>
    seatInScope(scopeFrame(rootScopes[axis]), rootSpaces[axis])
  );
  const rootMaps: Size<AxisMap | undefined> = [
    rootSeats[0].childMap,
    rootSeats[1].childMap,
  ];

  // Author each dim's `embedded` flag (point/line/area) now that underlying
  // space has resolved each coord axis's measure — Route B reads it to keep a
  // foreign-measure size flat. Runs on the final (axis/title/legend-elaborated)
  // tree, before layout/render consume the flag. See _node.resolveEmbedding.
  const __tEmbed = perfNow();
  child.resolveEmbedding();
  perfAdd("embed", perfNow() - __tEmbed);

  // Scene-graph size the solver actually sees (axis/title/legend already
  // elaborated). Whole walk guarded so the off path pays nothing.
  if (perfEnabled()) {
    const countNodes = (node: GoFishAST): number => {
      let n = 1;
      const kids = "children" in node ? node.children : [];
      for (const c of kids) n += countNodes(c);
      return n;
    };
    perfSetCount("nodes", countNodes(child));
  }

  // Merge the two half-channels into the single per-axis scale carrier handed
  // to layout: σ (size slope) from `rootScaleFactors`, the anchored map from
  // `rootMaps`.
  const rootScales: Size<AxisScale | undefined> = [
    axisScale(rootScaleFactors[0], rootMaps[0]),
    axisScale(rootScaleFactors[1], rootMaps[1]),
  ];

  // The root scales are solved in the root's own axis order; the canvas hands
  // them down in pixels, so a root whose y grows upward receives them reflected
  // (and `layout()` reads them back in its own order). The root's order is the
  // plot content's: the chrome wrappers seat the content at their own origin
  // and only add chrome around it.
  const rootDirection = [
    axisDirection(contentNode, 0),
    axisDirection(contentNode, 1),
  ] as const;
  const __tSolve = perfNow();
  child.layout(
    [layoutW, layoutH],
    orientScales(rootScales, 1, rootDirection[1])
  );
  perfAdd("solve", perfNow() - __tSolve);
  // Scope dump (#39 Stage 6b): every σ-scope solved during the layout pass just
  // above, as printable frame equations. No-op unless GOFISH_DUMP_SCOPES is set.
  scopes.dump();
  // Final extent: a user-given dimension is authoritative; otherwise prefer the
  // content's laid-out intrinsic size (shrink-to-fit), falling back to the
  // canvas default when the content didn't report one. Read off `contentNode`
  // (== `child` when no title/legend wrapper), never an outer wrapper — so the
  // canvas stays content-relative; title and legend extents are reserved
  // separately as measured gutters below. Sizes do not depend on placement, so
  // this is known before the root is placed.
  const finalDim = (i: 0 | 1, given: number | undefined): number => {
    if (given !== undefined) return given;
    const s = contentNode.dims[i]?.size;
    return s !== undefined && Number.isFinite(s) ? s : DEFAULT_CANVAS_SIZE;
  };
  const finalW = finalDim(0, w);
  const finalH = finalDim(1, h);

  // Root placement. The canvas is a frame `[0, final]` on each axis, and the
  // root's axis order starts at the frame's start edge: the left on x, the top
  // for a y that reads top-down, and the BOTTOM for a continuous y, which grows
  // upward from there (`atFrameStart`). A position `p` along the root's axis
  // order is the pixel `p` from that edge, inward.
  //
  // A GIVEN dimension seats the root's baseline in that frame; content seated
  // outside it (axis labels past the frame, ticks beyond it) is reserved as the
  // per-side overhangs below. A free (baseline-magnitude) root's local 0 is its
  // baseline, so it is placed at the scope's `originPx` (#773: `descent·σ` from
  // the frame's start edge, plus any overhead); a pinned root shares the frame
  // (its map carries `originPx`), and an origin-less root has none: both sit at
  // 0 (`seatInScope`).
  //
  // A SHRINK-TO-FIT dimension makes the canvas box the content's full extent,
  // so pin the box's start edge to the frame's start — content then fills the
  // frame and every overhang formula computes 0 for that axis. Leaving it off
  // origin is the #574 double-count: the overhangs re-reserve it as a phantom
  // band (e.g. the pulley diagram). Shrink-to-fit pins the edge, which already
  // includes any descent: adding `descent·σ` there would count it twice
  // (#574). The pin uses `pinAnchor`, not the write-once `place()`, so it lands
  // even when the root self-placed (a diagram with its own root transform).
  const placeRoot = (axis: 0 | 1) => {
    const name = axis === 0 ? "x" : "y";
    const offset = (axis === 0 ? x : y) ?? transform?.[name] ?? 0;
    const direction = rootDirection[axis];
    const frame = axis === 0 ? finalW : finalH;
    const atFrameStart = (p: number) => fromFrameStart(p, frame, direction);
    if ((axis === 0 ? w : h) === undefined)
      child.pinAnchor(
        name,
        atFrameStart(offset),
        direction === 1 ? "min" : "max"
      );
    else
      child.place(
        name,
        atFrameStart(offset + rootSeats[axis].seatPx),
        "baseline"
      );
  };
  placeRoot(0);
  placeRoot(1);

  // The root data → layout-pixel maps the interaction layer converts through:
  // a position along the root's axis order, from the root's placed origin.
  const posScales = [0, 1].map((axis) => {
    const map = rootScales[axis]?.map;
    if (map === undefined) return undefined;
    const origin = child.projectedTranslate(axis as 0 | 1) ?? 0;
    const direction = rootDirection[axis];
    return (v: number) => origin + direction * pxOf(map, v);
  }) as PixelPosScales;

  // Measured overhangs off the OUTERMOST wrapper (`child`), from its laid-out
  // extent. Anything seated beyond the content box is reserved by its placed
  // extent minus the content box; `render()` then sizes the SVG around them.
  // `max!` / `min!` discipline (never a silent `?? 0`): the wrapper always emits
  // a placed extent here — a silent 0 would clip the overhang and mask a layout
  // bug, so assert it's present.
  //
  // The RIGHT side has two distinct kinds of overhang that must be reserved
  // DIFFERENTLY, and they overlap in magnitude so the color-scale flag — not the
  // size — is what tells them apart:
  //  - A legend swatch column reserves `legendOverhang + pad` (see the width
  //    formula in `render`). Gated on `legendAdded`: a single-row legend can
  //    overhang as little as ~6px — the same as a wide rightmost x-tick label —
  //    so we cannot recover this from magnitude alone.
  //  - Otherwise, content displaced past the canvas by a constraint (e.g. a
  //    marginal histogram's right band) flows through `reserve()` like the other
  //    three gutters: a small x-tick spill is absorbed into `pad` (plain axis
  //    charts stay byte-identical) and a large band reserves its full extent.
  // TOP, LEFT, BOTTOM have only the second (chrome / displaced-content) kind.
  const rightOverhang = legendAdded ? legendOverhang(child, finalW) : 0;
  const rightContentOverhang = legendAdded
    ? 0
    : Math.max(0, child.dims[0].max! - finalW);
  const topOverhang = Math.max(0, -child.dims[1].min!);
  const bottomOverhang = Math.max(0, child.dims[1].max! - finalH);
  const leftOverhang = Math.max(0, -child.dims[0].min!);

  if (debug) {
    console.log("🌳 Node Tree:");
    debugNodeTree(child);
  }

  return {
    underlyingSpaceX: niceUnderlyingSpaceX,
    underlyingSpaceY: niceUnderlyingSpaceY,
    posScales,
    child,
    width: finalW,
    height: finalH,
    rightOverhang,
    rightContentOverhang,
    topOverhang,
    leftOverhang,
    bottomOverhang,
    // The fields a rendered legend shows: the color scale's fields when the
    // legend was drawn, none when it was suppressed or had nothing to show.
    legendFields: legendAdded
      ? new Set(
          (unitScale as { fields?: Set<string> } | undefined)?.fields ?? []
        )
      : new Set<string>(),
  };
}

/* top-level pass handler */

/** Options shared by every render terminal (`render`, `toSVG`, …). */
export type GoFishRenderOptions = {
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  transform?: { x?: number; y?: number };
  debug?: boolean;
  defs?: JSX.Element[];
  axes?: AxesOptions;
  /** Whether to elaborate the color-scale legend (swatch column / colorbar).
   *  Default true; `false` suppresses it. See `ChartOptions.legend`. */
  legend?: boolean;
  colorConfig?: ColorConfig;
  padding?: number;
  /**
   * Interaction runtime (see src/interaction/). When present, the render pass
   * publishes each lowered frame to it, emits `data-gf-id` hit-test hooks, and
   * attaches its delegated event listeners to the produced <svg>. Absent (the
   * static path), rendering is byte-identical to before.
   */
  interaction?: InteractionRuntime;
};

/** Extra options for the SVG-export terminals (`toSVG` / `toSVGElement` / `save`). */
export type GoFishExportOptions = GoFishRenderOptions & {
  /** Background fill painted behind the chart. `null`/omitted = transparent. */
  background?: string | null;
};

type LayoutData = {
  underlyingSpaceX: UnderlyingSpace;
  underlyingSpaceY: UnderlyingSpace;
  /** Root data → layout-pixel maps (see `PixelPosScales`). */
  posScales: PixelPosScales;
  child: GoFishNode;
  width: number;
  height: number;
  rightOverhang: number;
  rightContentOverhang: number;
  topOverhang: number;
  leftOverhang: number;
  bottomOverhang: number;
  /** The data fields the rendered legend shows (empty without a legend). */
  legendFields: ReadonlySet<string>;
};

/**
 * Run the domain-inference + layout passes for `child` and return the
 * measured layout data. The single place the pipeline is driven — shared by
 * the live `gofish()` render path and the `gofishToSVG*` export paths.
 *
 * An axis with `labelAngle: "auto"` is the one case that lays out more than
 * once: the chart is rebuilt and laid out once per candidate angle, and the
 * winning run's layout is returned as is (see axes/autoLabelAngle.ts). A chart
 * without "auto" takes the single `layoutOnce` below, unchanged.
 */
export async function runLayout(
  options: GoFishRenderOptions,
  child: GoFishNode | Promise<GoFishNode>
): Promise<LayoutData> {
  const angles = resolveAxisLabelAngles(options.axes);
  if (angles[0] !== "auto" && angles[1] !== "auto")
    return layoutOnce(options, child);
  return layoutWithAutoLabelAngles(options, child, angles, layoutOnce);
}

/** One pass of the pipeline over `child`, which it lays out in place. */
async function layoutOnce(
  options: GoFishRenderOptions,
  child: GoFishNode | Promise<GoFishNode>,
  labelRowSettings?: LabelRowSettings
): Promise<LayoutData> {
  const {
    w,
    h,
    x,
    y,
    transform,
    debug = false,
    axes = false,
    legend = true,
    colorConfig,
  } = options;
  // Seed the unit color scale by config kind. A gradient is a continuous
  // color scale (its `scaleFn`/`domain` are finalized in resolveColorScale
  // once the data domain is known); anything else is categorical. A
  // node-local gradient `colorConfig` (set by ChartBuilder) upgrades the
  // categorical seed in place during resolveColorScale.
  const session: RenderSession = {
    tokenContext: new Map(),
    scaleContext: {
      unit:
        colorConfig?._tag === "gradient"
          ? {
              scaleFn: () => "#cccccc",
              domain: [0, 1] as [number, number],
              colorConfig,
            }
          : { color: new Map(), colorConfig },
    },
  };
  // Reset the per-pass accumulator at the start of every render so the bench
  // harness reads a clean slate (the `lower`/`paint` passes land later, during
  // SolidJS's reactive render — see perf.ts). No-op when instrumentation is off.
  perfBeginRun();
  try {
    const contexts = { session };

    // Text mark bbox measurements (via canvas measureText in
    // text.tsx) depend on resolved font metrics. If a webfont is
    // still loading when layout runs, measurement uses fallback
    // metrics, baking the wrong positions into the SVG.
    // FontFaceSet.ready resolves once all CSS-declared @font-face
    // loads are done. System-fallback resolution (e.g. "Andale Mono"
    // → fontconfig monospace on Linux) bypasses this entirely, so
    // this isn't a full guarantee — but it's a strict improvement
    // for any consumer using <link>-loaded webfonts.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      const __tFonts = perfNow();
      await document.fonts.ready;
      perfAdd("fonts", perfNow() - __tFonts);
    }

    return await layout(
      {
        w,
        h,
        x,
        y,
        transform,
        debug,
        axes,
        legend,
        labelRowSettings,
      },
      child,
      contexts
    );
  } finally {
    if (debug) {
      console.log("scaleContext", session.scaleContext);
      console.log("tokenContext", session.tokenContext);
    }
  }
}

/** Continuous data domain of an axis's underlying space, for interaction
 *  anchors (clamping, selectors). Undefined for ordinal / difference / bare
 *  magnitude axes. */
const continuousDomain = (
  us?: UnderlyingSpace
): [number, number] | undefined => {
  const iv = us && continuousInterval(us);
  return iv ? [iv.min, iv.max] : undefined;
};

/** Build the `<svg>` JSX element from already-computed layout data. */
function renderLayout(
  data: LayoutData,
  svgPadding: number,
  defs?: JSX.Element[],
  interaction?: InteractionRuntime
): JSX.Element {
  return render(
    {
      width: data.width,
      height: data.height,
      svgPadding,
      defs,
      rightOverhang: data.rightOverhang,
      rightContentOverhang: data.rightContentOverhang,
      topOverhang: data.topOverhang,
      leftOverhang: data.leftOverhang,
      bottomOverhang: data.bottomOverhang,
      interaction,
      // Root data → layout-pixel maps for the interaction layer's data↔px
      // conversions (frameConversions).
      posScales: data.posScales,
      domains: {
        x: continuousDomain(data.underlyingSpaceX),
        y: continuousDomain(data.underlyingSpaceY),
      },
    },
    data.child
  );
}

/** What `gofish()` stashes on a container it rendered into: the chart's
 *  current Solid root teardown, and its interaction runtime when it has one.
 *  One object per CHART, not per paint: a re-render of the same chart (same
 *  runtime) swaps `disposeRoot` in place, so a {@link View} recognizes its own
 *  chart by this object's identity across re-renders. */
type ChartState = {
  disposeRoot: () => void;
  runtime?: InteractionRuntime;
};
type ChartHost = HTMLElement & { __gofishState?: ChartState };

/**
 * The handle `render` returns for a chart mounted in the page. `unmount()`
 * removes the chart's DOM and detaches it from every input it read, so a
 * `timer()` it was the last reader of stops ticking. It is idempotent, and it
 * never touches a NEWER chart that has since been rendered into the same
 * container.
 */
export interface View {
  /** The element the chart was rendered into. */
  readonly container: HTMLElement;
  /** Tear the chart down: its DOM, its Solid root, its interaction runtime. */
  unmount(): void;
}

/** Tear down the chart `gofish()` rendered into `container`, if any: its Solid
 *  root and its interaction runtime. A no-op on an element no chart rendered
 *  into. Internal: `View.unmount` is the public form, and a host that holds
 *  only the DOM (the story harness) calls this directly. See "Frame
 *  publication" in the Rendering essay. */
export function disposeChart(container: HTMLElement): void {
  const host = container as ChartHost;
  const state = host.__gofishState;
  if (!state) return;
  host.__gofishState = undefined;
  state.disposeRoot();
  state.runtime?.dispose();
}

/** The {@link View} of the chart whose state is `state`. It unmounts only while
 *  that chart still owns `container`: a newer chart there has its own state. */
const viewOf = (container: HTMLElement, state: ChartState): View => ({
  container,
  unmount() {
    if ((container as ChartHost).__gofishState === state)
      disposeChart(container);
  },
});

/** A chart child `gofish()` renders synchronously: a node or a promise of one
 *  (the layout awaits it inside the mounted root). */
type GoFishChild = GoFishNode | Promise<GoFishNode>;

/**
 * Render `child` into `container`. A node renders synchronously and returns its
 * {@link View}; a component thunk (`() => node`) first resolves under the
 * interaction runtime, so it returns a `Promise<View>`.
 */
export function gofish(
  container: HTMLElement,
  options: GoFishRenderOptions,
  child: GoFishChild
): View;
export function gofish(
  container: HTMLElement,
  options: GoFishRenderOptions,
  child: () => GoFishChild
): Promise<View>;
export function gofish(
  container: HTMLElement,
  options: GoFishRenderOptions,
  child: GoFishChild | (() => GoFishChild)
): View | Promise<View>;
export function gofish(
  container: HTMLElement,
  options: GoFishRenderOptions,
  child: GoFishChild | (() => GoFishChild)
): View | Promise<View> {
  // Component thunk (`() => node`): a raw shape/operator composition — no
  // `chart()` builder, no data binding — that we give the full reactive
  // treatment. A raw node is built once and can't re-evaluate its spec, so
  // component-level PIPELINE reactivity (a `signal()`/`wheel()` read outside
  // `live()`) needs a thunk the scheduler can re-invoke; and a `pointer()` read
  // in a `live()` needs the runtime installed for `data-gf-id` hit-testing. Both
  // fall out of routing the thunk through the same terminal the chart builders
  // use — a fresh InteractionRuntime, resolve under the ambient context, thread
  // the runtime only if something registered. A PLAIN node keeps today's exact
  // static behavior below (a `live()` channel on a plain node still patches at
  // paint — that's runtime-independent — it just gets no runtime/hit-testing).
  if (typeof child === "function") {
    const thunk = child;
    return renderWithInteraction(async () => {
      const node = await thunk();
      // A thunk can build the chart again, which `labelAngle: "auto"` needs
      // (see `GoFishNode.rebuild`).
      node.rebuild = async () => thunk();
      return { node, options: { ...options } };
    }, container);
  }

  const svgPadding = options.padding ?? PADDING;

  const stateHost = container as ChartHost;

  // Re-rendering into the same container must always dispose the previous Solid
  // root, or roots and DOM accumulate. TWO cases enter here with a prior state:
  //  1. A Tier-2 re-render of the SAME chart (the interaction scheduler, per
  //     spec change) — SAME runtime. Dispose only the old Solid root and keep
  //     the chart's state: the runtime is reused and must survive (disposing
  //     it would clear its rerenderFn/inputs and kill interactivity after one
  //     frame), and the chart's View must still recognize the chart as its own.
  //  2. A DIFFERENT chart taking over this container — dispose the old chart
  //     entirely, Solid root AND runtime, so an input it read (e.g. a timer)
  //     stops invalidating a dead chart whose container is now someone else's.
  const prev = stateHost.__gofishState;
  let state: ChartState;
  if (prev?.runtime !== undefined && prev.runtime === options.interaction) {
    prev.disposeRoot();
    state = prev;
  } else {
    disposeChart(container);
    state = { disposeRoot: () => {}, runtime: options.interaction };
  }

  const [layoutData] = createResource(() => runLayout(options, child));

  const dispose = solidRender(() => {
    // Suspense covers the async layout resource (derived data resolves in it).
    return (
      <Suspense fallback={<div>Loading...</div>}>
        {(() => {
          const data = layoutData();
          if (!data) return null;
          return renderLayout(
            data,
            svgPadding,
            options.defs,
            options.interaction
          );
        })()}
      </Suspense>
    );
  }, container);
  state.disposeRoot = () => {
    dispose();
    container.innerHTML = "";
  };
  stateHost.__gofishState = state;
  return viewOf(container, state);
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * Serialize an `<svg>` element to a standalone SVG markup string suitable for
 * writing to a `.svg` file: ensures the SVG/xlink namespaces and a `viewBox`
 * are present, and optionally paints a background rect. Works on a clone, so
 * the passed element is left untouched.
 */
export function serializeSVG(
  svg: SVGSVGElement,
  opts?: { background?: string | null }
): string {
  const el = svg.cloneNode(true) as SVGSVGElement;

  el.setAttribute("xmlns", SVG_NS);
  if (!el.getAttribute("xmlns:xlink")) el.setAttribute("xmlns:xlink", XLINK_NS);

  // viewBox so the SVG scales when a consumer overrides width/height.
  const width = el.getAttribute("width");
  const height = el.getAttribute("height");
  if (!el.getAttribute("viewBox") && width && height) {
    el.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  const background = opts?.background;
  if (background) {
    const rect = el.ownerDocument.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", background);
    el.insertBefore(rect, el.firstChild);
  }

  const markup = new XMLSerializer().serializeToString(el);
  return markup.startsWith("<?xml")
    ? markup
    : `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

/**
 * Produce a detached `<svg>` element for `child` by running the same
 * layout + render pipeline as `gofish()`, but mounting into a throwaway
 * container and returning a clone of the resulting SVG.
 *
 * Requires a DOM (browser or notebook front-end). In Node this throws —
 * headless rendering is tracked in #577.
 */
export async function gofishToSVGElement(
  options: GoFishExportOptions,
  child: GoFishNode | Promise<GoFishNode>
): Promise<SVGSVGElement> {
  if (typeof document === "undefined") {
    throw new Error(
      "toSVG requires a DOM (browser or notebook front-end). " +
        "Headless Node rendering is tracked in #577."
    );
  }
  const data = await runLayout(options, child);
  const svgPadding = options.padding ?? PADDING;
  const root = document.createElement("div");
  // Layout is already awaited, so the SVG mounts synchronously — no Suspense.
  const dispose = solidRender(
    () => renderLayout(data, svgPadding, options.defs),
    root
  );
  const svg = root.querySelector("svg");
  if (!svg) {
    dispose();
    throw new Error("toSVG: no <svg> element was produced by the render pass");
  }
  // Clone before disposing the reactive root so disposal can't strip it.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  dispose();
  return clone;
}

/** Produce a standalone SVG markup string for `child`. See {@link gofishToSVGElement}. */
export async function gofishToSVG(
  options: GoFishExportOptions,
  child: GoFishNode | Promise<GoFishNode>
): Promise<string> {
  return serializeSVG(await gofishToSVGElement(options, child), options);
}

/**
 * Write or download an SVG string to `filename`. Format is inferred from the
 * extension (only `.svg` today; PNG/HTML tracked in #578). In a browser this
 * triggers a download; in Node it writes the file.
 */
export async function saveSVGString(
  svg: string,
  filename: string
): Promise<void> {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  if (ext !== ".svg") {
    throw new Error(
      `save(): only ".svg" is supported today (got "${ext || filename}"). ` +
        "PNG and HTML export are tracked in #578."
    );
  }

  // Browser: trigger a download via a temporary anchor + object URL.
  if (
    typeof document !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  ) {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  // Node: write to disk. Dynamic import keeps `fs` out of the browser bundle;
  // the indirect specifier stops the bundler/TS from resolving it at build time.
  const fsModule = "node:fs/promises";
  const { writeFile } = (await import(/* @vite-ignore */ fsModule)) as {
    writeFile: (path: string, data: string, encoding: string) => Promise<void>;
  };
  await writeFile(filename, svg, "utf-8");
}

/** Layout + serialize + save for `child`. See {@link saveSVGString}. */
export async function gofishSave(
  filename: string,
  options: GoFishExportOptions,
  child: GoFishNode | Promise<GoFishNode>
): Promise<void> {
  await saveSVGString(await gofishToSVG(options, child), filename);
}

const PADDING = 40;

export const render = (
  {
    width,
    height,
    transform,
    defs,
    rightOverhang = 0,
    rightContentOverhang = 0,
    topOverhang = 0,
    leftOverhang = 0,
    bottomOverhang = 0,
    svgPadding,
    interaction,
    posScales,
    domains,
  }: {
    width: number;
    height: number;
    transform?: string;
    defs?: JSX.Element[];
    rightOverhang?: number;
    rightContentOverhang?: number;
    topOverhang?: number;
    leftOverhang?: number;
    bottomOverhang?: number;
    svgPadding?: number;
    interaction?: InteractionRuntime;
    posScales?: PixelPosScales;
    domains?: { x?: [number, number]; y?: [number, number] };
  },
  child: GoFishNode
): JSX.Element => {
  const pad = svgPadding ?? PADDING;

  // Chrome (axis tick/label rows, titles, the legend column) is elaborated into
  // ordinary shapes that live in the node tree; `render()` only sizes the SVG
  // around their measured extent. Content seated beyond the canvas by a
  // constraint (e.g. marginal histogram bands above/right of a scatter) is
  // measured the same way, via the per-side overhangs.
  //
  // Reserve enough on each gutter side to clear the measured overhang plus a
  // little breathing room from the SVG edge. The `o > 0` guard keeps a chart
  // with `padding: 0` and no chrome at zero reserve (don't invent EDGE_GAP px on
  // an empty gutter); and because gutters ≤ `pad - EDGE_GAP` are absorbed by the
  // existing `pad`, an untitled chart stays byte-identical to the pre-chrome
  // output.
  const EDGE_GAP = 8; // breathing room between gutter content and the SVG edge
  // Ceil: the reserve becomes the root <g> translate, and a fractional
  // translate (measured overhangs are routinely fractional — text widths)
  // shifts every shape off the pixel grid: adjacent area/bar segments grow
  // hairline antialiasing seams and text rasterizes fuzzy.
  const reserve = (o: number) =>
    o > 0 ? Math.ceil(Math.max(pad, o + EDGE_GAP)) : pad;
  const leftReserve = reserve(leftOverhang);
  const bottomReserve = reserve(bottomOverhang);
  const topReserve = reserve(topOverhang);

  // Right gutter = legend reservation + non-legend reserve. `rightOverhang` is
  // the legend column's overhang (0 when there's no legend); it keeps a full
  // `pad` margin beyond the column — the legend's historical reservation — via
  // `reserve(rightContentOverhang)`, whose floor is `pad` (so a legend chart
  // reserves `legendOverhang + pad`, byte-identical). `rightContentOverhang` is
  // any NON-legend content displaced past the right edge (a marginal band);
  // routing it through the same `reserve()` as the other gutters absorbs a small
  // x-tick spill into `pad` (plain axis charts stay byte-identical) and reserves
  // a large band's full extent plus `EDGE_GAP`. The right gutter bears no root
  // <g> translate, so it needn't be pixel-snapped — a fractional width is
  // harmless (legend overhangs are fractional text widths).
  // Two-pass render: lower the baked scenegraph into the display-list IR, then
  // paint each item. Items are final absolute pixels. Layout geometry is
  // already SVG-native y-DOWN (see `axisDirection.ts`), so the map only offsets
  // by the gutter reserves. It is also the layout-pixel → screen map the
  // interaction layer publishes for hit-test / dataPos reads.
  const toPixel: ToPixel = ([gx, gy]) => [gx + leftReserve, gy + topReserve];
  const interactive = interaction !== undefined;
  const paintBaked = () => {
    const __tLower = perfNow();
    const items = lowerToDisplayList(child, toPixel);
    perfAdd("lower", perfNow() - __tLower);
    perfSetCount("displayItems", items.length);
    // Publish the frame (id-keyed hit-test map + data-space conversions) before
    // paint so the first hit-test / dataPos reads see the current frame.
    interaction?.publishFrame({
      items,
      toPixel,
      posScales,
      domains,
      size: { width, height },
    });
    const __tPaint = perfNow();
    const painted = items.map((item) => paintSVG(item, interactive));
    perfAdd("paint", perfNow() - __tPaint);
    return painted;
  };
  return (
    <svg
      ref={(el: SVGSVGElement) => interaction?.attachSVG(el)}
      width={
        leftReserve + width + rightOverhang + reserve(rightContentOverhang)
      }
      height={topReserve + height + bottomReserve}
      xmlns="http://www.w3.org/2000/svg"
    >
      <Show when={defs}>
        <defs>{defs}</defs>
      </Show>
      {paintBaked()}
    </svg>
  );
};
