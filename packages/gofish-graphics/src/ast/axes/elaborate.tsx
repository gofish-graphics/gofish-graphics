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
import { wrapPreservingIdentity } from "../elaborationUtils";
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
 * axis (`axis.x/y === true`) is wrapped. Because the axis becomes a
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
const ORDINAL_LABEL_GAP = 8; // gap between content edge and the ordinal label row
const CONTENT_NAME = "__axisContent"; // inner-tier name for the wrapped content
const INNER_REF_NAME = "__axisInner"; // outer-tier name for the wrapped content
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
const cross = (dim: 0 | 1): 0 | 1 => (1 - dim) as 0 | 1;
const crossName = (dim: 0 | 1) => dirName(cross(dim));

/** The bare tick-mark rect, oriented for axis `dim`. */
const tickRect = (dim: 0 | 1): GoFishNode =>
  Rect(
    dim === 1
      ? { w: TICK_LEN, h: 1, fill: AXIS_COLOR }
      : { w: 1, h: TICK_LEN, fill: AXIS_COLOR }
  );

/** Stringify a tick value without floating-point noise (0.1+0.2 → "0.3"). */
const fmtNum = (n: number) => String(+n.toPrecision(12));

/** A short label+tick mark pair, stacked along the cross axis. */
function tickMark(dim: 0 | 1, label: string, name: string): GoFishNode {
  return (Spread as any)(
    { dir: crossName(dim), spacing: LABEL_TICK_GAP, alignment: "middle" },
    [
      Text({ text: label, fontSize: LABEL_FONT_SIZE, fill: AXIS_COLOR }),
      tickRect(dim),
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
 * Seat the axis in the gutter beside the content, growing into NEGATIVE cross
 * space (into the SVG padding) rather than shifting the content. Keeping the
 * content pinned at the origin (see the orchestrator) is what lets the *other*
 * axis's posScale-positioned ticks stay aligned with it — otherwise a y-axis
 * gutter would push the content off the x-axis's tick grid (and vice versa).
 *   [tick labels] ← tick marks ← axis line ← | content (at origin)
 *
 * The LINE seats one of two ways:
 *  - `crossFloor` given (the other dim also has a position-like axis): the line
 *    sits flush at the PLOT edge — `position({[cross]: datum(crossFloor)})`,
 *    the other axis's scale minimum. The two lines then meet at the domain
 *    corner even when no datum reaches it (a scatter whose y domain starts
 *    below the lowest point must not draw its x axis at the lowest point).
 *  - otherwise: distribute just past the content's bbox edge (a bar chart's
 *    y axis sits beside the bars).
 */
function gutterConstraints(
  dim: 0 | 1,
  g: Record<string, any>,
  lineName: string,
  ticks: any[],
  crossFloor?: number
): any[] {
  // A degenerate domain can yield zero ticks; emit no gutter rather than
  // dereferencing ticks[0]/ticks[last] (which would crash applyDistribute).
  if (ticks.length === 0) return [];
  const d = crossName(dim);
  // "inner" = the edge facing the content (cross-end of the gutter pieces).
  const innerAlign = cross(dim) === 0 ? { x: "end" } : { y: "end" };
  const seat =
    crossFloor !== undefined
      ? // Standoff: the line sits AXIS_CONTENT_GAP outside the plot edge, so
        // marks at the domain floor (a y=0 histogram bin) don't straddle it.
        // Both lines get the same outward offset, so they still frame the
        // corner. `datum(v).offset(px)` = "this data position, plus pixels".
        Constraint.position(
          {
            [d]: datum(crossFloor).offset(-AXIS_CONTENT_GAP),
            anchor: "end",
          } as any,
          [g[lineName]]
        )
      : Constraint.distribute({ dir: d, spacing: AXIS_CONTENT_GAP }, [
          g[lineName],
          g[CONTENT_NAME],
        ]);
  return [
    seat,
    // Tick marks' inner edge flush with the line; labels extend into the gutter.
    Constraint.align(innerAlign as any, [...ticks, g[lineName]]),
  ];
}

/**
 * Shared builder for the two "position-like" axes (continuous + difference):
 * an axis line spanning [lineMin,lineMax] via datum endpoints, an anchor + tick
 * nodes pinned at their data values, an optional set of extra labels pinned at
 * data positions (the difference deltas), and the seated gutter. Factoring this
 * keeps the two kinds from drifting (e.g. a fix applied to only one).
 */
function positionAxis(opts: {
  dim: 0 | 1;
  prefix: string;
  lineMin: number;
  lineMax: number;
  tickValues: number[];
  /** Build the node for tick i (labeled for continuous, bare for difference). */
  tickNode: (v: number, i: number, name: string) => GoFishNode;
  /** Extra labels placed at a data position (difference delta labels). */
  extraLabels?: { value: number; text: string }[];
  /** The other dim's scale floor, when it also carries a position-like axis —
   *  seats this line at the plot corner instead of the content edge. */
  crossFloor?: number;
}): AxisElaboration {
  const { dim, prefix, lineMin, lineMax, tickValues } = opts;
  const lineName = `${prefix}line`;
  const tickName = (i: number) => `${prefix}t${i}`;
  const labelName = (i: number) => `${prefix}l${i}`;
  const pos = (v: number) =>
    (dim === 1 ? { y: datum(v) } : { x: datum(v) }) as any;

  const line = axisLine(dim, lineMin, lineMax, lineName);
  const tickNodes = tickValues.map((v, i) => opts.tickNode(v, i, tickName(i)));
  // Extra labels (difference deltas) are PLAIN text — no tick mark of their own,
  // or the axis ends up with a second row of ticks at the midpoints.
  const extra = opts.extraLabels ?? [];
  const labelNodes = extra.map((e, i) =>
    Text({ text: e.text, fontSize: LABEL_FONT_SIZE, fill: AXIS_COLOR }).name(
      labelName(i)
    )
  );

  const constraints = (g: Record<string, any>) => {
    const ticks = tickValues.map((_, i) => g[tickName(i)]);
    const cs: any[] = tickValues.map((v, i) =>
      Constraint.position(pos(v), [ticks[i]])
    );
    // Seat the gutter FIRST: constraints apply in order and placement is
    // first-write-wins, so the line must be placed before anything
    // distributes off it — an unplaced-anchor distribute would walk from 0
    // and drag the line into the plot. Tick marks align flush with the line
    // (their inner edge IS the tick).
    cs.push(...gutterConstraints(dim, g, lineName, ticks, opts.crossFloor));
    // Each extra label is pinned at its data position along the axis, and —
    // having no tick of its own to provide an offset — DISTRIBUTEs off the
    // (now seated) line, at the same outer offset as the continuous labels
    // (tick + gap).
    extra.forEach((e, i) => {
      const label = g[labelName(i)];
      cs.push(Constraint.position(pos(e.value), [label]));
      cs.push(
        Constraint.distribute(
          { dir: crossName(dim), spacing: TICK_LEN + LABEL_TICK_GAP },
          [label, g[lineName]]
        )
      );
    });
    return cs;
  };

  return { nodes: [line, ...tickNodes, ...labelNodes], constraints };
}

/** One continuous (POSITION) axis. Mirrors the hand-drawn ContinuousYAxis.
 *  `nice` is the d3-niced [min, max] of the domain, computed once by
 *  `elaborationsFor` (the same pair feeds the other axis's `crossFloor`, so
 *  computing it in one place keeps the corner consistent). */
function elaborateContinuousAxis(
  dim: 0 | 1,
  nice: [number, number],
  prefix: string,
  crossFloor?: number
): AxisElaboration {
  const [niceMin, niceMax] = nice;
  const tickValues = d3Ticks(niceMin, niceMax, TICK_COUNT);
  return positionAxis({
    dim,
    prefix,
    lineMin: niceMin,
    lineMax: niceMax,
    tickValues,
    tickNode: (v, _i, name) => tickMark(dim, fmtNum(v), name),
    crossFloor,
  });
}

/** One difference axis: bare tick marks at tick values, delta labels at midpoints. */
function elaborateDifferenceAxis(
  dim: 0 | 1,
  space: Extract<UnderlyingSpace, { kind: "difference" }>,
  prefix: string,
  crossFloor?: number
): AxisElaboration {
  // Scale over the RAW width (not a niced max) so the tick scale equals the
  // content's own width-based scaleFactor (size/width) and ticks line up with
  // the marks they annotate. The axis line spans [0, width]; ticks are nice
  // values within it. (The old bespoke path used v*scaleFactor for the same.)
  const width = space.width;
  const base = d3Ticks(0, width, TICK_COUNT);
  // End cap: the line's far end always carries a tick (the old bespoke axis
  // got this by overshooting to the next nice value; here the scale must stay
  // anchored to the content's size/width factor, so the cap sits at `width`
  // itself) — and the final, possibly partial, interval still gets its delta.
  const tickValues =
    base.length > 0 && base[base.length - 1] < width ? [...base, width] : base;
  const extraLabels = tickValues.slice(0, -1).map((v, i) => ({
    value: (v + tickValues[i + 1]) / 2,
    text: fmtNum(tickValues[i + 1] - v),
  }));
  return positionAxis({
    dim,
    prefix,
    lineMin: 0,
    lineMax: width,
    tickValues,
    tickNode: (_v, _i, name) => tickRect(dim).name(name),
    extraLabels,
    crossFloor,
  });
}

/**
 * One ordinal axis: a label per key. Each label is centered on its key node
 * along the axis (via a `ref` stand-in + `align`), but seated on a COMMON
 * baseline by `distribute`-ing it past the whole content's near edge — so the
 * labels form a straight row/column and don't follow each mark's own extent
 * (which would scatter them, e.g. under a negative bar). The distribute anchors
 * against the wrapped content layer (`INNER_REF_NAME`), whose bbox includes any
 * inner-facet labels — so an outer (e.g. lake) label row stacks BELOW the inner
 * (species) row instead of overlapping it. The orchestrator pins that layer on
 * the gutter dim so it can serve as the anchor.
 */
function elaborateOrdinalAxis(
  dim: 0 | 1,
  space: Extract<UnderlyingSpace, { kind: "ordinal" }>,
  keyMap: Record<string, GoFishNode>,
  prefix: string
): AxisElaboration {
  const keys = (space.domain ?? []).filter((k) => keyMap[k] !== undefined);
  const trackAxis = dirName(dim); // labels track their key along the axis dim
  const gutterDir = crossName(dim); // labels sit in the cross gutter
  const lName = (i: number) => `${prefix}ol${i}`;
  const rName = (i: number) => `${prefix}or${i}`;

  const nodes: GoFishNode[] = [];
  keys.forEach((k, i) => {
    nodes.push(
      Text({ text: k, fontSize: LABEL_FONT_SIZE, fill: AXIS_COLOR }).name(
        lName(i)
      )
    );
    nodes.push((ref(keyMap[k]) as any).name(rName(i)) as GoFishNode);
  });

  const constraints = (g: Record<string, any>) => {
    const cs: any[] = [];
    keys.forEach((_, i) => {
      // Track the key along the axis dim …
      cs.push(
        Constraint.align({ [trackAxis]: "middle" } as any, [
          g[lName(i)],
          g[rName(i)],
        ])
      );
      // … and sit just past the content's near edge in the gutter, anchored to
      // the whole content layer (so the row clears any nested inner labels)
      // rather than the individual mark.
      cs.push(
        Constraint.distribute({ dir: gutterDir, spacing: ORDINAL_LABEL_GAP }, [
          g[lName(i)],
          g[INNER_REF_NAME],
        ])
      );
    });
    return cs;
  };

  return { nodes, constraints };
}

/**
 * key→node for an ordinal axis. Walks the subtree collecting both explicit
 * `_ordinalKeyMap`s (set by operators like `table`, possibly on a descendant
 * when a wrapping layer owns the axis) and per-node `.key`s (set by faceting
 * operators). Shallower entries win on collision.
 */
function collectKeyMap(node: GoFishNode): Record<string, GoFishNode> {
  const out: Record<string, GoFishNode> = {};
  const walk = (n: GoFishNode) => {
    if (n._ordinalKeyMap) {
      for (const k of Object.keys(n._ordinalKeyMap)) {
        if (!(k in out)) out[k] = n._ordinalKeyMap[k];
      }
    }
    if (n.key !== undefined && !(n.key in out)) out[n.key] = n;
    n.children.forEach((c) => {
      if (c instanceof GoFishNode) walk(c);
    });
  };
  walk(node);
  return out;
}

/**
 * Build the elaborations for whichever axes `node` owns; clears its flags.
 * Splits them into two tiers because they place differently:
 *  - `constrained` (continuous/difference) seat a gutter via constraints that
 *    SHIFT the content; they must wrap the content directly.
 *  - `refBased` (ordinal) track the content via `ref(...)`, so they must be laid
 *    out AFTER the content is in its final (shifted) position — i.e. in an outer
 *    tier. Otherwise the ref captures the pre-shift position and the labels miss
 *    the continuous-axis gutter offset.
 */
function elaborationsFor(node: GoFishNode): {
  constrained: AxisElaboration[];
  refBased: AxisElaboration[];
} {
  const space = node._underlyingSpace;
  if (!space) return { constrained: [], refBased: [] };
  const owns = (dim: 0 | 1) => (dim === 0 ? node.axis.x : node.axis.y) === true;
  // Niced [min, max] per owned POSITION dim, computed ONCE: it feeds both that
  // axis's own line/ticks and the other axis's `crossFloor` (the plot corner),
  // so a nicing change can't skew the corner. A DIFFERENCE dim's floor is 0.
  const nices: ([number, number] | undefined)[] = [undefined, undefined];
  const floors: (number | undefined)[] = [undefined, undefined];
  for (const dim of [0, 1] as (0 | 1)[]) {
    if (!owns(dim)) continue;
    const s = space[dim];
    if (isPOSITION(s) && s.domain) {
      nices[dim] = d3Nice(s.domain.min!, s.domain.max!, TICK_COUNT);
      floors[dim] = nices[dim]![0];
    } else if (isDIFFERENCE(s)) {
      floors[dim] = 0;
    }
  }
  let keyMap: Record<string, GoFishNode> | undefined;
  const constrained: AxisElaboration[] = [];
  const refBased: AxisElaboration[] = [];
  for (const dim of [0, 1] as (0 | 1)[]) {
    if (!owns(dim)) continue;
    const s = space[dim];
    const prefix = dim === 1 ? "__y" : "__x";
    const crossFloor = floors[cross(dim)];
    if (isPOSITION(s) && s.domain) {
      constrained.push(
        elaborateContinuousAxis(dim, nices[dim]!, prefix, crossFloor)
      );
    } else if (isDIFFERENCE(s)) {
      constrained.push(elaborateDifferenceAxis(dim, s, prefix, crossFloor));
    } else if (isORDINAL(s)) {
      keyMap ??= collectKeyMap(node);
      refBased.push(elaborateOrdinalAxis(dim, s, keyMap, prefix));
    } else {
      continue;
    }
    if (dim === 0) node.axis.x = undefined;
    else node.axis.y = undefined;
  }
  return { constrained, refBased };
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

  const { constrained, refBased } = elaborationsFor(node);
  if (constrained.length === 0 && refBased.length === 0) {
    return { node, changed };
  }

  // Move identity off the content onto whatever ends up outermost (so the
  // parent — faceting/refs/select — still resolves to this node), build the
  // axis tiers, then restore the identity onto the outermost wrapper.
  const root = await wrapPreservingIdentity(node, async (content) => {
    // Inner tier: content + constraint-based (continuous/difference) axes. The
    // content is pinned at its own ORIGIN (baseline anchor, translate 0) so each
    // axis grows into negative gutter space; this keeps the content on the
    // posScale grid both axes' ticks use. The anchor must be `baseline`, not
    // `start`: nested content (facets carrying their own ordinal labels) has a
    // bbox extending past its origin, and pinning bbox-min would slide the marks
    // off the tick grid by that overhang.
    let inner: GoFishNode = content;
    if (constrained.length > 0) {
      content.name(CONTENT_NAME);
      const axisNodes = constrained.flatMap((e) => e.nodes);
      inner = (await (layer as any)([content, ...axisNodes])) as GoFishNode;
      inner.constrain((g) => [
        Constraint.align({ x: "baseline", y: "baseline" } as any, [
          g[CONTENT_NAME],
        ]),
        ...constrained.flatMap((e) => e.constraints(g)),
      ]);
    }

    // Outer tier: ref-based (ordinal) labels. The labels `distribute` against
    // `inner`, whose bbox includes any nested inner-facet labels — so an outer
    // label row stacks below the inner row. For that anchor to be "placed",
    // `inner` is baseline-pinned: its 0 point stays the layer's 0 point, and the
    // labels seat past its bbox edge in negative gutter space.
    let outerRoot = inner;
    if (refBased.length > 0) {
      inner.name(INNER_REF_NAME);
      const labelNodes = refBased.flatMap((e) => e.nodes);
      outerRoot = (await (layer as any)([inner, ...labelNodes])) as GoFishNode;
      outerRoot.constrain((g) => [
        Constraint.align({ x: "baseline", y: "baseline" } as any, [
          g[INNER_REF_NAME],
        ]),
        ...refBased.flatMap((e) => e.constraints(g)),
      ]);
    }

    return outerRoot;
  });

  return { node: root, changed: true };
}
