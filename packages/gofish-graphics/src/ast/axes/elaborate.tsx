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
import { wrapPreservingIdentity, fmtNum } from "../elaborationUtils";
import { datum } from "../data";
import { ticks as d3Ticks, nice as d3Nice } from "d3-array";
import {
  isPOSITION,
  isORDINAL,
  isDIFFERENCE,
  isCONTINUOUS,
  continuousInterval,
  type CONTINUOUS_TYPE,
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

/** A `labelAngle` value as authored: a plain number applies to every tier of
 *  a nested ordinal axis; an array is per-tier, indexed from the INNERMOST
 *  tier outward (see `AxisOptions.labelAngle` in `gofish.tsx`). */
type LabelAngleOpt = number | number[] | undefined;

/** Select the angle for a given ordinal tier (0 = innermost) — or, for a
 *  continuous/difference axis (always a single tier), tier `0`. A plain
 *  number applies uniformly; an array indexes by tier, `undefined` past its
 *  end (unrotated). */
function angleForTier(opt: LabelAngleOpt, tier: number): number | undefined {
  if (opt === undefined) return undefined;
  return Array.isArray(opt) ? opt[tier] : opt;
}

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

/** A short label+tick mark pair, stacked along the cross axis. The tick is the
 *  INNER element (facing the content) and the label the outer one, so the order
 *  follows `side`: with the axis on the near/start side the inner edge is the
 *  cross-`end`, so `[label, tick]`; on the far/end side the inner edge is the
 *  cross-`start`, so `[tick, label]`.
 *
 *  `labelAngle` (already sign-resolved for this node's flip scope, see
 *  `resolveLabelRotate`) rotates the label about its anchor. Rotation never
 *  changes alignment: the track-axis alignment stays centered regardless of
 *  angle, so a rotated label's (now off-axis) rotated bbox is centered on the
 *  tick exactly like an unrotated label's bbox would be. */
function tickMark(
  dim: 0 | 1,
  label: string,
  name: string,
  side: "start" | "end" = "start",
  labelAngle?: number
): GoFishNode {
  const text = Text({
    text: label,
    fontSize: LABEL_FONT_SIZE,
    fill: AXIS_COLOR,
    rotate: labelAngle,
  });
  const tick = tickRect(dim);
  return (Spread as any)(
    {
      dir: crossName(dim),
      spacing: LABEL_TICK_GAP,
      alignment: "middle",
    },
    side === "end" ? [tick, text] : [text, tick]
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
  crossFloor?: number,
  side: "start" | "end" = "start"
): any[] {
  // A degenerate domain can yield zero ticks; emit no gutter rather than
  // dereferencing ticks[0]/ticks[last] (which would create invalid placement
  // constraints).
  if (ticks.length === 0) return [];
  const d = crossName(dim);
  const atEnd = side === "end";
  // "inner" = the edge facing the content. With the axis on the near/start side
  // the content lies toward cross-`end`; on the far/end side it lies toward
  // cross-`start`. The ticks+line align flush on that inner edge; labels extend
  // outward into the gutter.
  const innerEdge = atEnd ? "start" : "end";
  const innerAlign = cross(dim) === 0 ? { x: innerEdge } : { y: innerEdge };
  const seat =
    crossFloor !== undefined
      ? // Standoff: the line sits AXIS_CONTENT_GAP outside the plot edge, so
        // marks at the domain floor (a y=0 histogram bin) don't straddle it.
        // Both lines get the same outward offset, so they still frame the
        // corner. `datum(v).offset(px)` = "this data position, plus pixels".
        // `side` flips which way "outward" is.
        Constraint.position(
          {
            [d]: datum(crossFloor).offset(
              atEnd ? AXIS_CONTENT_GAP : -AXIS_CONTENT_GAP
            ),
            anchor: innerEdge,
          } as any,
          [g[lineName]]
        )
      : Constraint.distribute(
          { dir: d, spacing: AXIS_CONTENT_GAP },
          atEnd
            ? [g[CONTENT_NAME], g[lineName]]
            : [g[lineName], g[CONTENT_NAME]]
        );
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
  /** Which frame edge to seat the axis on (default near/origin = "start"). */
  side?: "start" | "end";
}): AxisElaboration {
  const { dim, prefix, lineMin, lineMax, tickValues } = opts;
  const side = opts.side ?? "start";
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
    cs.push(
      ...gutterConstraints(dim, g, lineName, ticks, opts.crossFloor, side)
    );
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
          // Label sits on the OUTER side of the line — past it toward the gutter,
          // which flips with `side`.
          side === "end" ? [g[lineName], label] : [label, g[lineName]]
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
  crossFloor?: number,
  side: "start" | "end" = "start",
  labelAngle?: number
): AxisElaboration {
  const [niceMin, niceMax] = nice;
  const tickValues = d3Ticks(niceMin, niceMax, TICK_COUNT);
  return positionAxis({
    dim,
    prefix,
    lineMin: niceMin,
    lineMax: niceMax,
    tickValues,
    tickNode: (v, _i, name) => tickMark(dim, fmtNum(v), name, side, labelAngle),
    crossFloor,
    side,
  });
}

/** One difference axis: bare tick marks at tick values, delta labels at midpoints. */
function elaborateDifferenceAxis(
  dim: 0 | 1,
  space: CONTINUOUS_TYPE,
  prefix: string,
  crossFloor?: number,
  side: "start" | "end" = "start"
): AxisElaboration {
  // Scale over the RAW width (not a niced max) so the tick scale equals the
  // content's own width-based scaleFactor (size/width) and ticks line up with
  // the marks they annotate. The axis line spans [0, width]; ticks are nice
  // values within it. (The old bespoke path used v*scaleFactor for the same.)
  const width = space.width.run(1);
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
    side,
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
  prefix: string,
  side: "start" | "end" = "start",
  labelAngle?: number
): AxisElaboration {
  const keys = (space.domain ?? []).filter((k) => keyMap[k] !== undefined);
  const trackAxis = dirName(dim); // labels track their key along the axis dim
  const gutterDir = crossName(dim); // labels sit in the cross gutter
  const lName = (i: number) => `${prefix}ol${i}`;
  const rName = (i: number) => `${prefix}or${i}`;
  // Rotation never changes alignment: the track-axis alignment stays centered
  // regardless of `labelAngle`, so a rotated label's rotated bbox is centered
  // on its key just like an unrotated label's bbox would be.
  const trackAlign = "middle";

  const nodes: GoFishNode[] = [];
  keys.forEach((k, i) => {
    nodes.push(
      Text({
        text: k,
        fontSize: LABEL_FONT_SIZE,
        fill: AXIS_COLOR,
        rotate: labelAngle,
      }).name(lName(i))
    );
    nodes.push((ref(keyMap[k]) as any).name(rName(i)) as GoFishNode);
  });

  const constraints = (g: Record<string, any>) => {
    const cs: any[] = [];
    keys.forEach((_, i) => {
      // Track the key along the axis dim …
      cs.push(
        Constraint.align({ [trackAxis]: trackAlign } as any, [
          g[lName(i)],
          g[rName(i)],
        ])
      );
      // … and sit just past one of the content's gutter edges, anchored to the
      // whole content layer (so the row clears any nested inner labels) rather
      // than the individual mark. `side` picks the edge: "start" seats the row
      // before the content (label → content), "end" after it (content → label)
      // — flipping which frame edge (top/bottom or left/right) the axis lands on.
      const pair =
        side === "end"
          ? [g[INNER_REF_NAME], g[lName(i)]]
          : [g[lName(i)], g[INNER_REF_NAME]];
      cs.push(
        Constraint.distribute(
          { dir: gutterDir, spacing: ORDINAL_LABEL_GAP },
          pair
        )
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
  // BREADTH-first so the SHALLOWEST node with a given key wins — the grouping
  // bands this axis labels sit at one consistent (shallow) depth, while the
  // per-datum mark nodes below them carry bare positional keys ("0","1",…) that
  // COLLIDE with ordinal keys (e.g. cylinder values "3".."8", pclass "1".."3").
  // A pre-order DFS would let a deep datum key inside an EARLY sibling band beat
  // the real (later-sibling) band — collapsing every label past the first onto
  // one slot. Level-order makes "shallower wins" hold globally, not just within
  // a subtree, so the bands always claim their keys before any datum node.
  const queue: GoFishNode[] = [node];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (n._ordinalKeyMap) {
      for (const k of Object.keys(n._ordinalKeyMap)) {
        if (!(k in out)) out[k] = n._ordinalKeyMap[k];
      }
    }
    if (n.key !== undefined && !(n.key in out)) out[n.key] = n;
    n.children.forEach((c) => {
      if (c instanceof GoFishNode) queue.push(c);
    });
  }
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
 *
 * `tierCounts` is the per-dim count of ordinal axis tiers already elaborated
 * BELOW this node in the subtree (0 = none yet, i.e. this node — if it owns an
 * ordinal axis — is the innermost tier); see `elaborateAxes` for how it's
 * bubbled up. The returned `tierCounts` adds one per dim this node claimed an
 * ordinal axis on, so an ancestor owning the same dim's outer tier reads the
 * right index for a per-tier `labelAngle` array.
 */
function elaborationsFor(
  node: GoFishNode,
  sides: ["start" | "end" | undefined, "start" | "end" | undefined],
  yUp: boolean,
  underCoord: boolean,
  labelAngles: [LabelAngleOpt, LabelAngleOpt] = [undefined, undefined],
  tierCounts: [number, number] = [0, 0]
): {
  constrained: AxisElaboration[];
  refBased: AxisElaboration[];
  /** Per-dim [x, y] title anchor (the axis line) for the constrained axes this
   *  node owns; undefined where the node owns no position-like axis on that dim. */
  anchors: [GoFishNode | undefined, GoFishNode | undefined];
  /** Per-dim [x, y]: did this node own (and elaborate) an axis on that dim at
   *  all — including an ordinal one, which contributes no `anchors` entry. An
   *  owner CLAIMS the dim for title-anchoring purposes (see `elaborateAxes`). */
  owned: [boolean, boolean];
  /** Per-dim ordinal-tier count, incremented for each dim this node claimed
   *  an ordinal axis on (see the doc comment above). */
  tierCounts: [number, number];
} {
  const space = node._underlyingSpace;
  if (!space)
    return {
      constrained: [],
      refBased: [],
      anchors: [undefined, undefined],
      owned: [false, false],
      tierCounts,
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
    const iv = continuousInterval(s);
    if (isPOSITION(s) && iv) {
      nices[dim] = d3Nice(iv.min, iv.max, TICK_COUNT);
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
  // A continuous/difference X-axis with NO explicit `side` renders at the visual
  // BOTTOM by default (#143/#16/#629). It sits at its cross (y) axis's low edge;
  // which abstract edge that is depends on whether this owner's frame y-flips —
  // CONTINUOUS cross y (a scatter's value axis), a global `yUp`, or a `coord`
  // ancestor (a polar plot) all mirror the frame, so the near "start" edge lands
  // at the bottom; otherwise (a horizontal bar's ordinal category y, a faceted
  // stack's ordinal facet y) the far "end" edge is the bottom. An EXPLICIT `side`
  // is honored literally (frame-relative: `start`=near, `end`=far) — it is the
  // override, so a caller can still force the far edge. The Y-axis (dim 1) keeps
  // its `start` (left) default; the vertical flip never moves it horizontally.
  const axisSide = (dim: 0 | 1): "start" | "end" => {
    const userSide = sides[dim];
    if (dim !== 0) return userSide ?? "start";
    if (userSide !== undefined) return userSide;
    const crossFlips = yUp || underCoord || isCONTINUOUS(space[cross(dim)]);
    return crossFlips ? "start" : "end";
  };
  // `labelAngle` is authored screen-clockwise (Vega-Lite semantics), but the
  // `Text` `rotate` prop is applied in this node's own y-up WORLD frame and
  // gets negated at render time when that frame flips (see `text.tsx`'s
  // `flips ? -rotate : rotate`). This node's frame flips iff a y-up mirror
  // scope is active over it — the exact same predicate `axisSide` uses for
  // its own cross-flip check (`yUp || underCoord || isCONTINUOUS(space[1])`,
  // dim-independent since it's really "does THIS node's y mirror") — so we
  // pre-negate here to cancel that render-time negation and land back on the
  // literal screen angle regardless of the frame's orientation.
  const frameFlips = yUp || underCoord || isCONTINUOUS(space[1]);
  // `tier` is 0 for a continuous/difference axis (always single-tier) or the
  // bubbled-up ordinal tier index (0 = innermost) for an ordinal one.
  const resolvedLabelAngle = (dim: 0 | 1, tier: number): number | undefined => {
    const a = angleForTier(labelAngles[dim], tier);
    if (!a) return undefined;
    return frameFlips ? -a : a;
  };
  const outTierCounts: [number, number] = [...tierCounts];
  for (const dim of [0, 1] as (0 | 1)[]) {
    if (!owns(dim)) continue;
    const s = space[dim];
    const prefix = dim === 1 ? "__y" : "__x";
    const crossFloor = floors[cross(dim)];
    if (isPOSITION(s)) {
      const e = elaborateContinuousAxis(
        dim,
        nices[dim]!,
        prefix,
        crossFloor,
        axisSide(dim),
        resolvedLabelAngle(dim, 0)
      );
      constrained.push(e);
      anchors[dim] = e.anchor;
    } else if (isDIFFERENCE(s)) {
      const e = elaborateDifferenceAxis(
        dim,
        s,
        prefix,
        crossFloor,
        axisSide(dim)
      );
      constrained.push(e);
      anchors[dim] = e.anchor;
    } else if (isORDINAL(s)) {
      keyMap ??= collectKeyMap(node);
      // Ordinal axes keep the `start` default (they follow the content's own flip
      // like a category row); only continuous axes default to the bottom.
      const tier = outTierCounts[dim];
      refBased.push(
        elaborateOrdinalAxis(
          dim,
          s,
          keyMap,
          prefix,
          sides[dim] ?? "start",
          resolvedLabelAngle(dim, tier)
        )
      );
      outTierCounts[dim] = tier + 1;
    } else {
      continue;
    }
    owned[dim] = true;
    if (dim === 0) node.axis.x = undefined;
    else node.axis.y = undefined;
  }
  return { constrained, refBased, anchors, owned, tierCounts: outTierCounts };
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
 *
 * It also bubbles up `tierCounts` — the per-dim count of ordinal axis tiers
 * elaborated so far in this subtree — purely as an output (nothing is passed
 * DOWN for it): each dim is folded bottom-up as `max` over the node's own
 * children, then incremented by `elaborationsFor` if this node itself claims
 * an ordinal axis on that dim. That gives a node's ordinal axis a tier index
 * of 0 for the innermost nesting (e.g. a grouped bar chart's year row) and 1
 * for the next one out (its city row), which `elaborationsFor` uses to pick
 * the right entry of a per-tier `labelAngle` array. Sibling subtrees don't
 * interfere: each call only sees counts folded from ITS OWN children.
 */
export async function elaborateAxes(
  node: GoFishNode,
  sides: ["start" | "end" | undefined, "start" | "end" | undefined] = [
    undefined,
    undefined,
  ],
  yUp = false,
  underCoord = false,
  labelAngles: [LabelAngleOpt, LabelAngleOpt] = [undefined, undefined]
): Promise<{
  node: GoFishNode;
  changed: boolean;
  titleAnchors: [GoFishNode | undefined, GoFishNode | undefined];
  tierCounts: [number, number];
}> {
  let changed = false;
  const titleAnchors: [GoFishNode | undefined, GoFishNode | undefined] = [
    undefined,
    undefined,
  ];
  const tierCounts: [number, number] = [0, 0];
  // A `coord` (polar/clock) fixes its own frame orientation, so any axis inside
  // it flips with the coord rather than seating on the far edge directly. Track
  // whether we are under one so `axisSide` keeps the near/"start" seating there.
  const childUnderCoord =
    underCoord || (node as { type?: string }).type === "coord";
  // Bottom-up: replace each child with its elaborated form.
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child instanceof GoFishNode) {
      const res = await elaborateAxes(
        child,
        sides,
        yUp,
        childUnderCoord,
        labelAngles
      );
      if (res.changed) changed = true;
      // A child's anchor fills a dim slot we haven't claimed yet.
      for (const dim of [0, 1] as (0 | 1)[]) {
        if (titleAnchors[dim] === undefined && res.titleAnchors[dim]) {
          titleAnchors[dim] = res.titleAnchors[dim];
        }
        tierCounts[dim] = Math.max(tierCounts[dim], res.tierCounts[dim]);
      }
      if (res.node !== child) {
        node.children[i] = res.node;
        res.node.parent = node;
      }
    }
  }

  const {
    constrained,
    refBased,
    anchors,
    owned,
    tierCounts: nextTierCounts,
  } = elaborationsFor(
    node,
    sides,
    yUp,
    childUnderCoord,
    labelAngles,
    tierCounts
  );
  // Any dim this node owns an axis on is claimed — its own anchor replaces
  // whatever bubbled up from children, INCLUDING replacing it with undefined
  // when the owned axis is ordinal (so the title pass falls back to the plot
  // instead of centering on a nested facet's line).
  for (const dim of [0, 1] as (0 | 1)[]) {
    if (owned[dim]) titleAnchors[dim] = anchors[dim];
  }

  if (constrained.length === 0 && refBased.length === 0) {
    return { node, changed, titleAnchors, tierCounts: nextTierCounts };
  }

  // Move identity off the content onto whatever ends up outermost (so the
  // parent — faceting/refs/select — still resolves to this node), build the
  // axis tiers, then restore the identity onto the outermost wrapper.
  const root = await wrapPreservingIdentity(node, async (content) => {
    // Inner tier: content + constraint-based (continuous/difference) axes. The
    // content is pinned at its own ORIGIN (a literal-pixel position pin at the
    // origin: x:0/y:0, translate 0) so each axis grows into negative gutter
    // space; this keeps the content on the posScale grid both axes' ticks use.
    // The anchor must be `baseline`, not `start`: nested content (facets
    // carrying their own ordinal labels) has a bbox extending past its origin,
    // and pinning bbox-min would slide the marks off the tick grid by that
    // overhang.
    let inner: GoFishNode = content;
    if (constrained.length > 0) {
      content.name(CONTENT_NAME);
      const axisNodes = constrained.flatMap((e) => e.nodes);
      inner = (await (layer as any)([content, ...axisNodes])) as GoFishNode;
      inner.constrain((g) => [
        Constraint.position({ x: 0, y: 0, anchor: "baseline" }, [
          g[CONTENT_NAME],
        ]),
        ...constrained.flatMap((e) => e.constraints(g)),
      ]);
    }

    // Outer tier: ref-based (ordinal) labels. The labels `distribute` against
    // `inner`, whose bbox includes any nested inner-facet labels — so an outer
    // label row stacks below the inner row. For that anchor to be "placed",
    // `inner` is pinned at its origin (a literal-pixel position pin, x:0/y:0):
    // its 0 point stays the layer's 0 point, and the labels seat past its bbox
    // edge in negative gutter space.
    let outerRoot = inner;
    if (refBased.length > 0) {
      inner.name(INNER_REF_NAME);
      const labelNodes = refBased.flatMap((e) => e.nodes);
      outerRoot = (await (layer as any)([inner, ...labelNodes])) as GoFishNode;
      outerRoot.constrain((g) => [
        Constraint.position({ x: 0, y: 0, anchor: "baseline" }, [
          g[INNER_REF_NAME],
        ]),
        ...refBased.flatMap((e) => e.constraints(g)),
      ]);
    }

    return outerRoot;
  });

  return {
    node: root,
    changed: true,
    titleAnchors,
    tierCounts: nextTierCounts,
  };
}

// ── Axis titles ──────────────────────────────────────────────────────────────
//
// The CHART-level title pass. Unlike the per-owner axis pass above (which wraps
// every node that owns an axis, anywhere in the tree), titles are a single pass
// at the root: at most one title per dim, resolved by the orchestrator from the
// `axes` options + the root space's `measure` (the outermost grouping). A title
// is placed RELATIVE TO the
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
export const X_TITLE_NAME = "__xAxisTitle";
const Y_TITLE_NAME = "__yAxisTitle";

/** The x-axis title: horizontal text below the plot. The customization seam
 *  (like `legendColumn` / `tickMark`) — a future public API can override it. */
export function xAxisTitle(text: string): GoFishNode {
  const t = Text({ text, fontSize: TITLE_FONT_SIZE, fill: TITLE_COLOR }).name(
    X_TITLE_NAME
  );
  t._ambientYDown = true; // chrome: reads y-down, never in the plot flip scope (#629)
  return t;
}

/** The y-axis title, reading bottom-to-top (facing inward) in the left gutter.
 *  Text lowering applies `flips ? -rotate : rotate`, so the SAME screen rotation
 *  (-90°) needs the stored `rotate` to follow the frame: `90` under the y-up flip,
 *  `-90` in y-down (no flip). Otherwise a y-down chart (heatmap) reads its title
 *  top-to-bottom, facing outward. See issue #143/#16. Customization seam, like
 *  `xAxisTitle`. */
export function yAxisTitle(text: string, yUp = true): GoFishNode {
  const t = Text({
    text,
    fontSize: TITLE_FONT_SIZE,
    fill: TITLE_COLOR,
    rotate: yUp ? 90 : -90,
  }).name(Y_TITLE_NAME);
  t._ambientYDown = true; // chrome: reads y-down, never in the plot flip scope (#629)
  return t;
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
    yUp?: boolean;
    /** Per-dim axis side, so each title follows its axis to the same edge. */
    sides?: ["start" | "end", "start" | "end"];
  }
): Promise<GoFishNode> {
  const {
    xTitle,
    yTitle,
    anchors,
    plotNode,
    yUp = true,
    sides = ["start", "start"],
  } = opts;

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
      titles.push(yAxisTitle(yTitle, yUp));
    }

    const root = (await (layer as any)([
      content,
      ...refs,
      ...titles,
    ])) as GoFishNode;

    // Constraint order matters; placement is first-write-wins.
    root.constrain((g) => {
      const cs: any[] = [
        // Pin the content at its origin (a literal-pixel position pin, x:0/y:0);
        // it never moves. Everything else seats off the (already-placed) ref
        // stand-ins and this content bbox.
        Constraint.position({ x: 0, y: 0, anchor: "baseline" }, [
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
        // … and seat it past the FULL content bbox on the same edge as the
        // axis: title BEFORE the content seats it on the start edge, AFTER on
        // the end edge (so it clears the tick/label rows and tracks `side`).
        // This is authored in the shared ABSTRACT frame — the same side as the
        // axis labels. When the plot mirrors (y-up), the bake box-mirrors the
        // title (an `_ambientYDown` chrome sibling) about the plot's flip
        // scope, so it lands on the same VISUAL edge as the flipped labels;
        // its interior (glyphs, rotation) stays ambient. See bake.ts. #629
        cs.push(
          Constraint.distribute(
            { dir: "y", spacing: TITLE_CONTENT_GAP },
            sides[0] === "end"
              ? [g[TITLE_CONTENT_NAME], g[X_TITLE_NAME]]
              : [g[X_TITLE_NAME], g[TITLE_CONTENT_NAME]]
          )
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
        // … and seat it past the content bbox on the axis's side (left for
        // "start", right for "end").
        cs.push(
          Constraint.distribute(
            { dir: "x", spacing: TITLE_CONTENT_GAP },
            sides[1] === "end"
              ? [g[TITLE_CONTENT_NAME], g[Y_TITLE_NAME]]
              : [g[Y_TITLE_NAME], g[TITLE_CONTENT_NAME]]
          )
        );
      }
      return cs;
    });

    // The title wrapper only UNIONS the plot's continuous y up (to keep the space
    // valid for nicing); it is not itself the σ-scope. Mark it scope-transparent
    // so the y-up flip (#629) opens at the plot CONTENT it wraps — whose frame is
    // the canvas `finalH` — not at this wrapper (whose bbox includes the title,
    // which would over-size the mirror band). The titles themselves are
    // `_ambientYDown`, so they stay y-down regardless.
    root._scopeTransparent = true;
    return root;
  });
}
