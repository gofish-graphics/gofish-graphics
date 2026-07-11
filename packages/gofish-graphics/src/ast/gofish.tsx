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
import {
  posScaleFromSpace,
  axisScale,
  posFn,
  type AxisMap,
  type AxisScale,
} from "./domain";
import { bake } from "./coordinateTransforms/bake";
import { lowerToDisplayList, makeToPixelFor } from "./displayList/lower";
import { paintSVG } from "./displayList/paintSVG";
import type { InteractionRuntime } from "../interaction/runtime";
import { renderWithInteraction } from "../interaction/renderTerminal";
import type { ToPixel } from "./_node";
import type { FlipScope } from "./_displayObject";
import type { Size } from "./dims";
import {
  continuousInterval,
  hasBaseline,
  isBaselineMagnitude,
  isCONTINUOUS,
  niceContinuous,
  spaceMeasure,
  type UnderlyingSpace,
} from "./underlyingSpace";
import { shadowCheckScaleRoot } from "./solver/shadow";
import {
  perfNow,
  perfAdd,
  perfBeginRun,
  perfEnabled,
  perfSetCount,
} from "./perf";
import {
  elaborateAxes,
  elaborateAxisTitles,
  X_TITLE_NAME,
} from "./axes/elaborate";
import { getScopeRegistry, type EqualMeasureAxis } from "./solver/scopes";
import { elaborateLegend, legendOverhang } from "./legends/elaborate";
import { elaborateLabels } from "./labels/elaborate";

export type CategoricalScale = {
  color: Map<any, string>;
  colorConfig?: ColorConfig;
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
export type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
/** `side` (issue #143/#16): which frame edge the axis seats on — `"start"` (the
 *  near/origin side — top for a y-DOWN frame, bottom for y-UP) or `"end"` (the
 *  far side). Frame-relative, matching the start/end vocabulary of
 *  alignment/distribute. When OMITTED, a continuous/difference X-axis defaults to
 *  the visual BOTTOM regardless of the frame's flip (see `axisSide` in
 *  `elaborate.tsx`); an explicit `side` overrides that with the literal
 *  frame-relative seating. */
export type AxisOptions =
  | boolean
  | {
      title?: string | false;
      side?: "start" | "end";
      /** Rotate tick/category labels by this many degrees, clockwise on screen
       *  — matches Vega-Lite's `labelAngle` (e.g. `45` slants a label down to
       *  the right, `90` reads top-to-bottom). Manual only: there is no
       *  "auto" collision-avoidance mode (deferred, see #486).
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
      labelAngle?: number | number[];
    };

/** Per-dim axis `side` AS AUTHORED — `undefined` where the caller did not specify
 *  one, so the elaboration can tell an explicit `"start"` (literal frame-relative
 *  seating) apart from the default (a continuous x-axis defaults to the bottom). */
export function resolveAxisSides(
  axes: AxesOptions | undefined
): ["start" | "end" | undefined, "start" | "end" | undefined] {
  const sideOf = (o: AxisOptions | undefined): "start" | "end" | undefined =>
    o && typeof o === "object" ? o.side : undefined;
  if (axes && typeof axes === "object") return [sideOf(axes.x), sideOf(axes.y)];
  return [undefined, undefined];
}

/** Per-dim `labelAngle` AS AUTHORED — `undefined` where unset, matching
 *  `resolveAxisSides`'s shape. A `number` applies to every tier; a
 *  `number[]` is per-tier, innermost first (see `AxisOptions.labelAngle`). */
export function resolveAxisLabelAngles(
  axes: AxesOptions | undefined
): [number | number[] | undefined, number | number[] | undefined] {
  const angleOf = (
    o: AxisOptions | undefined
  ): number | number[] | undefined =>
    o && typeof o === "object" ? o.labelAngle : undefined;
  if (axes && typeof axes === "object")
    return [angleOf(axes.x), angleOf(axes.y)];
  return [undefined, undefined];
}

// Fallback extent for an omitted `w`/`h` on a POSITION or data-driven SIZE axis,
// which needs a concrete canvas to scale data into (see the per-axis comment in
// `layout()` for the full behavior, including the shrink-to-fit case).
const DEFAULT_CANVAS_SIZE = 400;

// string: custom title, false: no title, undefined: infer from encoding
function resolveAxisTitle(
  axisOpt: AxisOptions | undefined
): string | false | undefined {
  if (axisOpt === undefined || axisOpt === false) return false;
  if (axisOpt === true) return undefined; // infer from the space measure
  return axisOpt.title;
}

function resolveAxisTitles(
  axes: AxesOptions | undefined,
  measures?: { x?: string; y?: string }
): { xTitle: string | undefined; yTitle: string | undefined } {
  let xTitleOpt: string | false | undefined = false;
  let yTitleOpt: string | false | undefined = false;
  if (axes === true) {
    xTitleOpt = undefined;
    yTitleOpt = undefined;
  } else if (axes && typeof axes === "object") {
    xTitleOpt = resolveAxisTitle(axes.x);
    yTitleOpt = resolveAxisTitle(axes.y);
  }
  return {
    xTitle: xTitleOpt === false ? undefined : (xTitleOpt ?? measures?.x),
    yTitle: yTitleOpt === false ? undefined : (yTitleOpt ?? measures?.y),
  };
}

/** True if `node` or any descendant satisfies `pred`. Shared depth-first walk
 *  behind the whole-subtree y-up triggers below. */
const subtreeHas = (
  node: GoFishNode,
  pred: (n: GoFishNode) => boolean
): boolean => {
  if (pred(node)) return true;
  const kids = node.children as (GoFishNode | unknown)[] | undefined;
  if (kids)
    for (const k of kids)
      if (k instanceof GoFishNode && subtreeHas(k, pred)) return true;
  return false;
};

/** True if `node` or any descendant is a `coord` node (polar/clock/wavy). A
 *  coordinate system flips its own scope (`resolveNodeFlip` in bake), so the
 *  chart-level chrome must follow it to the visual edge even when the root y is
 *  UNDEFINED (a pie's `count` has no cartesian y). The right convention for
 *  polar/coord is still open (#662); until then the presence of one anywhere is a
 *  chrome-mirror trigger, exactly as the pre-#629 global flip treated it. */
const subtreeHasCoord = (node: GoFishNode): boolean =>
  subtreeHas(node, (n) => (n as { type?: string }).type === "coord");

export async function layout(
  {
    w,
    h,
    x,
    y,
    transform,
    debug = false,
    axes = false,
    yUp = false,
  }: {
    w?: number;
    h?: number;
    x?: number;
    y?: number;
    transform?: { x?: number; y?: number };
    debug?: boolean;
    defs?: JSX.Element[];
    axes?: AxesOptions;
    yUp?: boolean;
  },
  child: GoFishNode | Promise<GoFishNode>,
  contexts?: {
    session: RenderSession;
  }
): Promise<{
  underlyingSpaceX: UnderlyingSpace;
  underlyingSpaceY: UnderlyingSpace;
  yUp: boolean;
  rootFlipsWhole: boolean;
  scales: Size<AxisScale | undefined>;
  child: GoFishNode;
  width: number;
  height: number;
  rightOverhang: number;
  rightContentOverhang: number;
  topOverhang: number;
  leftOverhang: number;
  bottomOverhang: number;
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

  // const domainAST = child.inferDomain();
  // const sizeThatFitsAST = domainAST.sizeThatFits();
  // const layoutAST = sizeThatFitsAST.layout();
  // return render({ width, height, transform }, layoutAST);
  const __tResolve = perfNow();
  child.resolveColorScale();
  child.resolveNames();
  // Resolve coordinate-space axis aliases (polar theta/r/…) into x/y/w/h BEFORE
  // space inference reads the dims. Top-down + scope-bounded (see resolveAliases).
  child.resolveAliases();
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
      yUp,
      false,
      resolveAxisLabelAngles(axes)
    );
    titleAnchors = elaborated.titleAnchors;
    if (elaborated.changed) {
      child = elaborated.node;
      if (contexts?.session) child.setRenderSession(contexts.session);
      child.resolveColorScale();
      child.resolveNames();
      // The rewrite inserted new nodes (wrappers + axis shapes) and moved keys
      // onto wrappers; `resolveUnderlyingSpace` memoizes, so clear every node's
      // cached space and recompute the whole tree from scratch.
      child.clearUnderlyingSpace();
      child.resolveUnderlyingSpace();
    }
  }

  // Label elaboration: turn every `.label(...)` spec into a real `Text` node +
  // constraints (src/ast/labels/elaborate.tsx), the same technique the axis
  // pass above uses. Runs after axis elaboration (a label may target a node
  // an axis pass just wrapped) and before the contentNode/title/legend passes
  // below, so a label's own bbox is folded into what those passes measure.
  const labelRes = await elaborateLabels(child, { yUp });
  if (labelRes.changed) {
    child = labelRes.node;
    if (contexts?.session) child.setRenderSession(contexts.session);
    child.resolveNames();
    child.clearUnderlyingSpace();
    child.resolveUnderlyingSpace();
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
  const niceUnderlyingSpaceX = rootAxisDemand[0]
    ? niceContinuous(child._underlyingSpace![0])
    : child._underlyingSpace![0];
  const niceUnderlyingSpaceY = rootAxisDemand[1]
    ? niceContinuous(child._underlyingSpace![1])
    : child._underlyingSpace![1];

  // y-orientation is a PER-SCOPE property resolved at bake time (issue #629): the
  // bake walk opens a y-up mirror at each topmost continuous-y node and mirrors
  // about its own placed band, so a continuous chart grows up while an ordinal-y
  // neighbor (a heatmap beside a bar chart) stays y-down — no single global root
  // decision. The scope opens at the plot CONTENT (the chrome wrappers are
  // `_scopeTransparent`), so a chart's chrome (legend column, axis titles) is NOT
  // a member of the scope: its INTERIOR renders in the ambient frame (glyphs,
  // legend row order, colorbar direction), while its BOX is placed by the plot's
  // frame — the bake box-mirrors `_ambientYDown` chrome about the plot's flip
  // scope (a parent's orientation places a child's box, never re-interprets its
  // interior). Three layout-time orientation bits fall out:
  //  - `chromeYUp`: the AMBIENT orientation the chrome INTERIOR builders read
  //    (legend swatch order, colorbar value direction, axis-title rotation) —
  //    y-down unless the explicit global `options.yUp` flips the whole canvas.
  //  - `rootFlipsWhole`: whether the ROOT content node itself opens ONE canvas-
  //    wide flip scope that its whole subtree inherits (mirrors about `[0, finalH]`)
  //    — a continuous root y (a plain bar/line chart) or the global override. It
  //    stays NARROW: a per-scope opener BELOW the root (a `coord`, a continuous
  //    subtree inside an UNDEFINED-root free-space mix, or a facet cell) mirrors
  //    about its OWN band, never this canvas frame, and an ORDINAL root does NOT
  //    flip as a whole (a faceted scatter keeps its panels in natural order; its
  //    shared continuous axis is instead defaulted to the bottom edge, see the
  //    axis-side note below). This gates the `_rootFlipScope` stamp. #629.
  //  - `chromeFlipsY`: whether the ROOT frame the chrome annotates mirrors about
  //    the canvas — so a chart's chrome (y-title, legend column, colorbar, and an
  //    ordinal-x title) box-mirrors to the same VISUAL edge as the flipped
  //    content. It is `rootFlipsWhole` PLUS a `coord` at the root: a pie/clock has
  //    an UNDEFINED root y (no cartesian flip) but its `coord` opens its own scope
  //    that fills the canvas, so its chrome must still follow. It deliberately does
  //    NOT fire on a continuous DESCENDANT under an ordinal/undefined root (a
  //    faceted stack, a unit chart): that content flips per-scope BELOW the root,
  //    the root chrome frame does not mirror, and a chart-level title that
  //    mirrored there would split from its (unflipped) axis. The chart-level
  //    CONTINUOUS x-axis is the one exception, handled by seating it (and its
  //    title) on the far edge directly — see the axis-side note. This gates the
  //    `_chromeFrame` stamp and the legend's abstract frame. See #629/#143/#16.
  const chromeYUp = yUp;
  const rootFlipsWhole = yUp || isCONTINUOUS(niceUnderlyingSpaceY);
  const chromeFlipsY = rootFlipsWhole || subtreeHasCoord(child);
  //  - `xTitleSeatsFar`: a CONTINUOUS x-axis whose frame does NOT flip at all
  //    (`!chromeFlipsY` — an ordinal cross y AND no `coord`: a horizontal bar, a
  //    faceted stack). `elaborateAxes` seats such a line on the FAR edge directly
  //    (no mirror), so its title is authored to match and its box-mirror is
  //    suppressed below — the two stay together at the visual bottom instead of the
  //    title lifting above. A `coord` chart (a pie) is EXCLUDED: its frame flips via
  //    the coord scope, so its x-axis and title mirror like any flipped frame. Only
  //    the DEFAULT (unspecified) side seats far — an explicit `side` is honored
  //    literally, matching the axis line.
  const xSideOpt = resolveAxisSides(axes)[0];
  const xTitleSeatsFar =
    xSideOpt === undefined &&
    isCONTINUOUS(niceUnderlyingSpaceX) &&
    !chromeFlipsY;

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
  const { xTitle, yTitle } = resolveAxisTitles(axes, titleMeasures);
  if (xTitle !== undefined || yTitle !== undefined) {
    // The x-axis title is authored at the SAME abstract side as its axis LINE, so
    // the two stay together and land at the same visual edge (#143/#16/#629):
    //  - `xTitleSeatsFar` (a DEFAULT continuous x over a non-flipping frame — a
    //    horizontal bar, a faceted stack): `elaborateAxes` seated the line on the
    //    far "end" edge directly, so the title matches and its box-mirror is
    //    suppressed (see the chrome-frame stamp) — else it would lift above the
    //    line. `titleSides[0] = "end"`.
    //  - default continuous x on a FLIPPING frame (a scatter, a `coord` pie): the
    //    line is authored "start" and mirrors to the bottom, so the title rides
    //    along on "start". `titleSides[0] = "start"`.
    //  - an EXPLICIT `side`, or an ordinal x: honored literally (`baseSides[0]`,
    //    defaulting to "start"), mirroring with the content like any chrome.
    // The y-title (left gutter) is untouched — the vertical flip never moves it.
    const baseSides = resolveAxisSides(axes);
    const titleSides: ["start" | "end", "start" | "end"] = [
      xTitleSeatsFar ? "end" : (baseSides[0] ?? "start"),
      baseSides[1] ?? "start",
    ];
    child = await elaborateAxisTitles(child, {
      xTitle,
      yTitle,
      anchors: titleAnchors,
      plotNode,
      yUp: chromeYUp,
      sides: titleSides,
    });
    if (contexts?.session) child.setRenderSession(contexts.session);
    // The title pass introduces `ref()` stand-ins (to the axis line / plot) that
    // resolve their `selectedNode` during name resolution — without this they'd
    // throw "Selected node not found" at layout time. Mirror the axes block:
    // re-resolve names, then underlying space (memoized — only the new nodes).
    child.resolveNames();
    child.resolveUnderlyingSpace();
  }

  // Legend elaboration: turn the color scale into an ordinary subtree seated
  // beside the (now possibly titled) content (src/ast/legends/elaborate.tsx) —
  // a swatch column for a categorical scale, or a colorbar for a continuous
  // (gradient) one. Runs after the last resolveColorScale (it consumes the
  // resolved scale; legend fills are literal strings, never isValue, so the
  // scale pass is NOT re-run). The wrapper preserves the content's underlying
  // spaces (unionChildSpaces ignores the legend's UNDEFINED spaces), so the
  // nice spaces captured above remain valid.
  let legendAdded = false;
  const unitScale = contexts?.session.scaleContext.unit;
  const hasLegend =
    (isCategoricalScale(unitScale) && unitScale.color.size > 0) ||
    isContinuousColorScale(unitScale);
  if (hasLegend && unitScale) {
    // The legend entries should read top→bottom. The swatch column is chrome
    // (`_ambientYDown`, #629): its INTERIOR renders in the ambient frame, where a
    // `Spread({dir:"y"})` already reads top→bottom — no `reverse` unless the
    // whole canvas is forced y-up by `options.yUp` (`chromeYUp`). Its BOX aligns
    // against the plot's abstract frame (`chromeFlipsY`) and is box-mirrored by
    // the bake when the plot flips, landing top-aligned on screen. #143/#16/#629.
    child = await elaborateLegend(
      child,
      unitScale as CategoricalScale | ContinuousColorScale,
      chromeYUp,
      chromeFlipsY
    );
    legendAdded = true;
    if (contexts?.session) child.setRenderSession(contexts.session);
    child.resolveUnderlyingSpace(); // memoized: computes only the new nodes
  }
  perfAdd("axes", perfNow() - __tAxes);

  if (debug) {
    console.log("🌳 Underlying Space Tree:");
    debugUnderlyingSpaceTree(child);
  }

  // An omitted overall dimension is resolved per axis from its root underlying
  // space:
  //  - POSITION / data-driven SIZE (a scatter axis, or bar heights = value):
  //    there's data to scale into pixels, so fall back to a concrete canvas
  //    (DEFAULT_CANVAS_SIZE).
  //  - ORDINAL / UNDEFINED (a bar chart's category axis, or a bare fixed-size
  //    shape): nothing to scale, so lay out *unsized* — marks keep their default
  //    sizes and the operator shrinks to fit. The natural extent is recovered by
  //    the `finalDim` readback below, so the SVG is still sized concretely.
  // Unsized axes are handed `UNSIZED` (NaN); marks treat a non-finite size as
  // "use my default" (e.g. rect's DEFAULT_RECT_SIZE) via their `Number.isFinite`
  // guards, the same path the layout engine already relies on.
  const UNSIZED = NaN;
  const needsCanvas = (s: UnderlyingSpace) => hasBaseline(s);
  // Concrete canvas for scaling a CONTINUOUS axis (always a real number).
  const canvasW = w ?? DEFAULT_CANVAS_SIZE;
  const canvasH = h ?? DEFAULT_CANVAS_SIZE;
  // Size handed to `child.layout`: a shrink-to-fit axis is left unsized.
  const layoutW = w ?? (needsCanvas(niceUnderlyingSpaceX) ? canvasW : UNSIZED);
  const layoutH = h ?? (needsCanvas(niceUnderlyingSpaceY) ? canvasH : UNSIZED);

  // The render's σ-scope registry: the ONE place σ / posScale is derived
  // (Stage 6b). The root is the first scope root; every other scope (self-scaled
  // axis, constraint budget, shared, coord boundary) solves through the same
  // registry. Reset so a re-run layout pass starts clean.
  const scopes = getScopeRegistry(contexts?.session);
  scopes.reset();

  // An anchored CONTINUOUS root builds a data→pixel map over its data interval —
  // the root POSITION scope solved by the registry.
  const posScales: Size<AxisMap | undefined> = [
    scopes.solvePosition(
      { kind: "root", rootKey: "root", axis: 0 },
      niceUnderlyingSpaceX,
      canvasW
    ),
    scopes.solvePosition(
      { kind: "root", rootKey: "root", axis: 1 },
      niceUnderlyingSpaceY,
      canvasH
    ),
  ];

  if (debug) {
    console.log("width and height constraints:", layoutW, layoutH);
  }

  // Root scale factor: a baseline magnitude ("free") root inverts its Monotonic
  // against the canvas — the root SIZE scope, solved by the same registry.
  // Anchored roots use the posScale (above) instead; a difference root
  // shrink-to-fits.
  const rootScaleFactors: Size<number | undefined> = [
    isBaselineMagnitude(niceUnderlyingSpaceX)
      ? scopes.solveSize(
          { kind: "root", rootKey: "root", axis: 0 },
          niceUnderlyingSpaceX.width,
          canvasW
        )
      : undefined,
    isBaselineMagnitude(niceUnderlyingSpaceY)
      ? scopes.solveSize(
          { kind: "root", rootKey: "root", axis: 1 },
          niceUnderlyingSpaceY.width,
          canvasH
        )
      : undefined,
  ];

  // Shared-measure scale equality (#582): when x and y carry the SAME unit of
  // measure, "1 unit on x" and "1 unit on y" are the same quantity, so their
  // data→pixel scales must be equal — a circle stays circular, a 45° line looks
  // 45°. This is type equality, not an opt-in knob: it follows from the measures
  // matching, the same way `circle({ r })` lowers to a `w`/`h` that share a
  // measure and so cannot render as an ellipse. Each axis's pixels-per-data-unit
  // comes from its POSITION domain (`canvas / range`) or its baseline-magnitude
  // σ. The scope-level operation — take the binding (smaller) σ and equate both
  // axes' scopes — lives on the registry (Stage 6c: the ONE post-solve σ
  // adjustment, so every slope stays registry-sourced and the dump shows the
  // FINAL σ). Silently skipped when an axis has no continuous scale to equate.
  const measureX = spaceMeasure(niceUnderlyingSpaceX);
  const measureY = spaceMeasure(niceUnderlyingSpaceY);
  if (measureX !== undefined && measureX === measureY) {
    const axisInfo = ([0, 1] as const).map(
      (axis): EqualMeasureAxis | undefined => {
        const space = axis === 0 ? niceUnderlyingSpaceX : niceUnderlyingSpaceY;
        const canvas = axis === 0 ? canvasW : canvasH;
        const ival = continuousInterval(space);
        if (ival !== undefined && ival.max > ival.min) {
          const range = ival.max - ival.min;
          return {
            kind: "position",
            unitPx: canvas / range,
            min: ival.min,
            range,
            canvas,
          };
        }
        const sigma = rootScaleFactors[axis];
        if (sigma !== undefined) return { kind: "size", unitPx: sigma };
        return undefined;
      }
    ) as [EqualMeasureAxis | undefined, EqualMeasureAxis | undefined];
    scopes.recenterEqualMeasure("root", axisInfo, posScales, rootScaleFactors);
  }

  // Solver shadow (#39): the ROOT σ-scope — the SIZE frame equation
  // content(σ)=canvas the whole chart resolves against. No-op unless
  // GOFISH_SOLVER_CHECK is set.
  shadowCheckScaleRoot(niceUnderlyingSpaceX, canvasW, rootScaleFactors[0], 0);
  shadowCheckScaleRoot(niceUnderlyingSpaceY, canvasH, rootScaleFactors[1], 1);

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
  // `posScales`. They are mutually exclusive per axis at the root.
  const rootScales: Size<AxisScale | undefined> = [
    axisScale(rootScaleFactors[0], posScales[0]),
    axisScale(rootScaleFactors[1], posScales[1]),
  ];

  const __tSolve = perfNow();
  child.layout([layoutW, layoutH], rootScales);
  perfAdd("solve", perfNow() - __tSolve);
  // Scope dump (#39 Stage 6b): every σ-scope solved during the layout pass just
  // above, as printable frame equations. No-op unless GOFISH_DUMP_SCOPES is set.
  scopes.dump();
  // Root placement anchor. A GIVEN dimension keeps the baseline-anchored canvas
  // box [0, given]; content seated outside it (axis labels below 0, ticks above
  // `given`) is reserved as the per-side overhangs below. A SHRINK-TO-FIT
  // dimension makes the canvas box the content's full [min, max] extent, so pin
  // its `min` edge to 0 — content then fills [0, size] and every overhang
  // formula computes 0 for that axis. Leaving `min` off origin is the #574
  // double-count: the overhangs re-reserve it as a phantom band (a negative
  // `min` bloats the canvas via `-min`; a positive one gaps the near side and
  // overhangs the far side, e.g. the pulley diagram). The pin uses `pinAnchor`,
  // not the write-once `place()`, so it lands even when the root self-placed (a
  // diagram with its own root transform) — `place()` short-circuits a placed axis.
  const placeRoot = (axis: "x" | "y", value: number, shrinkToFit: boolean) =>
    shrinkToFit
      ? child.pinAnchor(axis, value, "min")
      : child.place(axis, value, "baseline");
  placeRoot("x", x ?? transform?.x ?? 0, w === undefined);
  placeRoot("y", y ?? transform?.y ?? 0, h === undefined);

  // Final extent: a user-given dimension is authoritative; otherwise prefer the
  // content's laid-out intrinsic size (shrink-to-fit), falling back to the
  // canvas default when the content didn't report one. Read off `contentNode`
  // (== `child` when no title/legend wrapper), never an outer wrapper — so the
  // canvas stays content-relative; title and legend extents are reserved
  // separately as measured gutters below.
  const finalDim = (i: 0 | 1, given: number | undefined): number => {
    if (given !== undefined) return given;
    const s = contentNode.dims[i]?.size;
    return s !== undefined && Number.isFinite(s) ? s : DEFAULT_CANVAS_SIZE;
  };
  const finalW = finalDim(0, w);
  const finalH = finalDim(1, h);

  // The canvas y-flip frame (issue #629): the whole-plot band `[0, finalH]` the
  // old global flip mirrored about (`data.height`). finalH is only known here,
  // and the canvas origin (0) is NOT recoverable from a node's placed bbox (a
  // shrink-to-fit pin can offset it), so it is stamped authoritatively rather
  // than re-derived by the bake. Feeds both the root-content scope stamp below
  // and the chrome frame.
  const canvasFrame: FlipScope = { baseY: 0, height: finalH };

  // Stamp the ROOT plot content with the canvas y-flip frame (issue #629), when
  // the root plot flips as a WHOLE (`rootFlipsWhole`). The bake walk opens the
  // y-up scope at `contentNode` (the plot, inside any scope-transparent
  // title/legend chrome) and mirrors about THIS frame; the whole subtree inherits
  // it (no double flip). The bake honors this stamp even for an ordinal root y (a
  // faceted-by-y chart) — an explicit whole-plot decision overriding the per-node
  // `declaredYUp` rule. A scope that opens BELOW the canvas frame (a `coord`, a
  // continuous subtree inside an UNDEFINED-root free-space mix) is not
  // `contentNode`, carries no stamp, and mirrors about its own placed band. Stamp
  // UNCONDITIONALLY every layout (undefined when the root does not flip whole) so
  // no stale frame from a prior layout of the same node tree survives an
  // option/data change — a re-layout that turns `rootFlipsWhole` false must clear
  // the previous `{baseY, height}`, or the bake would mirror about a dead frame
  // (#629, stale-scope finding).
  contentNode._rootFlipScope = rootFlipsWhole ? canvasFrame : undefined;

  // Stamp the chrome placement frame (issue #629) directly on each OUTERMOST
  // `_ambientYDown` chrome subtree (axis titles, legend column, colorbar), so the
  // bake reads `node._chromeFrame` instead of searching up through the
  // scope-transparent wrappers on every visit. The frame is the WHOLE-plot canvas
  // band: the chart-level chrome spans the whole plot, so it mirrors about the
  // canvas even when the content flips per-scope BELOW the root (a `coord`'s own
  // scope) — which is why the gate is the whole-subtree `chromeFlipsY`, not the
  // narrower root-only `rootFlipsWhole`. The bake box-mirrors a chrome box about it (its interior
  // still renders ambient). Only when the plot mirrors somewhere — otherwise
  // chrome passes through unchanged, and a re-layout that turns `chromeFlipsY`
  // false stamps nothing (the chrome subtrees are freshly rebuilt by the
  // elaboration passes each layout, so no stale frame survives). The walk stops
  // at `contentNode` (never descends into the plot) and at the outermost ambient
  // node of each chrome subtree (its descendants render ambient — a second mirror
  // would double-flip). #629 chrome-frame finding.
  if (chromeFlipsY) {
    const frame = canvasFrame;
    const stampChrome = (n: GoFishNode): void => {
      if (n === contentNode) return;
      if (n._ambientYDown === true) {
        // Suppress the box-mirror for a far-seated continuous x-axis title
        // (`xTitleSeatsFar`): `elaborateAxes` already placed its line on the far
        // edge directly and the title was authored to match (see `titleSides`), so
        // mirroring it here would lift it back above the line. Every other chrome
        // node (y-title, legend, colorbar) still mirrors.
        if (n._name === X_TITLE_NAME && xTitleSeatsFar) return;
        n._chromeFrame = frame;
        return;
      }
      for (const c of n.children) if (c instanceof GoFishNode) stampChrome(c);
    };
    stampChrome(child);
  }

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
  // The y overhang sides. Historically top ← (max − finalH) and bottom ←
  // (−min); the curated corpus depends on that mapping even where it is not
  // the painted truth (an unflipped chart's bottom chrome absorbed into the
  // top reserve), so it stays the default. The one case that genuinely needs
  // the PAINTED mapping is a fixed-pitch chain's amplitude allowance: its
  // rows mirror about their chained anchors at paint, the layer bbox fold
  // extends the box ABOVE the chain head accordingly (`paintedYBand`,
  // layer.tsx — stamped as `_pitchPaintedTopSpill`), and on an unflipped
  // root that negative min is painted-TOP content (January's ridge peak)
  // while max-past-finalH (the x-axis chrome) is painted-bottom. Detecting
  // the stamp — not just any negative min — keeps every legacy story
  // byte-identical. `_pitchPaintedTopSpill` is propagated as a SUBTREE max
  // during the layer bbox fold (layer.tsx), so this is an O(1) field read on
  // `child` rather than a fresh recursive walk down the whole tree.
  const layoutMaxOverhang = Math.max(0, child.dims[1].max! - finalH);
  const layoutMinOverhang = Math.max(0, -child.dims[1].min!);
  const paintedSides =
    !rootFlipsWhole &&
    layoutMinOverhang > 0 &&
    child._pitchPaintedTopSpill !== undefined &&
    child._pitchPaintedTopSpill > 0;
  const topOverhang = paintedSides ? layoutMinOverhang : layoutMaxOverhang;
  const bottomOverhang = paintedSides ? layoutMaxOverhang : layoutMinOverhang;
  const leftOverhang = Math.max(0, -child.dims[0].min!);

  if (debug) {
    console.log("🌳 Node Tree:");
    debugNodeTree(child);
  }

  return {
    underlyingSpaceX: niceUnderlyingSpaceX,
    underlyingSpaceY: niceUnderlyingSpaceY,
    yUp,
    rootFlipsWhole,
    scales: rootScales,
    child,
    width: finalW,
    height: finalH,
    rightOverhang,
    rightContentOverhang,
    topOverhang,
    leftOverhang,
    bottomOverhang,
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
  colorConfig?: ColorConfig;
  padding?: number;
  /**
   * y-UP render scope (issue #143/#16): when true the root `toPixel` mirrors y
   * about the canvas height — the convention charts want (bars grow up, y-axis
   * increases upward). Default (free space, raw `gofish()`) is y-DOWN: a
   * top-left origin where a vertical list reads top→bottom. `chart()` threads
   * this true; a true y-up coordinate transform (the follow-up) will later make
   * this composable per-subtree instead of root-global.
   */
  yUp?: boolean;
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
  /**
   * The explicit global y-UP override (`options.yUp`). Per-scope orientation
   * (continuous-y subtrees) is decided independently at bake via the flip scopes
   * stamped in `layout()`; this only forces a whole-canvas y-up ambient. See
   * #629/#143/#16.
   */
  yUp: boolean;
  /**
   * Whether the ROOT plot content flips as a whole about the canvas band
   * (`yUp || isCONTINUOUS(root-y)`) — the decision behind the `_rootFlipScope`
   * stamp. Unlike `yUp` (the global override only), this also captures the
   * per-scope continuous-y auto-flip, so the interaction frame's root
   * data→pixel map (`toPixel`) matches what the plot actually paints. #629.
   */
  rootFlipsWhole: boolean;
  scales: Size<AxisScale | undefined>;
  child: GoFishNode;
  width: number;
  height: number;
  rightOverhang: number;
  rightContentOverhang: number;
  topOverhang: number;
  leftOverhang: number;
  bottomOverhang: number;
};

/**
 * Run the domain-inference + layout passes for `child` and return the
 * measured layout data. The single place the pipeline is driven — shared by
 * the live `gofish()` render path and the `gofishToSVG*` export paths.
 */
export async function runLayout(
  options: GoFishRenderOptions,
  child: GoFishNode | Promise<GoFishNode>
): Promise<LayoutData> {
  const {
    w,
    h,
    x,
    y,
    transform,
    debug = false,
    defs,
    axes = false,
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
      { w, h, x, y, transform, debug, defs, axes, yUp: options.yUp },
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
): [number, number] | undefined =>
  us?.kind === "continuous" &&
  us.dataDomain !== undefined &&
  us.dataDomain !== "delta"
    ? [us.dataDomain.min, us.dataDomain.max]
    : undefined;

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
      // The resolved y-up decision (root y space), computed in `layout()`.
      yUp: data.yUp,
      // The root-content whole-plot flip (incl. continuous-y auto-flip), so the
      // interaction frame's root data→pixel map matches the painted orientation.
      rootFlipsWhole: data.rootFlipsWhole,
      rightOverhang: data.rightOverhang,
      rightContentOverhang: data.rightContentOverhang,
      topOverhang: data.topOverhang,
      leftOverhang: data.leftOverhang,
      bottomOverhang: data.bottomOverhang,
      interaction,
      // Root data → gofish-space maps, read off the recorded root scales for
      // the interaction layer's data↔px conversions (frameConversions).
      posScales: [posFn(data.scales[0]?.map), posFn(data.scales[1]?.map)],
      domains: {
        x: continuousDomain(data.underlyingSpaceX),
        y: continuousDomain(data.underlyingSpaceY),
      },
    },
    data.child
  );
}

export const gofish = (
  container: HTMLElement,
  options: GoFishRenderOptions,
  child:
    | GoFishNode
    | Promise<GoFishNode>
    | (() => GoFishNode | Promise<GoFishNode>)
): HTMLElement | Promise<HTMLElement> => {
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
    const thunk = child as () => GoFishNode | Promise<GoFishNode>;
    return renderWithInteraction(
      async () => ({ node: await thunk(), options: { ...options } }),
      container
    );
  }

  const svgPadding = options.padding ?? PADDING;

  type GofishState = {
    dispose: () => void;
    runtime?: InteractionRuntime;
  };
  const stateHost = container as HTMLElement & { __gofishState?: GofishState };

  // Re-rendering into the same container must always dispose the previous Solid
  // root, or roots and DOM accumulate. TWO cases enter here with a prior state:
  //  1. A Tier-2 re-render of the SAME chart (the interaction scheduler, per
  //     spec change) — SAME runtime. Dispose only the old Solid root; the
  //     runtime is reused and must survive (disposing it would clear its
  //     rerenderFn/inputs and kill interactivity after one frame).
  //  2. A DIFFERENT chart taking over this container — dispose the old Solid
  //     root AND the old runtime, so a still-live input (e.g. a running timer
  //     the previous chart never stopped) stops zombie-invalidating a dead
  //     chart whose container is now someone else's.
  const prev = stateHost.__gofishState;
  if (prev) {
    prev.dispose();
    if (prev.runtime && prev.runtime !== options.interaction) {
      prev.runtime.dispose();
    }
  }

  const [layoutData] = createResource(() => runLayout(options, child));

  // Render to the provided container
  const dispose = solidRender(() => {
    // used to handle async rendering of derived data
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
  stateHost.__gofishState = {
    dispose: () => {
      dispose();
      container.innerHTML = "";
    },
    runtime: options.interaction,
  };
  return container;
};

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
    yUp = false,
    rootFlipsWhole = yUp,
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
    yUp?: boolean;
    rootFlipsWhole?: boolean;
    interaction?: InteractionRuntime;
    posScales?: [
      ((pos: number) => number) | undefined,
      ((pos: number) => number) | undefined,
    ];
    domains?: { x?: [number, number]; y?: [number, number] };
  },
  child: GoFishNode
): JSX.Element => {
  const pad = svgPadding ?? PADDING;

  // Chrome (axis tick/label rows, titles, the legend column) is now elaborated
  // into ordinary shapes that live in the node tree; `render()` only sizes the
  // SVG around their measured extent — no chart-chrome special cases remain.
  // Content seated beyond the canvas by a constraint (e.g. marginal histogram
  // bands above/right of a scatter) is measured the same way, via the per-side
  // overhangs — including the new top and non-legend right gutters.
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
  // paint each item. Items are final absolute pixels. The ambient frame is
  // SVG-native y-DOWN (top-left origin): the base map only offsets by the gutter
  // reserves, so a vertical list reads top→bottom. Orientation is now a PER-SCOPE
  // property (issue #629): the bake walk tags each draw entry with the placed
  // y-band it renders in (`d.flip`), and `toPixelFor` mirrors that entry's y
  // about its own band — so a continuous-y chart grows up while an ordinal-y
  // neighbor stays y-down. `options.yUp` still forces a GLOBAL y-up ambient
  // (mirror about the whole canvas height), threaded as `ambientFlip`.
  const baseDown: ToPixel = ([gx, gy]) => [gx + leftReserve, gy + topReserve];
  const toPixelFor = makeToPixelFor(baseDown);
  // The whole-canvas y-flip band. Shared by both maps below so that when the
  // plot flips as a whole they pass the SAME `FlipScope` identity to
  // `toPixelFor`, which memoizes per identity — one cached closure, not two.
  const canvasFlip: FlipScope = { baseY: 0, height };
  const ambientFlip: FlipScope | undefined = yUp ? canvasFlip : undefined;
  // The frame-level GoFish-space → screen map interaction publishes for
  // hit-test / dataPos reads. It must mirror the ROOT PLOT's orientation, which
  // flips about the canvas band whenever the plot flips as a whole — i.e. the
  // global `yUp` override OR the per-scope continuous-y auto-flip
  // (`rootFlipsWhole`, mirroring the `_rootFlipScope` stamp). Using `ambientFlip`
  // (yUp only) here would report y-down for a continuous-y chart that paints
  // y-up, inverting drags. #629.
  const rootFlip: FlipScope | undefined = rootFlipsWhole
    ? canvasFlip
    : undefined;
  const rootToPixel = toPixelFor(rootFlip);
  const interactive = interaction !== undefined;
  const paintBaked = () => {
    const __tLower = perfNow();
    const items = lowerToDisplayList(child, toPixelFor, ambientFlip);
    perfAdd("lower", perfNow() - __tLower);
    perfSetCount("displayItems", items.length);
    // Publish the frame (id-keyed hit-test map + data-space conversions) before
    // paint so the first hit-test / dataPos reads see the current frame.
    interaction?.publishFrame({
      items,
      toPixel: rootToPixel,
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
