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

export type ScaleContext = {
  [measure: string]:
    | { color: Map<any, string>; colorConfig?: ColorConfig }
    | { domain: [number, number]; scaleFactor: number };
};

export type KeyContext = { [key: string]: GoFishNode };
export type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
export type AxisOptions = boolean | { title?: string | false };

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
  if (
    typeof document !== "undefined" &&
    document.fonts &&
    typeof document.fonts.ready?.then === "function"
  ) {
    await document.fonts.ready;
  }
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
  child.resolveKeys();
  child.resolveLabels();
  child.resolveUnderlyingSpace();

  // Node-based axis pipeline: mark axis nodes and apply nice-rounding in-place
  if (axes) {
    child.resolveAxes();
    child.resolveNiceDomains();
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

  child.layout([w, h], rootScaleFactors, posScales);
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
    keyContext: KeyContext;
  };

  const runGofish = async (): Promise<LayoutData> => {
    const session: RenderSession = {
      tokenContext: new Map(),
      scaleContext: { unit: { color: new Map(), colorConfig } },
      keyContext: {},
    };
    try {
      const contexts = {
        session,
      };

      const layoutResult = await layout(
        { w, h, x, y, transform, debug, defs, axes },
        child,
        contexts
      );

      const result = {
        ...layoutResult,
        scaleContext: session.scaleContext,
        keyContext: session.keyContext,
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

const PADDING = 10;
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
    scaleContext: scaleContextParam,
    svgPadding,
  }: {
    width: number;
    height: number;
    transform?: string;
    defs?: JSX.Element[];
    scaleContext: ScaleContext | null;
    svgPadding?: number;
  },
  child: GoFishNode
): JSX.Element => {
  const scaleContext = scaleContextParam;
  const pad = svgPadding ?? PADDING;

  const result = (
    <svg
      width={width + pad * 2 + LEGEND_MARGIN}
      height={height + pad * 2}
      xmlns="http://www.w3.org/2000/svg"
    >
      <Show when={defs}>
        <defs>{defs}</defs>
      </Show>
      <g transform={`scale(1, -1) translate(${pad}, ${-(height + pad)})`}>
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
      </g>
    </svg>
  );

  return result;
};
