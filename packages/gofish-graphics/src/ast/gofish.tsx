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
  type GoFishNode,
  type RenderSession,
} from "./_node";
import { posScaleFromSpace } from "./domain";
import { bake } from "./coordinateTransforms/bake";
import { lowerToDisplayList } from "./displayList/lower";
import { paintSVG } from "./displayList/paintSVG";
import type { ToPixel } from "./_node";
import type { Size } from "./dims";
import {
  continuousInterval,
  hasBaseline,
  isBaselineMagnitude,
  spaceMeasure,
  type UnderlyingSpace,
} from "./underlyingSpace";
import { shadowCheckScaleRoot } from "./solver/shadow";
import { elaborateAxes, elaborateAxisTitles } from "./axes/elaborate";
import { elaborateLegend, legendOverhang } from "./legends/elaborate";

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
export type AxisOptions = boolean | { title?: string | false };

// Fallback extent for an omitted `w`/`h` on a POSITION or data-driven SIZE axis,
// which needs a concrete canvas to scale data into (see the per-axis comment in
// `layout()` for the full behavior, including the shrink-to-fit case).
const DEFAULT_CANVAS_SIZE = 400;

// string: custom title, false: no title, undefined: infer from encoding
function resolveAxisTitle(
  axisOpt: AxisOptions | undefined
): string | false | undefined {
  if (axisOpt === undefined || axisOpt === false) return false;
  if (axisOpt === true) return undefined; // infer from axisFields
  return axisOpt.title;
}

function resolveAxisTitles(
  axes: AxesOptions | undefined,
  axisFields?: { x?: string; y?: string }
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
    xTitle: xTitleOpt === false ? undefined : (xTitleOpt ?? axisFields?.x),
    yTitle: yTitleOpt === false ? undefined : (yTitleOpt ?? axisFields?.y),
  };
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
    axisFields,
  }: {
    w?: number;
    h?: number;
    x?: number;
    y?: number;
    transform?: { x?: number; y?: number };
    debug?: boolean;
    defs?: JSX.Element[];
    axes?: AxesOptions;
    axisFields?: { x?: string; y?: string };
  },
  child: GoFishNode | Promise<GoFishNode>,
  contexts?: {
    session: RenderSession;
  }
): Promise<{
  underlyingSpaceX: UnderlyingSpace;
  underlyingSpaceY: UnderlyingSpace;
  posScales: [
    ((pos: number) => number) | undefined,
    ((pos: number) => number) | undefined,
  ];
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
  child.resolveColorScale();
  child.resolveNames();
  child.resolveLabels();
  // Resolve coordinate-space axis aliases (polar theta/r/…) into x/y/w/h BEFORE
  // space inference reads the dims. Top-down + scope-bounded (see resolveAliases).
  child.resolveAliases();
  child.resolveUnderlyingSpace();

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
    child.resolveAxes(new Set(), enabled);
    child.resolveNiceDomains();

    // Axis elaboration: turn inferred axes into ordinary shapes + constraints.
    // Wraps axis-owning content in a Layer with tick/label shapes and clears the
    // handled axis flags; the new subtree is then re-resolved below. A flag the
    // pass doesn't handle (e.g. an UNDEFINED space) is inert — nothing else
    // consumes `node.axis`.
    const elaborated = await elaborateAxes(child);
    titleAnchors = elaborated.titleAnchors;
    if (elaborated.changed) {
      child = elaborated.node;
      if (contexts?.session) child.setRenderSession(contexts.session);
      child.resolveColorScale();
      child.resolveNames();
      child.resolveLabels();
      // The rewrite inserted new nodes (wrappers + axis shapes) and moved keys
      // onto wrappers; `resolveUnderlyingSpace` memoizes, so clear every node's
      // cached space and recompute the whole tree from scratch before re-nicing.
      child.clearUnderlyingSpace();
      child.resolveUnderlyingSpace();
      child.resolveNiceDomains();
    }
  }

  // Use (possibly nice-rounded) underlying spaces for posScales
  const niceUnderlyingSpaceX = child._underlyingSpace![0];
  const niceUnderlyingSpaceY = child._underlyingSpace![1];

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
  // Each axis names itself off its OWN resolved space: a continuous axis by its
  // measure (unit), an ordinal axis by its grouping-field measure. This is the
  // post-resolution source of truth — the builder's syntactic `axisFields`
  // (mark/operator field names) is only a fallback for a space that carries no
  // measure (e.g. a magnitude whose measures forgot on conflict).
  const measureFields = {
    x: spaceMeasure(niceUnderlyingSpaceX) ?? axisFields?.x,
    y: spaceMeasure(niceUnderlyingSpaceY) ?? axisFields?.y,
  };
  const { xTitle, yTitle } = resolveAxisTitles(axes, measureFields);
  if (xTitle !== undefined || yTitle !== undefined) {
    child = await elaborateAxisTitles(child, {
      xTitle,
      yTitle,
      anchors: titleAnchors,
      plotNode,
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
    child = await elaborateLegend(
      child,
      unitScale as CategoricalScale | ContinuousColorScale
    );
    legendAdded = true;
    if (contexts?.session) child.setRenderSession(contexts.session);
    child.resolveUnderlyingSpace(); // memoized: computes only the new nodes
  }

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

  // An anchored CONTINUOUS root builds a posScale over its data interval.
  const posScales: [
    ((pos: number) => number) | undefined,
    ((pos: number) => number) | undefined,
  ] = [
    posScaleFromSpace(niceUnderlyingSpaceX, canvasW),
    posScaleFromSpace(niceUnderlyingSpaceY, canvasH),
  ];

  if (debug) {
    console.log("width and height constraints:", layoutW, layoutH);
  }

  // Root scale factor: a baseline magnitude ("free") root inverts its Monotonic
  // against the canvas. Anchored roots use the posScale (above) instead; a
  // difference root shrink-to-fits.
  const rootScaleFactors: Size<number | undefined> = [
    isBaselineMagnitude(niceUnderlyingSpaceX)
      ? (niceUnderlyingSpaceX.width.inverse(canvasW) ?? undefined)
      : undefined,
    isBaselineMagnitude(niceUnderlyingSpaceY)
      ? (niceUnderlyingSpaceY.width.inverse(canvasH) ?? undefined)
      : undefined,
  ];

  // Shared-measure scale equality (#582): when x and y carry the SAME unit of
  // measure, "1 unit on x" and "1 unit on y" are the same quantity, so their
  // data→pixel scales must be equal — a circle stays circular, a 45° line looks
  // 45°. This is type equality, not an opt-in knob: it follows from the measures
  // matching, the same way `circle({ r })` lowers to a `w`/`h` that share a
  // measure and so cannot render as an ellipse. Each axis's pixels-per-data-unit
  // comes from its POSITION domain (`canvas / range`) or its baseline-magnitude
  // σ; we take the binding (smaller) one and apply it to both — the binding axis
  // fills its dimension, the other gets slack, centered by convention. A POSITION
  // axis writes back a recentered posScale; a SIZE axis writes back its σ (its
  // content stays origin-anchored — SIZE-slack centering is deferred). Silently
  // skipped when an axis has no continuous scale to equate (e.g. ordinal).
  const measureX = spaceMeasure(niceUnderlyingSpaceX);
  const measureY = spaceMeasure(niceUnderlyingSpaceY);
  if (measureX !== undefined && measureX === measureY) {
    const axisInfo = ([0, 1] as const).map((axis) => {
      const space = axis === 0 ? niceUnderlyingSpaceX : niceUnderlyingSpaceY;
      const canvas = axis === 0 ? canvasW : canvasH;
      const ival = continuousInterval(space);
      if (ival !== undefined && ival.max > ival.min) {
        const range = ival.max - ival.min;
        return {
          kind: "position" as const,
          unitPx: canvas / range,
          min: ival.min,
          range,
          canvas,
        };
      }
      const sigma = rootScaleFactors[axis];
      if (sigma !== undefined) return { kind: "size" as const, unitPx: sigma };
      return undefined;
    });
    const [ax, ay] = axisInfo;
    if (ax !== undefined && ay !== undefined) {
      const shared = Math.min(ax.unitPx, ay.unitPx); // binding axis wins
      for (const axis of [0, 1] as const) {
        const info = axisInfo[axis]!;
        if (info.kind === "position") {
          const offset = (info.canvas - shared * info.range) / 2; // center slack
          const min = info.min;
          posScales[axis] = (pos: number) => (pos - min) * shared + offset;
        } else {
          rootScaleFactors[axis] = shared;
        }
      }
    }
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
  child.resolveEmbedding();

  child.layout([layoutW, layoutH], rootScaleFactors, posScales);
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
  const topOverhang = Math.max(0, child.dims[1].max! - finalH);
  const leftOverhang = Math.max(0, -child.dims[0].min!);
  const bottomOverhang = Math.max(0, -child.dims[1].min!);

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
  axisFields?: { x?: string; y?: string };
  colorConfig?: ColorConfig;
  padding?: number;
};

/** Extra options for the SVG-export terminals (`toSVG` / `toSVGElement` / `save`). */
export type GoFishExportOptions = GoFishRenderOptions & {
  /** Background fill painted behind the chart. `null`/omitted = transparent. */
  background?: string | null;
};

type LayoutData = {
  underlyingSpaceX: UnderlyingSpace;
  underlyingSpaceY: UnderlyingSpace;
  posScales: [
    ((pos: number) => number) | undefined,
    ((pos: number) => number) | undefined,
  ];
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
    axisFields,
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
      await document.fonts.ready;
    }

    return await layout(
      { w, h, x, y, transform, debug, defs, axes, axisFields },
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

/** Build the `<svg>` JSX element from already-computed layout data. */
function renderLayout(
  data: LayoutData,
  svgPadding: number,
  defs?: JSX.Element[]
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
    },
    data.child
  );
}

export const gofish = (
  container: HTMLElement,
  options: GoFishRenderOptions,
  child: GoFishNode | Promise<GoFishNode>
) => {
  const svgPadding = options.padding ?? PADDING;

  const [layoutData] = createResource(() => runLayout(options, child));

  // Render to the provided container
  solidRender(() => {
    // used to handle async rendering of derived data
    return (
      <Suspense fallback={<div>Loading...</div>}>
        {(() => {
          const data = layoutData();
          if (!data) return null;
          return renderLayout(data, svgPadding, options.defs);
        })()}
      </Suspense>
    );
  }, container);
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

/**
 * Finds the translation from the top-level coord node.
 * Checks the node itself first, then its immediate children.
 * Returns the coord node's transform.translate values, or null if not found.
 */
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
  // paint each item. Items are final y-down absolute pixels (the `toPixel` fold
  // carries the gutter offset + the y-flip), so there is no outer flip `<g>` and
  // no per-shape transform.
  const toPixel: ToPixel = ([gx, gy]) => [
    gx + leftReserve,
    height + topReserve - gy,
  ];
  child.getRenderSession().toPixel = toPixel;
  const paintBaked = () => lowerToDisplayList(child).map(paintSVG);
  return (
    <svg
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
