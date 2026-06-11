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
  /** The node a chart-level axis title should center on — the axis line.
   *  Position-like axes (continuous/difference) set it; ordinal axes leave it
   *  unset (they're just a label row, with no spanning line to center on, so
   *  the title pass falls back to the plot bbox). */
  anchor?: GoFishNode;
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

  // `line` is the title anchor: a chart-level title for this dim centers on the
  // axis line's span (which may be narrower than the plot — a difference axis
  // spans the data width, a facet-owned axis spans its facet).
  return {
    nodes: [line, ...tickNodes, ...labelNodes],
    constraints,
    anchor: line,
  };
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
  /** Per-dim [x, y] title anchor (the axis line) for the constrained axes this
   *  node owns; undefined where the node owns no position-like axis on that dim. */
  anchors: [GoFishNode | undefined, GoFishNode | undefined];
  /** Per-dim [x, y]: did this node own (and elaborate) an axis on that dim at
   *  all — including an ordinal one, which contributes no `anchors` entry. An
   *  owner CLAIMS the dim for title-anchoring purposes (see `elaborateAxes`). */
  owned: [boolean, boolean];
} {
  const space = node._underlyingSpace;
  if (!space)
    return {
      constrained: [],
      refBased: [],
      anchors: [undefined, undefined],
      owned: [false, false],
    };
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
  const anchors: [GoFishNode | undefined, GoFishNode | undefined] = [
    undefined,
    undefined,
  ];
  const owned: [boolean, boolean] = [false, false];
  for (const dim of [0, 1] as (0 | 1)[]) {
    if (!owns(dim)) continue;
    const s = space[dim];
    const prefix = dim === 1 ? "__y" : "__x";
    const crossFloor = floors[cross(dim)];
    if (isPOSITION(s) && s.domain) {
      const e = elaborateContinuousAxis(dim, nices[dim]!, prefix, crossFloor);
      constrained.push(e);
      anchors[dim] = e.anchor;
    } else if (isDIFFERENCE(s)) {
      const e = elaborateDifferenceAxis(dim, s, prefix, crossFloor);
      constrained.push(e);
      anchors[dim] = e.anchor;
    } else if (isORDINAL(s)) {
      keyMap ??= collectKeyMap(node);
      refBased.push(elaborateOrdinalAxis(dim, s, keyMap, prefix));
    } else {
      continue;
    }
    owned[dim] = true;
    if (dim === 0) node.axis.x = undefined;
    else node.axis.y = undefined;
  }
  return { constrained, refBased, anchors, owned };
}

/**
 * Recursively elaborate axes. Children are processed first (bottom-up) so an
 * inner facet's axis is wrapped before its parent reads keys; the wrapper
 * inherits the wrapped node's `key`/`_name` so faceting and external refs keep
 * resolving to it.
 *
 * Alongside the elaborated tree it bubbles up `titleAnchors` — the per-dim
 * [x, y] axis-line node a chart-level title should center on. Anchors flow up
 * from the children (a child's anchor fills a still-empty dim slot), then any
 * dim this node OWNS an axis on is CLAIMED outright: the slot is overwritten
 * with this node's own anchor — the axis line for a position-like axis, or
 * `undefined` for an ordinal one (no spanning line; the title pass falls back
 * to the plot node, i.e. the span of the whole ordinal group). Because the
 * walk is bottom-up (children first, then self), the ROOT-most owner of a dim
 * wins — which is what a chart-level title should describe. The clearing
 * matters for faceted charts: the root owns the ordinal facet axis while each
 * facet owns a continuous axis on the SAME dim, and without the claim the
 * first facet's line would bubble past the root and drag the title onto one
 * subchart.
 *
 * Known limitation: multiple same-dim axis owners across SIBLING facets are
 * ambiguous here — they overwrite the same slot, so whichever sibling is
 * visited last wins. We don't try to disambiguate (a per-facet title is out of
 * scope); the chart-level title just tracks one of them.
 */
export async function elaborateAxes(node: GoFishNode): Promise<{
  node: GoFishNode;
  changed: boolean;
  titleAnchors: [GoFishNode | undefined, GoFishNode | undefined];
}> {
  let changed = false;
  const titleAnchors: [GoFishNode | undefined, GoFishNode | undefined] = [
    undefined,
    undefined,
  ];
  // Bottom-up: replace each child with its elaborated form.
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child instanceof GoFishNode) {
      const res = await elaborateAxes(child);
      if (res.changed) changed = true;
      // A child's anchor fills a dim slot we haven't claimed yet.
      for (const dim of [0, 1] as (0 | 1)[]) {
        if (titleAnchors[dim] === undefined && res.titleAnchors[dim]) {
          titleAnchors[dim] = res.titleAnchors[dim];
        }
      }
      if (res.node !== child) {
        node.children[i] = res.node;
        res.node.parent = node;
      }
    }
  }

  const { constrained, refBased, anchors, owned } = elaborationsFor(node);
  // Any dim this node owns an axis on is claimed — its own anchor replaces
  // whatever bubbled up from children, INCLUDING replacing it with undefined
  // when the owned axis is ordinal (so the title pass falls back to the plot
  // instead of centering on a nested facet's line).
  for (const dim of [0, 1] as (0 | 1)[]) {
    if (owned[dim]) titleAnchors[dim] = anchors[dim];
  }

  if (constrained.length === 0 && refBased.length === 0) {
    return { node, changed, titleAnchors };
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

  return { node: root, changed: true, titleAnchors };
}

// ── Axis titles ──────────────────────────────────────────────────────────────
//
// The CHART-level title pass. Unlike the per-owner axis pass above (which wraps
// every node that owns an axis, anywhere in the tree), titles are a single pass
// at the root: at most one title per dim, resolved by the orchestrator from the
// `axes` options + the inferred `axisFields`. A title is placed RELATIVE TO the
// elaborated axis shape it describes — the axis line for that dim, which may
// span less than the whole plot (a difference axis spans the data width; a
// facet-owned axis spans its facet). `elaborateAxes` hands us those axis-line
// nodes as `anchors`; we center the title on the one for its dim.
//
// This must run BEFORE the legend wrap: the legend seats itself off the titled
// content's bbox, so the title must already be in place — and conversely the
// title's centering must never see the legend column (it'd drag the title
// off-center). Same ordering argument the legend pass makes about itself.

const TITLE_FONT_SIZE = 11;
const TITLE_COLOR = "gray";
const TITLE_CONTENT_GAP = 8; // gap between a title and the full content bbox
const TITLE_CONTENT_NAME = "__titleContent";
const X_TITLE_ANCHOR_NAME = "__xTitleAnchor";
const Y_TITLE_ANCHOR_NAME = "__yTitleAnchor";
const X_TITLE_NAME = "__xAxisTitle";
const Y_TITLE_NAME = "__yAxisTitle";

/** The x-axis title: horizontal text below the plot. The customization seam
 *  (like `legendColumn` / `tickMark`) — a future public API can override it. */
export function xAxisTitle(text: string): GoFishNode {
  return Text({ text, fontSize: TITLE_FONT_SIZE, fill: TITLE_COLOR }).name(
    X_TITLE_NAME
  );
}

/** The y-axis title: `rotate: 90` (the Text rotate option) makes it read
 *  bottom-to-top in the left gutter. Customization seam, like `xAxisTitle`. */
export function yAxisTitle(text: string): GoFishNode {
  return Text({
    text,
    fontSize: TITLE_FONT_SIZE,
    fill: TITLE_COLOR,
    rotate: 90,
  }).name(Y_TITLE_NAME);
}

/**
 * Wrap `node` in a Layer carrying up to two axis titles, each centered on the
 * axis shape it describes and seated outside the full content bbox.
 *
 * Per titled dim the anchor is `anchors[dim] ?? plotNode`: the axis line node
 * elaboration produced for that dim if one exists (continuous / difference),
 * else the plot node itself. The fallback covers ordinal axes — they're just a
 * label row with no spanning line, and their UNDEFINED underlying space
 * elaborates no line node — so the plot's own bbox stands in as the thing to
 * center the title on. We reference the anchor with a `ref(node)` stand-in (the
 * direct-node `ref` form `elaborateOrdinalAxis` already uses): the title layer
 * is outermost, so by the time `align` reads the ref the axis line / plot is
 * already placed, and the ref resolves to that placement — so `align` moves
 * only the title.
 *
 * Both title Texts resolve UNDEFINED underlying spaces on both dims (they carry
 * no data-bound position), so `wrapPreservingIdentity` preserves the wrapped
 * content's underlying spaces unchanged — the same argument the legend pass
 * makes for its swatch column.
 *
 * The caller owns the "is there any title at all?" guard; this always wraps and
 * returns the new root.
 */
export async function elaborateAxisTitles(
  node: GoFishNode,
  opts: {
    xTitle?: string;
    yTitle?: string;
    anchors: [GoFishNode | undefined, GoFishNode | undefined];
    plotNode: GoFishNode;
  }
): Promise<GoFishNode> {
  const { xTitle, yTitle, anchors, plotNode } = opts;

  return wrapPreservingIdentity(node, async (content) => {
    content.name(TITLE_CONTENT_NAME);

    const refs: GoFishNode[] = [];
    const titles: GoFishNode[] = [];
    if (xTitle !== undefined) {
      const anchorNode = anchors[0] ?? plotNode;
      refs.push(
        (ref(anchorNode) as any).name(X_TITLE_ANCHOR_NAME) as GoFishNode
      );
      titles.push(xAxisTitle(xTitle));
    }
    if (yTitle !== undefined) {
      const anchorNode = anchors[1] ?? plotNode;
      refs.push(
        (ref(anchorNode) as any).name(Y_TITLE_ANCHOR_NAME) as GoFishNode
      );
      titles.push(yAxisTitle(yTitle));
    }

    const root = (await (layer as any)([
      content,
      ...refs,
      ...titles,
    ])) as GoFishNode;

    // Constraint order matters; placement is first-write-wins.
    root.constrain((g) => {
      const cs: any[] = [
        // Pin the content at its origin; it never moves. Everything else seats
        // off the (already-placed) ref stand-ins and this content bbox.
        Constraint.align({ x: "baseline", y: "baseline" }, [
          g[TITLE_CONTENT_NAME],
        ]),
      ];
      if (xTitle !== undefined) {
        // Center the x-title on the axis line's horizontal span (the ref is
        // already placed, so only the title moves) …
        cs.push(
          Constraint.align({ x: "middle" }, [
            g[X_TITLE_ANCHOR_NAME],
            g[X_TITLE_NAME],
          ])
        );
        // … and seat it below the FULL content bbox: title listed BEFORE the
        // placed content anchor, so distribute's backward walk places the
        // title's far (max) edge GAP below the content's min edge — clearing
        // the tick/ordinal label rows that are part of the content bbox.
        cs.push(
          Constraint.distribute({ dir: "y", spacing: TITLE_CONTENT_GAP }, [
            g[X_TITLE_NAME],
            g[TITLE_CONTENT_NAME],
          ])
        );
      }
      if (yTitle !== undefined) {
        // Mirror for the y-title: center on the axis line's vertical span …
        cs.push(
          Constraint.align({ y: "middle" }, [
            g[Y_TITLE_ANCHOR_NAME],
            g[Y_TITLE_NAME],
          ])
        );
        // … and seat it left of the full content bbox (the gutter).
        cs.push(
          Constraint.distribute({ dir: "x", spacing: TITLE_CONTENT_GAP }, [
            g[Y_TITLE_NAME],
            g[TITLE_CONTENT_NAME],
          ])
        );
      }
      return cs;
    });

    return root;
  });
}
