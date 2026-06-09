// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Axes — /internals/frontend/axes
// </gofish-wiki>

import { GoFishNode } from "../_node";
import { Rect } from "../shapes/rect";
import { Text } from "../shapes/text";
import { Spread } from "../graphicalOperators/spread";
import { layer } from "../graphicalOperators/layer";
import { ref } from "../shapes/ref";
import { Constraint } from "../constraints";
import { datum } from "../data";
import { ticks as d3Ticks, nice as d3Nice } from "d3-array";
import {
  isPOSITION,
  isORDINAL,
  isDIFFERENCE,
  type UnderlyingSpace,
} from "../underlyingSpace";

/**
 * Axis elaboration: turn an inferred axis into ordinary GoFish shapes +
 * constraints, the same way the hand-drawn axes in stories/lowlevel/Axes.stories
 * are built. This replaces the bespoke axis-rendering pipeline (the former
 * shapes/axis.tsx + the budget machinery in _node.ts): an axis is no longer a
 * privileged node type, it's a `Layer` wrapping the content with tick/label
 * shapes pinned via `Constraint.position({ [axis]: datum(v) })` (continuous /
 * difference) or a direct `ref(...)` to the laid-out key (ordinal).
 *
 * The pass walks the tree bottom-up; any node `resolveAxes` flagged as owning an
 * axis (`axis.x/y === true | "budget"`) is wrapped. Because the axis becomes a
 * real shape occupying real space, cross-facet alignment and the stacking of
 * outer/inner axis labels fall out of ordinary layout — there is no budget
 * reservation, `innerBaseline` doubling, or per-facet local-posScale special
 * case anymore.
 *
 * Each `elaborate*Axis` is a pure function (returns shapes + a constraint
 * builder) so a future public API can override how a given axis kind renders.
 */

// Visual constants — chosen to match the previous bespoke axis styling.
const TICK_LEN = 4;
const LABEL_TICK_GAP = 3; // gap between a continuous label and its tick mark
const ORDINAL_LABEL_GAP = 6; // gap between an ordinal label and its key
const AXIS_CONTENT_GAP = 6; // gap between axis line and content
const TICK_COUNT = 10;
const LABEL_FONT_SIZE = 10;
const AXIS_COLOR = "gray";

export type AxisElaboration = {
  /** Shapes to add as siblings of the content inside the wrapping layer. */
  nodes: GoFishNode[];
  /** Builds this axis's constraints from the layer's name→ref map. */
  constraints: (g: Record<string, any>) => any[];
};

const dirName = (dim: 0 | 1) => (dim === 0 ? "x" : "y");

/** A short label+tick mark pair, stacked along the cross axis. */
function tickMark(dim: 0 | 1, label: string, name: string): GoFishNode {
  const crossDim = (1 - dim) as 0 | 1;
  return (Spread as any)(
    { dir: dirName(crossDim), spacing: LABEL_TICK_GAP, alignment: "middle" },
    [
      Text({ text: label, fontSize: LABEL_FONT_SIZE, fill: AXIS_COLOR }),
      Rect(
        dim === 1
          ? { w: TICK_LEN, h: 1, fill: AXIS_COLOR }
          : { w: 1, h: TICK_LEN, fill: AXIS_COLOR }
      ),
    ]
  ).name(name) as GoFishNode;
}

/** The axis line: a 1px rect auto-spanning [min,max] via datum endpoints. */
function axisLine(
  dim: 0 | 1,
  min: number,
  max: number,
  name: string
): GoFishNode {
  return Rect(
    dim === 1
      ? { w: 1, y: datum(min), y2: datum(max), fill: AXIS_COLOR }
      : { h: 1, x: datum(min), x2: datum(max), fill: AXIS_COLOR }
  ).name(name);
}

/**
 * Seat the gutter beside the content, flowing along the cross axis from a fixed
 * anchor (at the cross-start edge) so the gutter offset emerges positively:
 *   anchor → [tick labels, right-aligned] → axis line → content.
 * Mirrors the hand-drawn ContinuousYAxis, whose title played the anchor role.
 */
function gutterConstraints(
  dim: 0 | 1,
  g: Record<string, any>,
  anchorName: string,
  lineName: string,
  contentName: string,
  ticks: any[]
): any[] {
  const cross = (1 - dim) as 0 | 1;
  const d = dirName(cross);
  const startAlign = cross === 0 ? { x: "start" } : { y: "start" };
  // "inner" = the edge of each piece facing the content (cross-end).
  const innerAlign = cross === 0 ? { x: "end" } : { y: "end" };
  const last = ticks[ticks.length - 1];
  return [
    Constraint.align(startAlign as any, [g[anchorName]]),
    Constraint.distribute({ dir: d, spacing: 0 } as any, [g[anchorName], last]),
    Constraint.align(innerAlign as any, ticks),
    Constraint.distribute({ dir: d, spacing: 0 } as any, [
      ticks[0],
      g[lineName],
    ]),
    Constraint.distribute({ dir: d, spacing: AXIS_CONTENT_GAP } as any, [
      g[lineName],
      g[contentName],
    ]),
  ];
}

/** One continuous (POSITION) axis. Mirrors the hand-drawn ContinuousYAxis. */
function elaborateContinuousAxis(
  dim: 0 | 1,
  space: Extract<UnderlyingSpace, { kind: "position" }>,
  contentName: string,
  prefix: string
): AxisElaboration {
  const [niceMin, niceMax] = d3Nice(
    space.domain!.min!,
    space.domain!.max!,
    TICK_COUNT
  );
  const tickValues = d3Ticks(niceMin, niceMax, TICK_COUNT);
  const lineName = `${prefix}line`;
  const anchorName = `${prefix}anchor`;
  const tickName = (i: number) => `${prefix}t${i}`;

  const line = axisLine(dim, niceMin, niceMax, lineName);
  const anchor = Rect({ w: 0, h: 0 }).name(anchorName);
  const tickNodes = tickValues.map((v, i) =>
    tickMark(dim, String(v), tickName(i))
  );

  const constraints = (g: Record<string, any>) => {
    const ticks = tickValues.map((_, i) => g[tickName(i)]);
    const cs: any[] = tickValues.map((v, i) =>
      Constraint.position(
        (dim === 1 ? { y: datum(v) } : { x: datum(v) }) as any,
        [ticks[i]]
      )
    );
    cs.push(
      ...gutterConstraints(dim, g, anchorName, lineName, contentName, ticks)
    );
    return cs;
  };

  return { nodes: [anchor, line, ...tickNodes], constraints };
}

/** One difference axis: tick marks at tick values, delta labels at midpoints. */
function elaborateDifferenceAxis(
  dim: 0 | 1,
  space: Extract<UnderlyingSpace, { kind: "difference" }>,
  contentName: string,
  prefix: string
): AxisElaboration {
  const [niceMin, niceMax] = d3Nice(0, space.width, TICK_COUNT);
  const tickValues = d3Ticks(niceMin, niceMax, TICK_COUNT);
  const lineName = `${prefix}line`;
  const anchorName = `${prefix}anchor`;
  const tickName = (i: number) => `${prefix}t${i}`;

  const line = axisLine(dim, niceMin, niceMax, lineName);
  const anchor = Rect({ w: 0, h: 0 }).name(anchorName);
  // Bare tick marks (no label) pinned at each tick value, to anchor the gutter
  // and span the domain; delta labels sit between consecutive ticks.
  const tickNodes = tickValues.map((_, i) =>
    Rect(
      dim === 1
        ? { w: TICK_LEN, h: 1, fill: AXIS_COLOR }
        : { w: 1, h: TICK_LEN, fill: AXIS_COLOR }
    ).name(tickName(i))
  );
  const labelName = (i: number) => `${prefix}l${i}`;
  const labelNodes = tickValues
    .slice(0, -1)
    .map((v, i) => tickMark(dim, String(tickValues[i + 1] - v), labelName(i)));

  const constraints = (g: Record<string, any>) => {
    const ticks = tickValues.map((_, i) => g[tickName(i)]);
    const cs: any[] = tickValues.map((v, i) =>
      Constraint.position(
        (dim === 1 ? { y: datum(v) } : { x: datum(v) }) as any,
        [ticks[i]]
      )
    );
    // Delta labels at midpoints between consecutive ticks.
    tickValues.slice(0, -1).forEach((v, i) => {
      const mid = (v + tickValues[i + 1]) / 2;
      cs.push(
        Constraint.position(
          (dim === 1 ? { y: datum(mid) } : { x: datum(mid) }) as any,
          [g[labelName(i)]]
        )
      );
    });
    cs.push(
      ...gutterConstraints(dim, g, anchorName, lineName, contentName, ticks)
    );
    return cs;
  };

  return { nodes: [anchor, line, ...tickNodes, ...labelNodes], constraints };
}

/**
 * One ordinal axis: a label per key, stacked against the laid-out key node via a
 * direct ref (the ref makes the label track the content — no constraints).
 */
function elaborateOrdinalAxis(
  dim: 0 | 1,
  space: Extract<UnderlyingSpace, { kind: "ordinal" }>,
  keyMap: Record<string, GoFishNode>
): AxisElaboration {
  const crossDim = (1 - dim) as 0 | 1;
  const keys = (space.domain ?? []).filter((k) => keyMap[k] !== undefined);
  const nodes = keys.map(
    (k) =>
      (Spread as any)(
        {
          dir: dirName(crossDim),
          spacing: ORDINAL_LABEL_GAP,
          alignment: "middle",
        },
        [
          Text({ text: k, fontSize: LABEL_FONT_SIZE, fill: AXIS_COLOR }),
          ref(keyMap[k]),
        ]
      ) as GoFishNode
  );
  return { nodes, constraints: () => [] };
}

/** key→node for an ordinal node (mirrors the former axis.tsx key discovery). */
function collectKeyMap(node: GoFishNode): Record<string, GoFishNode> {
  if (node._ordinalKeyMap) return node._ordinalKeyMap;
  const out: Record<string, GoFishNode> = {};
  const walk = (n: GoFishNode) => {
    if (n.key !== undefined && !(n.key in out)) out[n.key] = n;
    n.children.forEach((c) => {
      if (c instanceof GoFishNode) walk(c);
    });
  };
  walk(node);
  return out;
}

/** Build the elaborations for whichever axes `node` owns; clears its flags. */
function elaborationsFor(node: GoFishNode): AxisElaboration[] {
  const space = node._underlyingSpace;
  if (!space) return [];
  const out: AxisElaboration[] = [];
  const contentName = "__axisContent";
  for (const dim of [0, 1] as (0 | 1)[]) {
    const flag = dim === 0 ? node.axis.x : node.axis.y;
    if (flag !== true && flag !== "budget") continue;
    const s = space[dim];
    const prefix = dim === 1 ? "__y" : "__x";
    if (isPOSITION(s) && s.domain) {
      out.push(elaborateContinuousAxis(dim, s, contentName, prefix));
    } else if (isDIFFERENCE(s)) {
      out.push(elaborateDifferenceAxis(dim, s, contentName, prefix));
    } else if (isORDINAL(s)) {
      out.push(elaborateOrdinalAxis(dim, s, collectKeyMap(node)));
    } else {
      continue;
    }
    if (dim === 0) node.axis.x = undefined;
    else node.axis.y = undefined;
  }
  return out;
}

/**
 * Recursively elaborate axes. Children are processed first (bottom-up) so an
 * inner facet's axis is wrapped before its parent reads keys; the wrapper
 * inherits the wrapped node's `key`/`_name` so faceting and external refs keep
 * resolving to it.
 */
export async function elaborateAxes(
  node: GoFishNode
): Promise<{ node: GoFishNode; changed: boolean }> {
  let changed = false;
  // Bottom-up: replace each child with its elaborated form.
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child instanceof GoFishNode) {
      const res = await elaborateAxes(child);
      if (res.changed) changed = true;
      if (res.node !== child) {
        node.children[i] = res.node;
        res.node.parent = node;
      }
    }
  }

  const elaborations = elaborationsFor(node);
  if (elaborations.length === 0) return { node, changed };

  const contentName = "__axisContent";
  const origName = node._name;
  const origKey = node.key;
  node.name(contentName);

  const axisNodes = elaborations.flatMap((e) => e.nodes);
  const wrapper = (await (layer as any)([node, ...axisNodes])) as GoFishNode;
  wrapper.constrain((g) => elaborations.flatMap((e) => e.constraints(g)));

  // Inherit identity so the parent (faceting/refs/select) still finds this node.
  if (origName !== undefined) wrapper._name = origName;
  if (origKey !== undefined) {
    wrapper.setKey(origKey);
    node.key = undefined;
  }
  return { node: wrapper, changed: true };
}
