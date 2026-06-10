// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// @wiki Architecture Overview — /internals/overview/architecture
// </gofish-wiki>

import { createResource, For, Show, Suspense, type JSX } from "solid-js";
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
    w: number;
    h: number;
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

  if (debug) {
    console.log("🌳 Underlying Space Tree:");
    debugUnderlyingSpaceTree(child);
  }

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
          w
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
          h
        )
      : undefined,
  ];

  if (debug) {
    console.log("width and height constraints:", w, h);
  }

  // Root scale factors come from SIZE underlying spaces by inverting the
  // composed Monotonic against the canvas. POSITION-rooted axes use
  // posScales (computed above) instead.
  const rootScaleFactors: Size<number | undefined> = [
    isSIZE(niceUnderlyingSpaceX)
      ? (niceUnderlyingSpaceX.domain.inverse(w) ?? undefined)
      : undefined,
    isSIZE(niceUnderlyingSpaceY)
      ? (niceUnderlyingSpaceY.domain.inverse(h) ?? undefined)
      : undefined,
  ];

  // Seed posDomains from the root nice underlying space so axis nodes
  // deep in a layer tree use the full shared domain for tick generation.
  // Only defined when the root space is POSITION (undefined for ORDINAL dims,
  // which ensures facet-inner POSITION axes fall back to their local domain).
  const posDomains: [
    [number, number] | undefined,
    [number, number] | undefined,
  ] = [
    niceUnderlyingSpaceX.kind === "position"
      ? [niceUnderlyingSpaceX.domain!.min!, niceUnderlyingSpaceX.domain!.max!]
      : undefined,
    niceUnderlyingSpaceY.kind === "position"
      ? [niceUnderlyingSpaceY.domain!.min!, niceUnderlyingSpaceY.domain!.max!]
      : undefined,
  ];

  child.layout([w, h], rootScaleFactors, posScales, posDomains);
  child.place("x", x ?? transform?.x ?? 0, "baseline");
  child.place("y", y ?? transform?.y ?? 0, "baseline");

  if (debug) {
    console.log("🌳 Node Tree:");
    debugNodeTree(child);
  }

  return {
    underlyingSpaceX: niceUnderlyingSpaceX,
    underlyingSpaceY: niceUnderlyingSpaceY,
    posScales,
    child,
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
    w: number;
    h: number;
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
    scaleContext: ScaleContext;
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

      const result = {
        ...layoutResult,
        scaleContext: session.scaleContext,
      };

      return result;
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
              width: w,
              height: h,
              svgPadding,
              defs,
              axes,
              axisFields,
              scaleContext: data.scaleContext,
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
const LEGEND_MARGIN = 120; // right-side buffer for legend swatches + labels

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
    scaleContext: scaleContextParam,
    svgPadding,
  }: {
    width: number;
    height: number;
    transform?: string;
    defs?: JSX.Element[];
    axes?: AxesOptions;
    axisFields?: { x?: string; y?: string };
    scaleContext: ScaleContext | null;
    svgPadding?: number;
  },
  child: GoFishNode
): JSX.Element => {
  const scaleContext = scaleContextParam;
  const pad = svgPadding ?? PADDING;

  const { xTitle, yTitle } = resolveAxisTitles(axes, axisFields);
  const Y_TITLE_MARGIN = PADDING; // 40px left of content for rotated y-title
  const X_TITLE_MARGIN = PADDING; // 30px below content for x-title
  const leftMargin = yTitle ? Y_TITLE_MARGIN : 0;
  const bottomMargin = xTitle ? X_TITLE_MARGIN : 0;
  // Only reserve right-side legend space when a color legend will actually
  // render — the legend `<For>` below iterates an empty Map otherwise, so
  // stories without a color scale would pay 120 px for nothing.
  const hasLegend =
    !!(scaleContext?.unit && "color" in scaleContext.unit) &&
    (scaleContext.unit.color as Map<unknown, unknown>).size > 0;
  const rightMargin = hasLegend ? LEGEND_MARGIN : 0;

  const result = (
    <svg
      width={width + leftMargin + pad + rightMargin + pad}
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
        {/* legend (discrete color for now) */}
        <For
          each={Array.from(
            (scaleContext?.unit && "color" in scaleContext.unit
              ? scaleContext.unit.color
              : new Map()
            ).entries()
          )}
        >
          {([key, value], i) => (
            <g
              transform={`translate(${width + pad * 3}, ${height - i() * 20})`}
            >
              <rect x={-20} y={-5} width={10} height={10} fill={value} />
              <text
                transform="scale(1, -1)"
                x={-5}
                y={0}
                text-anchor="start"
                dominant-baseline="middle"
                font-size="10px"
                fill="gray"
              >
                {key}
              </text>
            </g>
          )}
        </For>
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
