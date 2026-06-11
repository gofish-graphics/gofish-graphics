// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// @wiki Architecture Overview — /internals/overview/architecture
// </gofish-wiki>

import { createResource, Show, Suspense, type JSX } from "solid-js";
import { type ColorConfig } from "./colorSchemes";
import { render as solidRender } from "solid-js/web";
import {
  debugInputSceneGraph,
  debugNodeTree,
  debugUnderlyingSpaceTree,
  type GoFishNode,
  type RenderSession,
} from "./_node";
import { computePosScale } from "./domain";
import type { Size } from "./dims";
import { isSIZE, type UnderlyingSpace } from "./underlyingSpace";
import { continuous } from "./domain";
import { elaborateAxes } from "./axes/elaborate";
import { elaborateLegend, legendOverhang } from "./legends/elaborate";

export type CategoricalScale = {
  color: Map<any, string>;
  colorConfig?: ColorConfig;
};

export type ContinuousScale = {
  domain: [number, number];
  scaleFactor: number;
};

export type Scale = CategoricalScale | ContinuousScale;

export type ScaleContext = {
  [measure: string]: Scale;
};

export const isCategoricalScale = (
  s: Scale | undefined
): s is CategoricalScale => s !== undefined && "color" in s;
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
  }: {
    w?: number;
    h?: number;
    x?: number;
    y?: number;
    transform?: { x?: number; y?: number };
    debug?: boolean;
    defs?: JSX.Element[];
    axes?: AxesOptions;
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
  child.resolveUnderlyingSpace();

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

  // Legend elaboration: turn the color scale into an ordinary swatch-column
  // subtree seated beside the content (src/ast/legends/elaborate.tsx). Runs
  // after the last resolveColorScale (it consumes the populated color map;
  // legend fills are literal strings, never isValue, so the scale pass is NOT
  // re-run). The wrapper preserves the content's underlying spaces
  // (unionChildSpaces ignores the legend's UNDEFINED spaces), so the nice
  // spaces captured above remain valid.
  // Reference to the content node whose extent defines the final canvas. When a
  // legend is added, `child` becomes the wrapper Layer (content + swatch column)
  // and `contentNode` keeps pointing at the original content, so the final
  // width/height (and the axis-title centering that reads them) stay measured off
  // the content, not the content+legend bbox. The legend is reserved separately
  // via `rightOverhang` below.
  const contentNode = child;
  const unitScale = contexts?.session.scaleContext.unit;
  const colorMap = isCategoricalScale(unitScale) ? unitScale.color : undefined;
  if (colorMap && colorMap.size > 0) {
    child = await elaborateLegend(child, colorMap);
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
  const needsCanvas = (s: UnderlyingSpace) =>
    s.kind === "position" || isSIZE(s);
  // Concrete canvas for scaling POSITION/SIZE axes (always a real number).
  const canvasW = w ?? DEFAULT_CANVAS_SIZE;
  const canvasH = h ?? DEFAULT_CANVAS_SIZE;
  // Size handed to `child.layout`: a shrink-to-fit axis is left unsized.
  const layoutW = w ?? (needsCanvas(niceUnderlyingSpaceX) ? canvasW : UNSIZED);
  const layoutH = h ?? (needsCanvas(niceUnderlyingSpaceY) ? canvasH : UNSIZED);

  const posScales: [
    ((pos: number) => number) | undefined,
    ((pos: number) => number) | undefined,
  ] = [
    niceUnderlyingSpaceX.kind === "position"
      ? computePosScale(
          continuous({
            value: [
              niceUnderlyingSpaceX.domain!.min,
              niceUnderlyingSpaceX.domain!.max,
            ],
            measure: "unit",
          }),
          canvasW
        )
      : undefined,
    niceUnderlyingSpaceY.kind === "position"
      ? computePosScale(
          continuous({
            value: [
              niceUnderlyingSpaceY.domain!.min,
              niceUnderlyingSpaceY.domain!.max,
            ],
            measure: "unit",
          }),
          canvasH
        )
      : undefined,
  ];

  if (debug) {
    console.log("width and height constraints:", layoutW, layoutH);
  }

  // Root scale factors come from SIZE underlying spaces by inverting the
  // composed Monotonic against the canvas. POSITION-rooted axes use
  // posScales (computed above) instead.
  const rootScaleFactors: Size<number | undefined> = [
    isSIZE(niceUnderlyingSpaceX)
      ? (niceUnderlyingSpaceX.domain.inverse(canvasW) ?? undefined)
      : undefined,
    isSIZE(niceUnderlyingSpaceY)
      ? (niceUnderlyingSpaceY.domain.inverse(canvasH) ?? undefined)
      : undefined,
  ];

  child.layout([layoutW, layoutH], rootScaleFactors, posScales);
  child.place("x", x ?? transform?.x ?? 0, "baseline");
  child.place("y", y ?? transform?.y ?? 0, "baseline");

  // Final extent: a user-given dimension is authoritative; otherwise prefer the
  // content's laid-out intrinsic size (shrink-to-fit), falling back to the
  // canvas default when the content didn't report one. Read off `contentNode`
  // (== `child` when no legend), never the legend wrapper — so the canvas and
  // the axis titles that center on `finalW`/`finalH` stay content-relative; the
  // legend is reserved separately via `rightOverhang`.
  const finalDim = (i: 0 | 1, given: number | undefined): number => {
    if (given !== undefined) return given;
    const s = contentNode.dims[i]?.size;
    return s !== undefined && Number.isFinite(s) ? s : DEFAULT_CANVAS_SIZE;
  };
  const finalW = finalDim(0, w);
  const finalH = finalDim(1, h);

  // Measured legend overhang past the content width — replaces the fixed
  // LEGEND_MARGIN (see `legendOverhang`). Gated on whether a legend wrapper was
  // added (`child !== contentNode`) so legend-free charts keep byte-identical
  // widths.
  const rightOverhang =
    child !== contentNode ? legendOverhang(child, finalW) : 0;

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
  };
}

/* global pass handler */
export const gofish = (
  container: HTMLElement,
  {
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
    padding,
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
    colorConfig?: ColorConfig;
    padding?: number;
  },
  child: GoFishNode | Promise<GoFishNode>
) => {
  const svgPadding = padding ?? PADDING;
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
  };

  const runGofish = async (): Promise<LayoutData> => {
    const session: RenderSession = {
      tokenContext: new Map(),
      scaleContext: { unit: { color: new Map(), colorConfig } },
    };
    try {
      const contexts = {
        session,
      };

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

      const layoutResult = await layout(
        { w, h, x, y, transform, debug, defs, axes },
        child,
        contexts
      );

      return layoutResult;
    } finally {
      if (debug) {
        console.log("scaleContext", session.scaleContext);
        console.log("tokenContext", session.tokenContext);
      }
    }
  };

  const [layoutData] = createResource(runGofish);

  // Render to the provided container
  solidRender(() => {
    // used to handle async rendering of derived data
    return (
      <Suspense fallback={<div>Loading...</div>}>
        {(() => {
          const data = layoutData();
          if (!data) return null;
          return render(
            {
              width: data.width,
              height: data.height,
              svgPadding,
              defs,
              axes,
              axisFields,
              rightOverhang: data.rightOverhang,
            },
            data.child
          );
        })()}
      </Suspense>
    );
  }, container);
  return container;
};

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
    axes,
    axisFields,
    rightOverhang = 0,
    svgPadding,
  }: {
    width: number;
    height: number;
    transform?: string;
    defs?: JSX.Element[];
    axes?: AxesOptions;
    axisFields?: { x?: string; y?: string };
    rightOverhang?: number;
    svgPadding?: number;
  },
  child: GoFishNode
): JSX.Element => {
  const pad = svgPadding ?? PADDING;

  const { xTitle, yTitle } = resolveAxisTitles(axes, axisFields);
  const Y_TITLE_MARGIN = PADDING; // 40px left of content for rotated y-title
  const X_TITLE_MARGIN = PADDING; // 30px below content for x-title
  const leftMargin = yTitle ? Y_TITLE_MARGIN : 0;
  const bottomMargin = xTitle ? X_TITLE_MARGIN : 0;
  // Right-side space reserved for a legend overhanging the content width
  // (measured by `layout()`; 0 when no legend / no overhang).

  const result = (
    <svg
      width={width + leftMargin + pad + rightOverhang + pad}
      height={height + pad + bottomMargin + pad}
      xmlns="http://www.w3.org/2000/svg"
    >
      <Show when={defs}>
        <defs>{defs}</defs>
      </Show>
      <g
        transform={`scale(1, -1) translate(${leftMargin + pad}, ${-(height + pad)})`}
      >
        <Show when={transform} keyed fallback={child.INTERNAL_render()}>
          <g transform={transform ?? ""}>{child.INTERNAL_render()}</g>
        </Show>
        {/* x axis title */}
        <Show when={xTitle}>
          <text
            transform="scale(1, -1)"
            x={width / 2}
            y={bottomMargin * 0.6}
            text-anchor="middle"
            dominant-baseline="hanging"
            font-size="11px"
            fill="gray"
          >
            {xTitle}
          </text>
        </Show>
        {/* y axis title */}
        <Show when={yTitle}>
          <text
            transform={`translate(${-(leftMargin * 0.5 + pad)}, ${height / 2}) scale(1, -1) rotate(-90)`}
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="11px"
            fill="gray"
          >
            {yTitle}
          </text>
        </Show>
      </g>
    </svg>
  );

  return result;
};
