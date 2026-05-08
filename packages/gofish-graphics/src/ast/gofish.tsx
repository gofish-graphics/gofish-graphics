import { createResource, For, Show, Suspense, type JSX } from "solid-js";
import { type ColorConfig } from "./colorSchemes";
import { render as solidRender } from "solid-js/web";
import {
  debugInputSceneGraph,
  debugNodeTree,
  debugUnderlyingSpaceTree,
  findPathToRoot,
  type GoFishNode,
  type RenderSession,
} from "./_node";
import { computePosScale } from "./domain";
import type { Size } from "./dims";
import { tickIncrement, ticks, nice } from "d3-array";
import { isConstant } from "../util/monotonic";
import {
  isDIFFERENCE,
  isORDINAL,
  isPOSITION,
  isSIZE,
  type UnderlyingSpace,
} from "./underlyingSpace";
import { placeLabels } from "./labels/placeLabels";
import { continuous } from "./domain";
import { interval } from "../util/interval";
import { path, pathToSVGPath, transformPath } from "../path";

export type ScaleContext = {
  [measure: string]:
    | { color: Map<any, string>; colorConfig?: ColorConfig }
    | { domain: [number, number]; scaleFactor: number };
};

export type KeyContext = { [key: string]: GoFishNode };
export type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
export type AxisOptions = boolean | { title?: string | false };

// string: custom title, false: no title, undefined: infer from encoding
function resolveAxisTitle(
  axisOpt: AxisOptions | undefined
): string | false | undefined {
  if (axisOpt === undefined || axisOpt === false) return false; // axis hidden, title irrelevant
  if (axisOpt === true) return undefined; // axis shown, infer title from encoding
  return axisOpt.title; // string: custom title, false: no title, undefined: infer title
}

function resolveAxes(axes: AxesOptions | undefined): {
  x: boolean;
  y: boolean;
  xTitle: string | false | undefined;
  yTitle: string | false | undefined;
} {
  if (axes === true) {
    return { x: true, y: true, xTitle: undefined, yTitle: undefined };
  }
  if (!axes) {
    return { x: false, y: false, xTitle: false, yTitle: false };
  }
  return {
    x: !!axes.x,
    y: !!axes.y,
    xTitle: resolveAxisTitle(axes.x),
    yTitle: resolveAxisTitle(axes.y),
  };
}

type OrdinalScale = (key: string) => number | undefined;

function buildOrdinalScaleX(
  keyContext: KeyContext,
  root: GoFishNode
): OrdinalScale {
  const keyToPosition = new Map<string, number>();

  for (const [key, node] of Object.entries(keyContext)) {
    if (!("intrinsicDims" in node) || !node.intrinsicDims) continue;

    const pathToRoot = findPathToRoot(node);
    const accumulatedTransform = pathToRoot.reduce(
      (acc, n) => {
        return {
          x: acc.x + (n.transform?.translate?.[0] ?? 0),
          y: acc.y + (n.transform?.translate?.[1] ?? 0),
        };
      },
      { x: 0, y: 0 }
    );

    const centerX =
      accumulatedTransform.x + (node.intrinsicDims[0]?.center ?? 0);
    keyToPosition.set(key, centerX);
  }

  return (key: string) => keyToPosition.get(key);
}

function buildOrdinalScaleY(
  keyContext: KeyContext,
  root: GoFishNode
): OrdinalScale {
  const keyToPosition = new Map<string, number>();

  for (const [key, node] of Object.entries(keyContext)) {
    if (!("intrinsicDims" in node) || !node.intrinsicDims) continue;

    const pathToRoot = findPathToRoot(node);
    const accumulatedTransform = pathToRoot.reduce(
      (acc, n) => {
        return {
          x: acc.x + (n.transform?.translate?.[0] ?? 0),
          y: acc.y + (n.transform?.translate?.[1] ?? 0),
        };
      },
      { x: 0, y: 0 }
    );

    const centerY =
      accumulatedTransform.y + (node.intrinsicDims[1]?.center ?? 0);
    keyToPosition.set(key, centerY);
  }

  return (key: string) => keyToPosition.get(key);
}

export async function layout(
  {
    w,
    h,
    x,
    y,
    transform,
    debug = false,
    defs,
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
  ordinalScales: [OrdinalScale | undefined, OrdinalScale | undefined];
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
  const [underlyingSpaceX, underlyingSpaceY] = child.resolveUnderlyingSpace();

  // Apply nice rounding to POSITION space domains
  let niceUnderlyingSpaceX = underlyingSpaceX;
  let niceUnderlyingSpaceY = underlyingSpaceY;

  if (isPOSITION(underlyingSpaceX) && underlyingSpaceX.domain) {
    const [niceMin, niceMax] = nice(
      underlyingSpaceX.domain.min,
      underlyingSpaceX.domain.max,
      10
    );
    niceUnderlyingSpaceX = {
      ...underlyingSpaceX,
      domain: interval(niceMin, niceMax),
    };
  }

  if (isPOSITION(underlyingSpaceY) && underlyingSpaceY.domain) {
    const [niceMin, niceMax] = nice(
      underlyingSpaceY.domain.min,
      underlyingSpaceY.domain.max,
      10
    );
    niceUnderlyingSpaceY = {
      ...underlyingSpaceY,
      domain: interval(niceMin, niceMax),
    };
  }

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

  // Resolve label placements (post-layout, pre-render). Strategies look up
  // `_labelKind` per node, gather obstacles globally, and write the resolved
  // `Placement` into `_label.placement` for the renderer to consume.
  placeLabels(child);

  if (debug) {
    console.log("🌳 Node Tree:");
    debugNodeTree(child);
  }

  const ordinalScales: [OrdinalScale | undefined, OrdinalScale | undefined] = [
    isORDINAL(niceUnderlyingSpaceX) && contexts?.session?.keyContext
      ? buildOrdinalScaleX(contexts.session.keyContext, child)
      : undefined,
    isORDINAL(niceUnderlyingSpaceY) && contexts?.session?.keyContext
      ? buildOrdinalScaleY(contexts.session.keyContext, child)
      : undefined,
  ];

  return {
    underlyingSpaceX: niceUnderlyingSpaceX,
    underlyingSpaceY: niceUnderlyingSpaceY,
    posScales,
    ordinalScales,
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
  },
  child: GoFishNode | Promise<GoFishNode>
) => {
  type LayoutData = {
    underlyingSpaceX: UnderlyingSpace;
    underlyingSpaceY: UnderlyingSpace;
    posScales: [
      ((pos: number) => number) | undefined,
      ((pos: number) => number) | undefined,
    ];
    ordinalScales: [OrdinalScale | undefined, OrdinalScale | undefined];
    child: GoFishNode;
    scaleContext: ScaleContext;
    keyContext: KeyContext;
  };

  const runGofish = async (): Promise<LayoutData> => {
    const session: RenderSession = {
      scopeContext: new Map(),
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
        console.log("scopeContext", session.scopeContext);
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
              defs,
              axes,
              axisFields,
              scaleContext: data.scaleContext,
              keyContext: data.keyContext,
              underlyingSpaceX: data.underlyingSpaceX,
              underlyingSpaceY: data.underlyingSpaceY,
              posScales: data.posScales,
              ordinalScales: data.ordinalScales,
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

/**
 * Finds the translation from the top-level coord node.
 * Checks the node itself first, then its immediate children.
 * Returns the coord node's transform.translate values, or null if not found.
 */
function findCoordTranslation(node: GoFishNode): [number, number] | null {
  // Check if the node itself is a coord node
  if (node.type === "coord" && node.transform?.translate) {
    return [node.transform.translate[0] ?? 0, node.transform.translate[1] ?? 0];
  }

  // Check immediate children for a coord node
  if (node.children) {
    for (const child of node.children) {
      // Check if child is a coord node (coord nodes are always GoFishNode, not GoFishRef)
      if ("type" in child && child.type === "coord" && "transform" in child) {
        const coordNode = child as GoFishNode;
        if (coordNode.transform?.translate) {
          return [
            coordNode.transform.translate[0] ?? 0,
            coordNode.transform.translate[1] ?? 0,
          ];
        }
      }
    }
  }

  return null;
}

/**
 * Finds the coordinate-space bounding box from the top-level coord node.
 * Checks the node itself first, then its immediate children.
 * Returns the coord node's coordinate-space bounding box, or null if not found.
 */
function findCoordBoundingBox(
  node: GoFishNode
): { thetaMin: number; thetaMax: number; rMin: number; rMax: number } | null {
  // Check if the node itself is a coord node
  if (node.type === "coord" && node.renderData?.coordinateSpaceBbox) {
    return node.renderData.coordinateSpaceBbox;
  }

  // Check immediate children for a coord node
  if (node.children) {
    for (const child of node.children) {
      // Check if child is a coord node (coord nodes are always GoFishNode, not GoFishRef)
      if ("type" in child && child.type === "coord" && "renderData" in child) {
        const coordNode = child as GoFishNode;
        if (coordNode.renderData?.coordinateSpaceBbox) {
          return coordNode.renderData.coordinateSpaceBbox;
        }
      }
    }
  }

  return null;
}

export const render = (
  {
    width,
    height,
    transform,
    defs,
    axes,
    axisFields,
    scaleContext: scaleContextParam,
    keyContext: keyContextParam,
    underlyingSpaceX,
    underlyingSpaceY,
    posScales,
    ordinalScales,
  }: {
    width: number;
    height: number;
    transform?: string;
    defs?: JSX.Element[];
    axes?: AxesOptions;
    axisFields?: { x?: string; y?: string };
    scaleContext: ScaleContext | null;
    keyContext: KeyContext | null;
    underlyingSpaceX: UnderlyingSpace;
    underlyingSpaceY: UnderlyingSpace;
    posScales: [
      ((pos: number) => number) | undefined,
      ((pos: number) => number) | undefined,
    ];
    ordinalScales: [OrdinalScale | undefined, OrdinalScale | undefined];
  },
  child: GoFishNode
): JSX.Element => {
  const scaleContext = scaleContextParam;
  const keyContext = keyContextParam;
  const { x: axisX, y: axisY, xTitle, yTitle } = resolveAxes(axes);
  const axisVisibility = { x: axisX, y: axisY };
  const resolvedXTitle =
    xTitle === false ? undefined : (xTitle ?? axisFields?.x);
  const resolvedYTitle =
    yTitle === false ? undefined : (yTitle ?? axisFields?.y);
  const hasAnyVisibleAxis = axisVisibility.x || axisVisibility.y;
  const axisPaddingX = axisVisibility.y ? 100 : 0;
  const axisPaddingY = axisVisibility.x ? 100 : 0;
  const leftMargin = resolvedYTitle ? PADDING * 7 : PADDING * 4;

  let yTicks: number[] = [];
  let xTicks: number[] = [];
  if (
    hasAnyVisibleAxis &&
    scaleContext?.x &&
    scaleContext?.y &&
    "domain" in scaleContext.x &&
    "scaleFactor" in scaleContext.x &&
    "domain" in scaleContext.y &&
    "scaleFactor" in scaleContext.y
  ) {
    const [xMin, xMax] = nice(
      scaleContext.x.domain[0],
      scaleContext.x.domain[1],
      10
    );
    xTicks = ticks(xMin, xMax, 10);

    const [yMin, yMax] = nice(
      scaleContext.y.domain[0],
      scaleContext.y.domain[1],
      10
    );
    yTicks = ticks(yMin, yMax, 10);
  }

  const result = (
    <svg
      width={width + leftMargin + PADDING * 2 + axisPaddingX}
      height={height + PADDING * 6 + axisPaddingY}
      xmlns="http://www.w3.org/2000/svg"
    >
      <Show when={defs}>
        <defs>{defs}</defs>
      </Show>
      <g
        transform={`scale(1, -1) translate(${leftMargin}, ${-height - PADDING * 4})`}
      >
        <Show when={transform} keyed fallback={child.INTERNAL_render()}>
          <g transform={transform ?? ""}>{child.INTERNAL_render()}</g>
        </Show>
        <Show when={hasAnyVisibleAxis}>
          {(() => {
            // Check if we have a coordinate transform (polar/clock coordinates)
            const hasCoordTransform =
              (isPOSITION(underlyingSpaceX) &&
                underlyingSpaceX.coordinateTransform) ||
              (isPOSITION(underlyingSpaceY) &&
                underlyingSpaceY.coordinateTransform);

            // Find the coord node's translation if we have a coordinate transform
            const coordTranslation = hasCoordTransform
              ? findCoordTranslation(child)
              : null;

            // Apply translation if found
            const axesTransform = coordTranslation
              ? `translate(${coordTranslation[0]}, ${coordTranslation[1]})`
              : undefined;

            return (
              <>
                <g transform={axesTransform}>
                  {/* x axis */}
                  {/* <line
              x1={0}
              y1={height + PADDING}
              x2={width + PADDING}
              y2={height + PADDING}
              stroke="gray"
              stroke-width="1px"
            /> */}
                  {/* y axis (continuous) */}
                  <Show when={axisVisibility.y && isPOSITION(underlyingSpaceY)}>
                    {(() => {
                      if (!isPOSITION(underlyingSpaceY)) return null;
                      const spaceY = underlyingSpaceY; // Type narrowed to POSITION_TYPE
                      const xPosScale = posScales[0];
                      const yPosScale = posScales[1];
                      const [yMin, yMax] = nice(
                        spaceY.domain.min,
                        spaceY.domain.max,
                        10
                      );
                      const yTicks = ticks(yMin, yMax, 10);
                      const coordTransform = spaceY.coordinateTransform;

                      if (coordTransform && xPosScale && yPosScale) {
                        // Map using posScales before applying coordinate transform
                        const xDomainMin = coordTransform.domain[0].min!;
                        const screenYMin = yPosScale(yMin);
                        const screenYMax = yPosScale(yMax);
                        const screenX = xPosScale(xDomainMin);

                        // Create path in screen space, then transform
                        const screenPath = path(
                          [
                            [screenX, screenYMin],
                            [screenX, screenYMax],
                          ],
                          { subdivision: 100 }
                        );
                        const axisLinePath = transformPath(
                          screenPath,
                          coordTransform
                        );

                        return (
                          <g>
                            <path
                              d={pathToSVGPath(axisLinePath)}
                              stroke="gray"
                              stroke-width="1px"
                              fill="none"
                            />
                            <For each={yTicks}>
                              {(tick) => {
                                const screenTickY = yPosScale(tick);
                                const [transformedX, transformedY] =
                                  coordTransform.transform([
                                    screenX,
                                    screenTickY,
                                  ]);
                                return (
                                  <>
                                    <text
                                      transform="scale(1, -1)"
                                      x={transformedX - PADDING * 0.25}
                                      y={-transformedY}
                                      text-anchor="end"
                                      dominant-baseline="middle"
                                      font-size="10px"
                                      fill="gray"
                                    >
                                      {tick}
                                    </text>
                                    {/* Tick mark - create a small line from the axis */}
                                    <line
                                      x1={transformedX}
                                      y1={transformedY}
                                      x2={transformedX - PADDING * 0.5}
                                      y2={transformedY}
                                      stroke="gray"
                                    />
                                  </>
                                );
                              }}
                            </For>
                          </g>
                        );
                      } else {
                        // Standard cartesian y-axis
                        if (!yPosScale) return null;
                        return (
                          <g>
                            <line
                              x1={-PADDING}
                              y1={yPosScale(yTicks[0]) - 0.5}
                              x2={-PADDING}
                              y2={yPosScale(yTicks[yTicks.length - 1]) + 0.5}
                              stroke="gray"
                              stroke-width="1px"
                            />
                            <For each={yTicks}>
                              {(tick) => (
                                <>
                                  <text
                                    transform="scale(1, -1)"
                                    x={-PADDING * 1.75}
                                    y={-yPosScale(tick)}
                                    text-anchor="end"
                                    dominant-baseline="middle"
                                    font-size="10px"
                                    fill="gray"
                                  >
                                    {tick}
                                  </text>
                                  <line
                                    x1={-PADDING * 1.5}
                                    y1={yPosScale(tick)}
                                    x2={-PADDING}
                                    y2={yPosScale(tick)}
                                    stroke="gray"
                                  />
                                </>
                              )}
                            </For>
                          </g>
                        );
                      }
                    })()}
                  </Show>
                  <Show
                    when={
                      axisVisibility.y &&
                      isDIFFERENCE(underlyingSpaceY) &&
                      scaleContext?.y &&
                      "scaleFactor" in scaleContext.y
                    }
                  >
                    {(() => {
                      const yScale = scaleContext!.y as {
                        domain: [number, number];
                        scaleFactor: number;
                      };
                      if (!isDIFFERENCE(underlyingSpaceY)) return null;
                      const [yMin, yMax] = nice(0, underlyingSpaceY.width, 10);
                      const yTicks = ticks(yMin, yMax, 10);
                      return (
                        <g>
                          <line
                            x1={-PADDING}
                            y1={
                              (yTicks[0] - yTicks[0]) * yScale.scaleFactor - 0.5
                            }
                            x2={-PADDING}
                            y2={
                              (yTicks[yTicks.length - 1] - yTicks[0]) *
                                yScale.scaleFactor +
                              0.5
                            }
                            stroke="gray"
                            stroke-width="1px"
                          />
                          <For each={yTicks}>
                            {(tick) => (
                              <>
                                <line
                                  x1={-PADDING * 1.5}
                                  y1={(tick - yTicks[0]) * yScale.scaleFactor}
                                  x2={-PADDING}
                                  y2={(tick - yTicks[0]) * yScale.scaleFactor}
                                  stroke="gray"
                                />
                              </>
                            )}
                          </For>

                          {/* For each pair of yTicks, put text in between showing the difference */}
                          <For
                            each={Array.from(
                              { length: yTicks.length - 1 },
                              (_, i) => i
                            )}
                          >
                            {(i) => {
                              const tick1 = yTicks[i];
                              const tick2 = yTicks[i + 1];
                              const diff = tick2 - tick1;
                              // Position text halfway between the two ticks
                              const y1 =
                                (tick1 - yTicks[0]) * yScale.scaleFactor;
                              const y2 =
                                (tick2 - yTicks[0]) * yScale.scaleFactor;
                              const yMid = (y1 + y2) / 2;
                              return (
                                <text
                                  transform="scale(1, -1)"
                                  x={-PADDING * 1.5}
                                  y={-yMid}
                                  text-anchor="end"
                                  dominant-baseline="middle"
                                  font-size="10px"
                                  fill="gray"
                                >
                                  {diff}
                                </text>
                              );
                            }}
                          </For>
                        </g>
                      );
                    })()}
                  </Show>

                  {/* x axis (position) */}
                  <Show when={axisVisibility.x && isPOSITION(underlyingSpaceX)}>
                    {(() => {
                      if (!isPOSITION(underlyingSpaceX)) return null;
                      const spaceX = underlyingSpaceX; // Type narrowed to POSITION_TYPE
                      const xPosScale = posScales[0];
                      const [xMin, xMax] = nice(
                        spaceX.domain.min,
                        spaceX.domain.max,
                        10
                      );
                      const xTicks = ticks(xMin, xMax, 10);
                      const coordTransform = spaceX.coordinateTransform;

                      if (coordTransform && xPosScale) {
                        // Map the chart's data domain into the coordinate-space theta range.
                        // For clock/polar, the coord transform expects theta in [0, 2π] (or whatever its domain says),
                        // not raw data-domain values.
                        const thetaSize =
                          coordTransform.domain[0].size ??
                          coordTransform.domain[0].max! -
                            coordTransform.domain[0].min!;
                        const thetaScale = computePosScale(
                          continuous({
                            value: [xMin, xMax],
                            measure: "unit",
                          }),
                          thetaSize
                        );

                        const thetaMin = thetaScale(xMin);
                        const thetaMax = thetaScale(xMax);

                        // Get the maximum radius from the coordinate-space bounding box
                        // and add padding to position axis outside chart bounds
                        const coordBbox = findCoordBoundingBox(child);
                        const rMax = coordBbox
                          ? coordBbox.rMax + PADDING * 2
                          : (coordTransform.domain[1].max ??
                            coordTransform.domain[1].size ??
                            100);

                        const rAxis = rMax;
                        const tickLen = PADDING * 0.5;
                        const labelPad = PADDING * 1.25;

                        const axisDomainPath = path(
                          [
                            [thetaMin, rMax],
                            [thetaMax, rMax],
                          ],
                          { subdivision: 200 }
                        );

                        const axisLinePath = transformPath(
                          axisDomainPath,
                          coordTransform
                        );

                        return (
                          <g>
                            <path
                              d={pathToSVGPath(axisLinePath)}
                              stroke="gray"
                              stroke-width="1px"
                              fill="none"
                            />
                            <For each={xTicks}>
                              {(tick) => {
                                const thetaTick = thetaScale(tick);
                                // Ticks/labels should point outward (increasing r), regardless of how the
                                // coordinate transform distorts the space. Compute direction in screen space
                                // by sampling at r and r+Δr.
                                const [tickAxisX, tickAxisY] =
                                  coordTransform.transform([thetaTick, rAxis]);
                                const [tickOutX, tickOutY] =
                                  coordTransform.transform([
                                    thetaTick,
                                    rAxis + tickLen,
                                  ]);

                                const dx = tickOutX - tickAxisX;
                                const dy = tickOutY - tickAxisY;
                                const dLen = Math.hypot(dx, dy);
                                const dirX = dLen > 1e-6 ? dx / dLen : 0;
                                const dirY = dLen > 1e-6 ? dy / dLen : 1;

                                const labelX = tickOutX + dirX * labelPad;
                                const labelY = tickOutY + dirY * labelPad;
                                return (
                                  <>
                                    <text
                                      transform="scale(1, -1)"
                                      x={labelX}
                                      y={-labelY}
                                      text-anchor="middle"
                                      dominant-baseline="hanging"
                                      font-size="10px"
                                      fill="gray"
                                    >
                                      {tick}
                                    </text>
                                    {/* Tick mark - create a small line from the axis */}
                                    <line
                                      x1={tickAxisX}
                                      y1={tickAxisY}
                                      x2={tickOutX}
                                      y2={tickOutY}
                                      stroke="gray"
                                    />
                                  </>
                                );
                              }}
                            </For>
                          </g>
                        );
                      } else {
                        // Standard cartesian x-axis
                        if (!xPosScale) return null;
                        return (
                          <g>
                            <line
                              x1={xPosScale(xTicks[0]) - 0.5}
                              y1={-PADDING}
                              x2={xPosScale(xTicks[xTicks.length - 1]) + 0.5}
                              y2={-PADDING}
                              stroke="gray"
                              stroke-width="1px"
                            />
                            <For each={xTicks}>
                              {(tick) => (
                                <>
                                  <text
                                    transform="scale(1, -1)"
                                    x={xPosScale(tick)}
                                    y={PADDING * 1.75}
                                    text-anchor="middle"
                                    dominant-baseline="hanging"
                                    font-size="10px"
                                    fill="gray"
                                  >
                                    {tick}
                                  </text>
                                  <line
                                    x1={xPosScale(tick)}
                                    y1={-PADDING}
                                    x2={xPosScale(tick)}
                                    y2={-PADDING * 1.5}
                                    stroke="gray"
                                  />
                                </>
                              )}
                            </For>
                          </g>
                        );
                      }
                    })()}
                  </Show>

                  {/* x axis (difference) */}
                  <Show
                    when={
                      axisVisibility.x &&
                      isDIFFERENCE(underlyingSpaceX) &&
                      scaleContext?.x &&
                      "scaleFactor" in scaleContext.x
                    }
                  >
                    {(() => {
                      const xScale = scaleContext!.x as {
                        domain: [number, number];
                        scaleFactor: number;
                      };
                      if (!isDIFFERENCE(underlyingSpaceX)) return null;
                      const [xMin, xMax] = nice(0, underlyingSpaceX.width, 10);
                      const xTicks = ticks(xMin, xMax, 10);
                      return (
                        <g>
                          <line
                            x1={
                              (xTicks[0] - xTicks[0]) * xScale.scaleFactor - 0.5
                            }
                            y1={-PADDING}
                            x2={
                              (xTicks[xTicks.length - 1] - xTicks[0]) *
                                xScale.scaleFactor +
                              0.5
                            }
                            y2={-PADDING}
                            stroke="gray"
                            stroke-width="1px"
                          />
                          <For each={xTicks}>
                            {(tick) => (
                              <>
                                <line
                                  x1={(tick - xTicks[0]) * xScale.scaleFactor}
                                  y1={-PADDING * 1.5}
                                  x2={(tick - xTicks[0]) * xScale.scaleFactor}
                                  y2={-PADDING}
                                  stroke="gray"
                                />
                              </>
                            )}
                          </For>

                          {/* For each pair of xTicks, put text in between showing the difference */}
                          <For
                            each={Array.from(
                              { length: xTicks.length - 1 },
                              (_, i) => i
                            )}
                          >
                            {(i) => {
                              const tick1 = xTicks[i];
                              const tick2 = xTicks[i + 1];
                              const diff = tick2 - tick1;
                              // Position text halfway between the two ticks
                              const x1 =
                                (tick1 - xTicks[0]) * xScale.scaleFactor;
                              const x2 =
                                (tick2 - xTicks[0]) * xScale.scaleFactor;
                              const xMid = (x1 + x2) / 2;
                              return (
                                <text
                                  transform="scale(1, -1)"
                                  x={xMid}
                                  y={PADDING * 1.75}
                                  text-anchor="middle"
                                  dominant-baseline="hanging"
                                  font-size="10px"
                                  fill="gray"
                                >
                                  {diff}
                                </text>
                              );
                            }}
                          </For>
                        </g>
                      );
                    })()}
                  </Show>
                  {/* x axis (discrete) */}
                  <Show
                    when={
                      axisVisibility.x &&
                      isORDINAL(underlyingSpaceX) &&
                      ordinalScales[0] &&
                      keyContext
                    }
                  >
                    {(() => {
                      const scale = ordinalScales[0]!;
                      // Use domain from ORDINAL space for top-level keys
                      const domain = isORDINAL(underlyingSpaceX)
                        ? underlyingSpaceX.domain
                        : undefined;
                      const labelKeys =
                        domain && domain.length > 0 ? domain : [];
                      // Get the minimum Y position for label placement
                      const entries = Object.entries(keyContext ?? {});
                      const minY = entries.reduce((min, [, node]) => {
                        if (!("intrinsicDims" in node) || !node.intrinsicDims)
                          return min;
                        const pathToRoot = findPathToRoot(node);
                        const accumulatedTransform = pathToRoot.reduce(
                          (acc, n) => {
                            return {
                              x: acc.x + (n.transform?.translate?.[0] ?? 0),
                              y: acc.y + (n.transform?.translate?.[1] ?? 0),
                            };
                          },
                          { x: 0, y: 0 }
                        );
                        const yPos =
                          accumulatedTransform.y +
                          (node.intrinsicDims[1]?.min ?? 0);
                        return Math.min(min, yPos);
                      }, Infinity);
                      return (
                        <g>
                          <For each={labelKeys}>
                            {(key) => {
                              const xPos = scale(key);
                              if (xPos === undefined) return null;
                              return (
                                <text
                                  transform="scale(1, -1)"
                                  x={xPos}
                                  y={-minY + 5}
                                  text-anchor="middle"
                                  dominant-baseline="hanging"
                                  font-size="10px"
                                  fill="gray"
                                >
                                  {key}
                                </text>
                              );
                            }}
                          </For>
                        </g>
                      );
                    })()}
                  </Show>
                  <Show
                    when={
                      axisVisibility.y &&
                      isORDINAL(underlyingSpaceY) &&
                      ordinalScales[1] &&
                      keyContext
                    }
                  >
                    {(() => {
                      const scale = ordinalScales[1]!;
                      // Use domain from ORDINAL space for top-level keys
                      const domain = isORDINAL(underlyingSpaceY)
                        ? underlyingSpaceY.domain
                        : undefined;
                      const labelKeys =
                        domain && domain.length > 0 ? domain : [];
                      // Get the minimum X position for label placement
                      const entries = Object.entries(keyContext ?? {});
                      const minX = entries.reduce((min, [, node]) => {
                        if (!("intrinsicDims" in node) || !node.intrinsicDims)
                          return min;
                        const pathToRoot = findPathToRoot(node);
                        const accumulatedTransform = pathToRoot.reduce(
                          (acc, n) => {
                            return {
                              x: acc.x + (n.transform?.translate?.[0] ?? 0),
                              y: acc.y + (n.transform?.translate?.[1] ?? 0),
                            };
                          },
                          { x: 0, y: 0 }
                        );
                        const xPos =
                          accumulatedTransform.x +
                          (node.intrinsicDims[0]?.min ?? 0);
                        return Math.min(min, xPos);
                      }, Infinity);
                      return (
                        <g>
                          <For each={labelKeys}>
                            {(key) => {
                              const yPos = scale(key);
                              if (yPos === undefined) return null;
                              return (
                                <text
                                  transform="scale(1, -1)"
                                  x={minX - 5}
                                  y={-yPos}
                                  text-anchor="end"
                                  dominant-baseline="middle"
                                  font-size="10px"
                                  fill="gray"
                                >
                                  {key}
                                </text>
                              );
                            }}
                          </For>
                        </g>
                      );
                    })()}
                  </Show>
                </g>
                {/* x axis title */}
                <Show when={axisVisibility.x && resolvedXTitle}>
                  <text
                    transform="scale(1, -1)"
                    x={width / 2}
                    y={PADDING * 3.5}
                    text-anchor="middle"
                    dominant-baseline="hanging"
                    font-size="11px"
                    fill="gray"
                  >
                    {resolvedXTitle}
                  </text>
                </Show>
                {/* y axis title */}
                <Show when={axisVisibility.y && resolvedYTitle}>
                  <text
                    transform={`translate(${-PADDING * 3.5}, ${height / 2}) scale(1, -1) rotate(-90)`}
                    text-anchor="middle"
                    dominant-baseline="middle"
                    font-size="11px"
                    fill="gray"
                  >
                    {resolvedYTitle}
                  </text>
                </Show>
                {/* legend (discrete color for now) */}
                <g>
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
                        transform={`translate(${width + PADDING * 3}, ${height - i() * 20})`}
                      >
                        <rect
                          x={-20}
                          y={-5}
                          width={10}
                          height={10}
                          fill={value}
                        />
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
              </>
            );
          })()}
        </Show>
      </g>
    </svg>
  );

  return result;
};
