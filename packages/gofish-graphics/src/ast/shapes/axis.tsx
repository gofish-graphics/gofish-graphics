import type { JSX } from "solid-js";
import { For } from "solid-js";
import { ticks, nice } from "d3-array";
import { GoFishNode, findPathToRoot } from "../_node";
import {
  isPOSITION,
  isDIFFERENCE,
  isORDINAL,
  UNDEFINED,
  type UnderlyingSpace,
} from "../underlyingSpace";

export const AXIS_THICKNESS = 30;
const AXIS_LINE = AXIS_THICKNESS / 2;
const TICK_LEN = 4;
const LABEL_GAP = 7;

/**
 * Create an axis GoFishNode for a given dimension and underlying space.
 * Called from GoFishNode.layout() when axis_x or axis_y is true.
 */
export function createAxisNode({
  dim,
  space,
  contentSize,
  posScale,
}: {
  dim: 0 | 1;
  space: UnderlyingSpace;
  contentSize: number;
  posScale: ((v: number) => number) | undefined;
}): GoFishNode | null {
  if (isPOSITION(space) && posScale) {
    return ContinuousAxisNode({
      dim,
      domain: { min: space.domain.min!, max: space.domain.max! },
      posScale,
      contentSize,
    });
  }
  if (isDIFFERENCE(space) && posScale) {
    return DifferenceAxisNode({
      dim,
      width: space.width,
      posScale,
      contentSize,
    });
  }
  if (isORDINAL(space)) {
    return OrdinalAxisNode({ dim, domain: space.domain ?? [], contentSize });
  }
  return null;
}

/** Compute the position of keyNode's center along `dim` relative to `stopBefore`.
 *
 * In faceted charts multiple inner spreads share the same key names, so keyContext
 * may point to a node from a *different* facet than stopBefore. When stopBefore is
 * not an ancestor of keyNode we fall back to the nearest same-type ancestor so the
 * returned position is still a meaningful local offset rather than an absolute root
 * coordinate that lands off-screen.
 */
function posRelToAncestor(
  keyNode: GoFishNode,
  stopBefore: GoFishNode | undefined,
  dim: 0 | 1
): number {
  let pos = keyNode.intrinsicDims?.[dim]?.center ?? 0;
  const path = findPathToRoot(keyNode);
  // Prefer the exact stopBefore node; fall back to nearest ancestor of the same type.
  const effectiveStop =
    stopBefore && path.includes(stopBefore)
      ? stopBefore
      : stopBefore
        ? path.find((n) => n.type === stopBefore.type)
        : undefined;
  for (const n of path) {
    if (n === effectiveStop) break;
    pos += n.transform?.translate?.[dim] ?? 0;
  }
  return pos;
}

function ContinuousAxisNode({
  dim,
  domain,
  posScale,
  contentSize,
}: {
  dim: 0 | 1;
  domain: { min: number; max: number };
  posScale: (v: number) => number;
  contentSize: number;
}): GoFishNode {
  const crossDim = (1 - dim) as 0 | 1;

  return new GoFishNode(
    {
      type: `axis-continuous-${dim === 0 ? "x" : "y"}`,
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
      layout: () => {
        const intrinsicDims: Record<number, any> = {};
        intrinsicDims[dim] = {
          min: 0,
          max: contentSize,
          size: contentSize,
          center: contentSize / 2,
        };
        intrinsicDims[crossDim] = {
          min: 0,
          max: AXIS_THICKNESS,
          size: AXIS_THICKNESS,
          center: AXIS_THICKNESS / 2,
        };
        return {
          intrinsicDims,
          transform: {},
          renderData: { posScale, domain },
        };
      },
      render: ({ transform, renderData }) => {
        const tx = transform?.translate?.[0] ?? 0;
        const ty = transform?.translate?.[1] ?? 0;
        const { posScale: pScale, domain: dom } = renderData!;
        const [niceMin, niceMax] = nice(dom.min, dom.max, 10);
        const tickValues = ticks(niceMin, niceMax, 10);

        if (dim === 1) {
          // Y-axis: line at x=AXIS_LINE
          return (
            <g transform={`translate(${tx}, ${ty})`}>
              <line
                x1={AXIS_LINE}
                y1={pScale(niceMin) - 0.5}
                x2={AXIS_LINE}
                y2={pScale(niceMax) + 0.5}
                stroke="gray"
                stroke-width="1"
              />
              <For each={tickValues}>
                {(tick) => {
                  const yPos = pScale(tick);
                  return (
                    <>
                      <line
                        x1={AXIS_LINE - TICK_LEN}
                        y1={yPos}
                        x2={AXIS_LINE}
                        y2={yPos}
                        stroke="gray"
                        stroke-width="1"
                      />
                      <text
                        transform="scale(1,-1)"
                        x={AXIS_LINE - LABEL_GAP}
                        y={-yPos}
                        text-anchor="end"
                        dominant-baseline="middle"
                        font-size="10px"
                        fill="gray"
                      >
                        {tick}
                      </text>
                    </>
                  );
                }}
              </For>
            </g>
          ) as JSX.Element;
        } else {
          // X-axis: line at y=AXIS_LINE
          return (
            <g transform={`translate(${tx}, ${ty})`}>
              <line
                x1={pScale(niceMin) - 0.5}
                y1={AXIS_LINE}
                x2={pScale(niceMax) + 0.5}
                y2={AXIS_LINE}
                stroke="gray"
                stroke-width="1"
              />
              <For each={tickValues}>
                {(tick) => {
                  const xPos = pScale(tick);
                  return (
                    <>
                      <line
                        x1={xPos}
                        y1={AXIS_LINE - TICK_LEN}
                        x2={xPos}
                        y2={AXIS_LINE}
                        stroke="gray"
                        stroke-width="1"
                      />
                      <text
                        transform="scale(1,-1)"
                        x={xPos}
                        y={-(AXIS_LINE - LABEL_GAP)}
                        text-anchor="middle"
                        dominant-baseline="hanging"
                        font-size="10px"
                        fill="gray"
                      >
                        {tick}
                      </text>
                    </>
                  );
                }}
              </For>
            </g>
          ) as JSX.Element;
        }
      },
    },
    []
  );
}

function DifferenceAxisNode({
  dim,
  width,
  posScale,
  contentSize,
}: {
  dim: 0 | 1;
  width: number;
  posScale: (v: number) => number;
  contentSize: number;
}): GoFishNode {
  const crossDim = (1 - dim) as 0 | 1;

  return new GoFishNode(
    {
      type: `axis-difference-${dim === 0 ? "x" : "y"}`,
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
      layout: () => {
        const intrinsicDims: Record<number, any> = {};
        intrinsicDims[dim] = {
          min: 0,
          max: contentSize,
          size: contentSize,
          center: contentSize / 2,
        };
        intrinsicDims[crossDim] = {
          min: 0,
          max: AXIS_THICKNESS,
          size: AXIS_THICKNESS,
          center: AXIS_THICKNESS / 2,
        };
        return {
          intrinsicDims,
          transform: {},
          renderData: { posScale, width },
        };
      },
      render: ({ transform, renderData }) => {
        const tx = transform?.translate?.[0] ?? 0;
        const ty = transform?.translate?.[1] ?? 0;
        const { posScale: pScale, width: w } = renderData!;
        const [niceMin, niceMax] = nice(0, w, 10);
        const tickValues = ticks(niceMin, niceMax, 10);

        if (dim === 1) {
          return (
            <g transform={`translate(${tx}, ${ty})`}>
              <line
                x1={AXIS_LINE}
                y1={pScale(niceMin) - 0.5}
                x2={AXIS_LINE}
                y2={pScale(niceMax) + 0.5}
                stroke="gray"
                stroke-width="1"
              />
              <For each={tickValues}>
                {(tick, i) => {
                  const nextTick = tickValues[i() + 1];
                  const yPos = pScale(tick);
                  return (
                    <>
                      <line
                        x1={AXIS_LINE - TICK_LEN}
                        y1={yPos}
                        x2={AXIS_LINE}
                        y2={yPos}
                        stroke="gray"
                        stroke-width="1"
                      />
                      {nextTick !== undefined && (
                        <text
                          transform="scale(1,-1)"
                          x={AXIS_LINE - LABEL_GAP}
                          y={-((pScale(tick) + pScale(nextTick)) / 2)}
                          text-anchor="end"
                          dominant-baseline="middle"
                          font-size="10px"
                          fill="gray"
                        >
                          {nextTick - tick}
                        </text>
                      )}
                    </>
                  );
                }}
              </For>
            </g>
          ) as JSX.Element;
        } else {
          return (
            <g transform={`translate(${tx}, ${ty})`}>
              <line
                x1={pScale(niceMin) - 0.5}
                y1={AXIS_LINE}
                x2={pScale(niceMax) + 0.5}
                y2={AXIS_LINE}
                stroke="gray"
                stroke-width="1"
              />
              <For each={tickValues}>
                {(tick, i) => {
                  const nextTick = tickValues[i() + 1];
                  const xPos = pScale(tick);
                  return (
                    <>
                      <line
                        x1={xPos}
                        y1={AXIS_LINE - TICK_LEN}
                        x2={xPos}
                        y2={AXIS_LINE}
                        stroke="gray"
                        stroke-width="1"
                      />
                      {nextTick !== undefined && (
                        <text
                          transform="scale(1,-1)"
                          x={(pScale(tick) + pScale(nextTick)) / 2}
                          y={-(AXIS_LINE - LABEL_GAP)}
                          text-anchor="middle"
                          dominant-baseline="hanging"
                          font-size="10px"
                          fill="gray"
                        >
                          {nextTick - tick}
                        </text>
                      )}
                    </>
                  );
                }}
              </For>
            </g>
          ) as JSX.Element;
        }
      },
    },
    []
  );
}

function OrdinalAxisNode({
  dim,
  domain,
  contentSize,
}: {
  dim: 0 | 1;
  domain: string[];
  contentSize: number;
}): GoFishNode {
  const crossDim = (1 - dim) as 0 | 1;

  return new GoFishNode(
    {
      type: `axis-ordinal-${dim === 0 ? "x" : "y"}`,
      resolveUnderlyingSpace: () => [UNDEFINED, UNDEFINED],
      layout: () => {
        const intrinsicDims: Record<number, any> = {};
        intrinsicDims[dim] = {
          min: 0,
          max: contentSize,
          size: contentSize,
          center: contentSize / 2,
        };
        intrinsicDims[crossDim] = {
          min: 0,
          max: AXIS_THICKNESS,
          size: AXIS_THICKNESS,
          center: AXIS_THICKNESS / 2,
        };
        return {
          intrinsicDims,
          transform: {},
          renderData: { domain },
        };
      },
      render: ({ transform, renderData }, _children, node) => {
        const tx = transform?.translate?.[0] ?? 0;
        const ty = transform?.translate?.[1] ?? 0;
        const { domain: labelKeys } = renderData!;
        const keyContext = node.getRenderSession().keyContext;
        const parent = node.parent;

        if (dim === 0) {
          // X-axis ordinal: labels below content
          return (
            <g transform={`translate(${tx}, ${ty})`}>
              <For each={labelKeys}>
                {(key: string) => {
                  const keyNode = keyContext[key];
                  if (!keyNode) return null;
                  const globalX = posRelToAncestor(keyNode, parent, 0);
                  const localX = globalX - tx;
                  return (
                    <text
                      transform="scale(1,-1)"
                      x={localX}
                      y={-AXIS_LINE}
                      text-anchor="middle"
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
          ) as JSX.Element;
        } else {
          // Y-axis ordinal: labels left of content
          return (
            <g transform={`translate(${tx}, ${ty})`}>
              <For each={labelKeys}>
                {(key: string) => {
                  const keyNode = keyContext[key];
                  if (!keyNode) return null;
                  const globalY = posRelToAncestor(keyNode, parent, 1);
                  const localY = globalY - ty;
                  return (
                    <text
                      transform="scale(1,-1)"
                      x={AXIS_LINE + LABEL_GAP}
                      y={-localY}
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
          ) as JSX.Element;
        }
      },
    },
    []
  );
}
