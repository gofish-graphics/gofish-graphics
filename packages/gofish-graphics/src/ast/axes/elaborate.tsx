// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Axes — /internals/frontend/axes
// </gofish-wiki>

import { GoFishNode } from "../_node";
import { Rect } from "../shapes/rect";
import { Text, estimateTextDimensions } from "../shapes/text";
import { Spread } from "../graphicalOperators/spread";
import { ref } from "../shapes/ref";
import { Constraint } from "../constraints";
import type { AlignAnchor } from "../constraints/shared";
import {
  breadthFirst,
  fmtNum,
  wrapPreservingIdentity,
  wrapRing,
  type ChromeRing,
} from "../elaborationUtils";
import { datum } from "../data";
import { ticks as d3Ticks, nice as d3Nice } from "d3-array";
import {
  isORDINAL,
  isCONTINUOUS,
  isUNDEFINED,
  dataWidth,
  type CONTINUOUS_TYPE,
  type UnderlyingSpace,
  axisOver,
  niceContinuous,
  originIs,
  spaceMeasure,
  axisTickPartition,
  DEFAULT_AXIS_TICKS,
  type AxisTicks,
} from "../underlyingSpace";
import type { AxesOptions, AxisOptions } from "../gofish";
import {
  orientSide,
  wrapperDirection,
  type AxisDirection,
} from "../axisDirection";
import {
  defaultTimeRows,
  labelsWithRoom,
  rowLabels,
  rowTicks,
  timeRowsFromOption,
  type TimeRow,
  type TimeRowOption,
} from "./timeRows";

/**
 * The edge an axis on `dim` seats on when its `side` is not given, in the
 * owner's axis order (`"start"` or `"end"`). A continuous x axis sits at the
 * bottom of the screen (`crossDirection` is its owner's y direction). Every
 * other axis takes `"start"` in
 * its frame: a y axis sits on the left, and a category x axis sits at the
 * start of its y (the bottom of a bar chart, the top of a heatmap).
 */
export function defaultAxisSide(
  dim: 0 | 1,
  space: UnderlyingSpace | undefined,
  crossDirection: AxisDirection
): "start" | "end" {
  if (dim === 1 || space === undefined || !isCONTINUOUS(space)) return "start";
  return orientSide("end", crossDirection);
}

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
const TICK_COUNT = DEFAULT_AXIS_TICKS.count;
const LABEL_FONT_SIZE = 10;
const LABEL_FONT_FAMILY = "system-ui, sans-serif"; // Text's default
const AXIS_COLOR = "gray";
const TIME_OUTER_TICK_LEN = 8; // a time axis's ticks for its outer rows
const TIME_ROW_GAP = 2; // gap between two label rows of a time axis

/** Per-dim [x, y] axis edge, in the owner's axis order; undefined = none
 *  given (an option) or no axis on that dim (an owner's result). */
type AxisSides = ["start" | "end" | undefined, "start" | "end" | undefined];

export type AxisElaboration = {
  /** Shapes to add as siblings of the content inside the wrapping layer. */
  nodes: GoFishNode[];
  /** Builds this axis's constraints from the layer's name→ref map. */
  constraints: (g: Record<string, any>) => any[];
  /** The node the axis's title centers on — the axis line. Position-like
   *  axes (continuous/difference) set it; ordinal axes leave it unset (they're
   *  just a label row, with no spanning line to center on, so the title
   *  centers on the owner's content box). */
  anchor?: GoFishNode;
  /** Where the content's baseline sits along this axis, in the axis's own
   *  data frame: a delta axis has no data 0, so its frame is its own, and it
   *  centers the content in its niced width. Unset: the content sits as its
   *  type says (see the axis gutters in `elaborateChrome`). */
  contentAt?: { dim: 0 | 1; at: number };
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

/** One row of axis labels: an axis, what kind of labels it carries, and its
 *  tier (0 = innermost ordinal tier; a continuous axis has only tier 0). */
export type LabelRow = {
  dim: 0 | 1;
  kind: "ordinal" | "continuous";
  tier: number;
};

/** How one label row is drawn: rotated by this many degrees (screen-
 *  clockwise, `undefined` = upright), or `"hidden"`: not drawn at all and
 *  taking no space. Only an ordinal row can be hidden. */
export type LabelRowSetting = number | "hidden" | undefined;

/** The setting of every label row. Axis elaboration asks it once per row. */
export type LabelRowSettings = (row: LabelRow) => LabelRowSetting;

/** The row settings a manual `labelAngle` per axis describes (see
 *  `AxisOptions.labelAngle`): a number for every tier, or per tier. */
export const labelRowSettingsFromAngles =
  (angles: [LabelAngleOpt, LabelAngleOpt]): LabelRowSettings =>
  (row) =>
    angleForTier(angles[row.dim], row.tier);

/**
 * How a `labelAngle`-rotated label is anchored to its tick/key — the
 * "hanging point" rule: the point of the rotated label nearest the axis line
 * is the point placed at the band/tick center, not the rotated bbox's
 * middle. `trackAlign` picks the `Constraint.align`/`Spread` anchor mode
 * along the TRACK axis (the axis's own direction — horizontal for an
 * x-axis); `textAnchor` picks which end of the (pre-rotation) label is its
 * x origin, i.e. the x that `"baseline"` alignment pins (see `_node.ts`'s
 * `_pinAnchor`: a `"baseline"` anchor places a node's local coordinate 0,
 * not a bbox edge). `Text`'s rotation is applied about a point with that
 * same x (`text.tsx`), so on an x track pinning it IS pinning the rotation
 * pivot. (A text's y origin is its box's start edge, like a rect's, so on a
 * y track the pin lands the rotated box's start edge instead.)
 *
 * Rule (screen-clockwise angle `a`; a bottom x-axis is the easiest intuition,
 * but the derivation only depends on the label's own local frame, not which
 * axis or side owns it):
 *  - `a` is 0/undefined: `trackAlign: "middle"` — plain bbox-middle
 *    centering, IDENTICAL to the unrotated path (no rotation is applied at
 *    all, so this case never even reaches `Text`'s `rotate`/`textAnchor`).
 *  - `|a| === 90`: also `trackAlign: "middle"` — the rotated column's bbox
 *    middle already centers it horizontally on the tick (explicit user
 *    feedback: this must not regress).
 *  - `0 < a < 90` (slants down-right): `trackAlign: "baseline"`,
 *    `textAnchor: "start"` — the pivot is the FIRST character's origin, so
 *    the label hangs from its start (Vega-Lite's 45° look).
 *  - `-90 < a < 0` (slants up-right): `trackAlign: "baseline"`,
 *    `textAnchor: "end"` — the pivot is the LAST character's origin, so the
 *    label hangs from its end (matplotlib's `ha="right"` look).
 *
 * Caveat, deliberately accepted: the label's pivot sits on its
 * baseline (`dominantBaseline: "auto"`), not the
 * ascender-TOP corner a literal "nearest point on the rotated bbox" geometric
 * derivation would use. The two differ by `ascent·sin(a)` — a couple of
 * pixels at these font sizes/angles — which the constraint system can't
 * express without extra bbox-edge arithmetic (`AlignAnchor` only has
 * `start`/`middle`/`end`/`baseline`, no fractional point). Using the
 * baseline pivot directly is visually indistinguishable here and needs no
 * extra machinery.
 */
type LabelRotation = {
  /** The degrees to pass to `Text`'s `rotate` (screen-clockwise). */
  rotate: number;
  trackAlign: "middle" | "baseline";
  textAnchor: "start" | "end";
};

function resolveLabelRotation(
  a: number | undefined
): LabelRotation | undefined {
  if (!a) return undefined;
  const rotate = a;
  if (Math.abs(a) === 90) {
    return { rotate, trackAlign: "middle", textAnchor: "start" };
  }
  return {
    rotate,
    trackAlign: "baseline",
    textAnchor: a < 0 ? "end" : "start",
  };
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

/** A short label+tick mark pair, spread along the cross axis. The tick is the
 *  INNER element (facing the content) and the label the outer one. A spread
 *  reads in pixel order (top-down, left-to-right; see `axisDirection.ts`), so
 *  the order follows where the axis sits on SCREEN: an axis at the cross
 *  axis's pixel start (top or left) has the content after it, so
 *  `[label, tick]`; an axis at the pixel end has it before, so `[tick, label]`.
 *  `side` is in the owner's axis order, and `crossDirection` (the owner's
 *  direction on the cross axis) turns it into the screen side.
 *
 *  Used only for the "middle" hanging-point case (unrotated / ±90°, see
 *  `LabelRotation`'s doc comment) — `elaborateContinuousAxis` bypasses this
 *  for an oblique angle in favor of a bare tick (`tickRect`) plus a separate
 *  sibling label positioned directly by `positionAxis`'s own constraints
 *  (`tickLabel`). That split matters: `positionAxis` pins each tick at its
 *  DATA value by the tick+label PAIR's own bbox middle (`Constraint.position`
 *  defaults to `anchor: "middle"`); for "middle" alignment the pair's bbox
 *  middle coincides with the shared tick/label centerline, so pinning it is
 *  correct. An oblique label's rotated bbox is NOT symmetric about its
 *  hanging-point pivot, so the pair's bbox middle would drift away from the
 *  data value by however lopsided the rotated glyph box is — the exact bug
 *  the hanging-point rule exists to avoid. Keeping a bare, unrotated,
 *  symmetric tick as the thing `Constraint.position` pins sidesteps that: its
 *  bbox middle IS its true center regardless of what the label next to it
 *  does. */
function tickMark(
  dim: 0 | 1,
  label: string,
  name: string,
  side: "start" | "end",
  crossDirection: AxisDirection,
  labelAngle?: number
): GoFishNode {
  const atPixelStart = side === orientSide("start", crossDirection);
  const text = Text({
    text: label,
    fontSize: LABEL_FONT_SIZE,
    fill: AXIS_COLOR,
    rotate: labelAngle,
  });
  // A continuous axis has one tier (see `AxisOptions.labelAngle`).
  text.axisLabel = { dim, kind: "continuous", tier: 0 };
  const tick = tickRect(dim);
  return (Spread as any)(
    {
      dir: crossName(dim),
      spacing: LABEL_TICK_GAP,
      alignment: "middle",
    },
    atPixelStart ? [text, tick] : [tick, text]
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
  /**
   * Build a SEPARATE per-tick label, when the tick itself (`tickNode`) is
   * bare — the oblique hanging-point path (see `elaborateContinuousAxis` and
   * `tickMark`'s doc comment for why the label can't just be nested inside
   * the tick node there). When given, each label ALIGNs to its tick
   * (`labelRotation`'s track-axis anchor, heterogeneous when oblique — the
   * label at its own pivot, the tick at "middle") and DISTRIBUTEs past it
   * into the gutter; `Constraint.position`'s per-tick data pin still targets
   * the bare tick alone, never the label.
   */
  tickLabel?: (v: number, i: number, name: string) => GoFishNode;
  /** Shared hanging-point descriptor for `tickLabel` (see `LabelRotation`'s
   *  doc comment) — only consulted when `tickLabel` is given. */
  labelRotation?: LabelRotation;
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
  const tickLabelName = (i: number) => `${prefix}tl${i}`;
  const pos = (v: number) =>
    (dim === 1 ? { y: datum(v) } : { x: datum(v) }) as any;

  const line = axisLine(dim, lineMin, lineMax, lineName);
  const tickNodes = tickValues.map((v, i) => opts.tickNode(v, i, tickName(i)));
  const tickLabelNodes = opts.tickLabel
    ? tickValues.map((v, i) => opts.tickLabel!(v, i, tickLabelName(i)))
    : [];
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
    // Data pin: always the bare tick's own bbox (its "middle" anchor is its
    // TRUE center regardless of what a sibling `tickLabel` does — see
    // `tickMark`'s doc comment for why an oblique label can't be nested
    // inside the pinned node).
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
    if (opts.tickLabel) {
      const trackAxis = dirName(dim);
      const gutterDir = crossName(dim);
      // Heterogeneous per-child anchor (see `positionAxis`'s `tickLabel` doc
      // comment): the label pivots at its own origin when oblique; the tick
      // keeps "middle" either way.
      const anchors: AlignAnchor[] =
        opts.labelRotation?.trackAlign === "baseline"
          ? ["baseline", "middle"]
          : ["middle", "middle"];
      tickValues.forEach((_, i) => {
        const label = g[tickLabelName(i)];
        const tick = ticks[i];
        cs.push(
          Constraint.align({ [trackAxis]: anchors } as any, [label, tick])
        );
        cs.push(
          Constraint.distribute(
            { dir: gutterDir, spacing: LABEL_TICK_GAP },
            side === "end" ? [tick, label] : [label, tick]
          )
        );
      });
    }
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

  // `line` is the title anchor: the axis's title centers on the
  // axis line's span (which may be narrower than the plot — a difference axis
  // spans the data width, a facet-owned axis spans its facet).
  return {
    nodes: [line, ...tickNodes, ...tickLabelNodes, ...labelNodes],
    constraints,
    anchor: line,
  };
}

/** One continuous (POSITION) axis. Mirrors the hand-drawn ContinuousYAxis.
 *  `nice` is the d3-niced [min, max] of the domain, computed once by
 *  `elaborationsFor` (the same pair feeds the other axis's `crossFloor`, so
 *  computing it in one place keeps the corner consistent).
 *
 *  `labelRotation`'s `trackAlign` picks how each tick's label is built (see
 *  `tickMark`'s and `positionAxis`'s `tickLabel` doc comments for why): the
 *  "middle" case (unrotated / ±90°) nests the label inside the tick node via
 *  `tickMark`, unchanged from before the hanging-point rule; the "baseline"
 *  (oblique) case keeps the tick bare and gives `positionAxis` a separate
 *  `tickLabel` builder instead, so the data-position pin never targets the
 *  (asymmetric, rotated) label's own bbox.
 *
 *  Over a `mirrored` space (both sides of 0 hold amounts measured away from
 *  it, e.g. a stack centered on a `HasMidpoint` column) each tick is labeled
 *  with its distance from 0, so a Likert axis reads `40 20 0 20 40`. */
function elaborateContinuousAxis(
  dim: 0 | 1,
  nice: [number, number],
  prefix: string,
  crossFloor: number | undefined,
  side: "start" | "end",
  crossDirection: AxisDirection,
  labelRotation?: LabelRotation,
  mirrored = false
): AxisElaboration {
  const [niceMin, niceMax] = nice;
  const tickValues = d3Ticks(niceMin, niceMax, TICK_COUNT);
  const oblique = labelRotation?.trackAlign === "baseline";
  const tickText = (v: number) => fmtNum(mirrored ? Math.abs(v) : v);
  return positionAxis({
    dim,
    prefix,
    lineMin: niceMin,
    lineMax: niceMax,
    tickValues,
    tickNode: oblique
      ? (_v, _i, name) => tickRect(dim).name(name)
      : (v, _i, name) =>
          tickMark(
            dim,
            tickText(v),
            name,
            side,
            crossDirection,
            labelRotation?.rotate
          ),
    tickLabel: oblique
      ? (v, _i, name) => {
          const label = Text({
            text: tickText(v),
            fontSize: LABEL_FONT_SIZE,
            fill: AXIS_COLOR,
            rotate: labelRotation!.rotate,
            textAnchor: labelRotation!.textAnchor,
          }).name(name);
          label.axisLabel = { dim, kind: "continuous", tier: 0 };
          return label;
        }
      : undefined,
    labelRotation,
    crossFloor,
    side,
  });
}

/**
 * One time axis: a continuous axis whose ticks and labels come from calendar
 * partitions (see axes/timeRows.ts). Ticks and labels are placed by the
 * axis's continuous scale, like any position axis. Each row is one
 * partition: its cells' starts are its ticks, and each label is centered on
 * its cell's start tick, as a numeric axis's labels are. Row 0 (the inner
 * row) sits past the ticks, as a continuous axis's labels do, and each
 * further row sits past the one before it. The inner row's ticks are short;
 * an outer row's are longer, so its boundaries stand out (where two rows
 * share a tick, it is drawn once, long).
 *
 * `nice` is the axis's domain, niced outward to the cells of the inner row
 * (`niceContinuous` with the axis's `ticks`, the same nicing its scope's
 * solve applies), so both ends are inner ticks. An outer row's first cell
 * may start before the domain: its label is centered on the first tick,
 * under the inner row's first label. `rows` are the rows the chart asks for
 * (`axes.x.rows`), else the inner row the domain picks
 * (`axisTickPartition`) and its parent level.
 *
 * A label is dropped when it comes within 5px of the next one in its row
 * (`labelsWithRoom`). Telling that needs the axis's pixel length before
 * layout: `axisLength`.
 * TODO(#1065): `axisLength` is the chart's canvas size on this dim, which is
 * the axis's length for an axis the chart root owns, but an overestimate for
 * an axis owned by a facet. It decides only which labels are dropped, never
 * the ticks or the domain.
 */
function elaborateTimeAxis(
  dim: 0 | 1,
  space: CONTINUOUS_TYPE,
  nice: [number, number],
  ticks: AxisTicks,
  prefix: string,
  crossFloor: number | undefined,
  side: "start" | "end",
  rowsOption: TimeRow[] | undefined,
  axisLength: number
): AxisElaboration {
  const [lo, hi] = nice;
  const zone = space.calendar!.zone;
  const font = (t: string) =>
    estimateTextDimensions(t, LABEL_FONT_SIZE, LABEL_FONT_FAMILY);
  const textWidth = (t: string) => font(t).width;
  // A label's length along the axis: its width on x, its height on y.
  const extent = dim === 0 ? textWidth : (t: string) => font(t).height;
  const pxPerMs = hi > lo ? axisLength / (hi - lo) : 0;
  const rows = rowsOption ?? defaultTimeRows(axisTickPartition(space, ticks));

  // Ticks: every row's cell starts, each drawn once, long if an outer row
  // has it.
  const tickLen = new Map<number, number>();
  rows.forEach((row, i) => {
    for (const t of rowTicks(row, lo, hi, zone)) {
      const len = i === 0 ? TICK_LEN : TIME_OUTER_TICK_LEN;
      tickLen.set(t, Math.max(tickLen.get(t) ?? 0, len));
    }
  });
  const tickValues = [...tickLen.keys()].sort((a, b) => a - b);

  const labels = rows.map((row) =>
    labelsWithRoom(rowLabels(row, lo, hi, zone), pxPerMs, extent)
  );
  // How far each row sits past the line: the ticks and gap, then every row
  // before it. A row's depth across the axis is its labels' height (x) or
  // its widest label (y).
  const rowDepth = (k: number) =>
    dim === 0
      ? font("0").height
      : Math.max(0, ...labels[k].map((l) => textWidth(l.text)));
  const rowOffset: number[] = [];
  let offset = TICK_LEN + LABEL_TICK_GAP;
  rows.forEach((_, k) => {
    rowOffset.push(offset);
    offset += rowDepth(k) + TIME_ROW_GAP;
  });

  const base = positionAxis({
    dim,
    prefix,
    lineMin: lo,
    lineMax: hi,
    tickValues,
    tickNode: (v, _i, name) =>
      Rect(
        dim === 1
          ? { w: tickLen.get(v)!, h: 1, fill: AXIS_COLOR }
          : { w: 1, h: tickLen.get(v)!, fill: AXIS_COLOR }
      ).name(name),
    crossFloor,
    side,
  });
  const lineName = `${prefix}line`;
  const labelName = (k: number, j: number) => `${prefix}r${k}l${j}`;
  const labelNodes = labels.flatMap((row, k) =>
    row.map((l, j) =>
      Text({
        text: l.text,
        fontSize: LABEL_FONT_SIZE,
        fill: AXIS_COLOR,
      }).name(labelName(k, j))
    )
  );
  const track = dirName(dim);
  return {
    ...base,
    nodes: [...base.nodes, ...labelNodes],
    constraints: (g) => {
      const cs = base.constraints(g);
      labels.forEach((row, k) =>
        row.forEach((l, j) => {
          const label = g[labelName(k, j)];
          // Centered on its tick along the axis, by the scale.
          cs.push(
            Constraint.position(
              { [track]: datum(l.at), anchor: "middle" } as any,
              [label]
            )
          );
          // Past the line by the rows before it, on the axis's outer side.
          cs.push(
            Constraint.distribute(
              { dir: crossName(dim), spacing: rowOffset[k] },
              side === "end" ? [g[lineName], label] : [label, g[lineName]]
            )
          );
        })
      );
      return cs;
    },
  };
}

/** One difference axis: bare tick marks at tick values, delta labels at
 *  midpoints. `space` is the content's space; the axis spans its niced width
 *  from 0, and the content sits centered in it (`contentAt`): a delta axis
 *  comes from centering (`middle` alignment), so its slack splits evenly. */
function elaborateDifferenceAxis(
  dim: 0 | 1,
  content: CONTINUOUS_TYPE,
  prefix: string,
  crossFloor?: number,
  side: "start" | "end" = "start"
): AxisElaboration {
  const space = niceContinuous(content);
  // `space` is the axis's niced space (`niceContinuous`), so its width is a
  // nice value from 0 and the ticks step evenly up to it: the scope that sizes
  // the content solves against the same niced width (`niceScope`), so ticks
  // line up with the marks they annotate. The axis line spans [0, width].
  const width = dataWidth(space);
  const tickValues = d3Ticks(0, width, TICK_COUNT);
  const contentAt = (width - dataWidth(content)) / 2;
  const extraLabels = tickValues.slice(0, -1).map((v, i) => ({
    value: (v + tickValues[i + 1]) / 2,
    text: fmtNum(tickValues[i + 1] - v),
  }));
  return {
    ...positionAxis({
      dim,
      prefix,
      lineMin: 0,
      lineMax: width,
      tickValues,
      tickNode: (_v, _i, name) => tickRect(dim).name(name),
      extraLabels,
      crossFloor,
      side,
    }),
    contentAt: { dim, at: contentAt },
  };
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
  labelRotation?: LabelRotation,
  tier = 0
): AxisElaboration {
  const keys = (space.domain ?? []).filter((k) => keyMap[k] !== undefined);
  const trackAxis = dirName(dim); // labels track their key along the axis dim
  const gutterDir = crossName(dim); // labels sit in the cross gutter
  const lName = (i: number) => `${prefix}ol${i}`;
  const rName = (i: number) => `${prefix}or${i}`;
  // Hanging-point rule (see `LabelRotation`'s doc comment): unrotated / ±90°
  // keeps the plain bbox-middle centering used before (pixel-identical to the
  // pre-hanging-point behavior); an oblique angle instead anchors the LABEL at
  // its own rotation pivot (`"baseline"`) while the key node it tracks stays
  // "middle"-anchored on its own extent — a heterogeneous per-child anchor,
  // via `Constraint.align`'s anchor-array form.
  const trackAnchors: AlignAnchor[] =
    labelRotation?.trackAlign === "baseline"
      ? ["baseline", "middle"]
      : ["middle", "middle"];

  const nodes: GoFishNode[] = [];
  keys.forEach((k, i) => {
    const label = Text({
      text: k,
      fontSize: LABEL_FONT_SIZE,
      fill: AXIS_COLOR,
      rotate: labelRotation?.rotate,
      textAnchor: labelRotation?.textAnchor,
    }).name(lName(i));
    label.axisLabel = { dim, kind: "ordinal", tier, field: space.measure };
    nodes.push(label);
    nodes.push((ref(keyMap[k]) as any).name(rName(i)) as GoFishNode);
  });

  const constraints = (g: Record<string, any>) => {
    const cs: any[] = [];
    keys.forEach((_, i) => {
      // Track the key along the axis dim …
      cs.push(
        Constraint.align({ [trackAxis]: trackAnchors } as any, [
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
  for (const n of breadthFirst(node)) {
    if (n._ordinalKeyMap) {
      for (const k of Object.keys(n._ordinalKeyMap)) {
        if (!(k in out)) out[k] = n._ordinalKeyMap[k];
      }
    }
    if (n.key !== undefined && !(n.key in out)) out[n.key] = n;
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
 * ordinal axis — is the innermost tier); see `elaborateChrome` for how it's
 * bubbled up. The returned `tierCounts` adds one per dim this node claimed an
 * ordinal axis on, so an ancestor owning the same dim's outer tier reads the
 * right index for a per-tier `labelAngle` array.
 */
function elaborationsFor(
  node: GoFishNode,
  sides: AxisSides,
  labelSettings: LabelRowSettings = () => undefined,
  tierCounts: [number, number] = [0, 0],
  timeOptions: Pick<ChromeOptions, "timeRows" | "axisLengths"> = {}
): {
  constrained: AxisElaboration[];
  refBased: AxisElaboration[];
  /** Per-dim [x, y] title anchor (the axis line) for the constrained axes this
   *  node owns; undefined where the node owns no position-like axis on that dim. */
  anchors: [GoFishNode | undefined, GoFishNode | undefined];
  /** Per-dim [x, y]: did this node own (and elaborate) an axis on that dim at
   *  all — including an ordinal one, which contributes no `anchors` entry. */
  owned: [boolean, boolean];
  /** Per-dim [x, y]: the edge each owned axis seats on, in the node's axis
   *  order; undefined on a dim the node owns no axis on. */
  sides: AxisSides;
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
      sides: [undefined, undefined],
      tierCounts,
    };
  // A node can own a dim (`resolveAxes` set `axis.x/y`) whose own
  // `_underlyingSpace` is the UNDEFINED sentinel — self-scaled children
  // collapse the union above them (see `GoFishNode.selfScaledSpace`'s doc
  // comment), which is right for sizing/layout but leaves nothing here to
  // build ticks from. `resolveAxes`'s sibling-unification branch handles
  // exactly this by stashing the shared child space it verified onto
  // `hoistedAxisSpace`; fall back to it only when the real space is missing,
  // so an ordinary (non-self-scaled) space is never overridden.
  const spaceFor = (dim: 0 | 1): UnderlyingSpace =>
    !isUNDEFINED(space[dim])
      ? node.placedSpace(space[dim])
      : (node.hoistedAxisSpace?.[dim] ?? space[dim]);
  const owns = (dim: 0 | 1) => (dim === 0 ? node.axis.x : node.axis.y) === true;
  // Niced [min, max] per owned POSITION dim, computed ONCE: it feeds both that
  // axis's own line/ticks and the other axis's `crossFloor` (the plot corner),
  // so a nicing change can't skew the corner. A DIFFERENCE dim's floor is 0.
  const nices: ([number, number] | undefined)[] = [undefined, undefined];
  const floors: (number | undefined)[] = [undefined, undefined];
  // What each owned axis ticks at, as `resolveAxes` stamped it: the same
  // ticks its scope's solve nices the domain to.
  const ticksFor = (dim: 0 | 1): AxisTicks =>
    node.axisDemand[dim] ?? DEFAULT_AXIS_TICKS;
  for (const dim of [0, 1] as (0 | 1)[]) {
    if (!owns(dim)) continue;
    const s = spaceFor(dim);
    if (axisOver(s) === "absolute") {
      const niced = niceContinuous(s, ticksFor(dim)) as CONTINUOUS_TYPE;
      nices[dim] = [niced.dataInterval.min, niced.dataInterval.max];
      floors[dim] = nices[dim]![0];
    } else if (axisOver(s) === "delta") {
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
  // Which edge each axis seats on, in the axis order of the wrapper it is
  // seated in: the explicit `side`, else the default (`defaultAxisSide`).
  // The direction of the axis across `dim`, in that wrapper: only y has one.
  const crossDirection = (dim: 0 | 1): AxisDirection =>
    dim === 0 ? wrapperDirection(node) : 1;
  const axisSide = (dim: 0 | 1): "start" | "end" =>
    sides[dim] ?? defaultAxisSide(dim, spaceFor(dim), crossDirection(dim));
  // `tier` is 0 for a continuous/difference axis (always single-tier) or the
  // bubbled-up ordinal tier index (0 = innermost) for an ordinal one. Returns
  // the full hanging-point descriptor (see `LabelRotation`), not just the
  // angle — `resolveLabelRotation` also derives the track-axis alignment mode
  // and, for an oblique angle, which end of the label anchors the rotation
  // pivot.
  const resolvedLabelRotation = (row: LabelRow): LabelRotation | undefined => {
    const setting = labelSettings(row);
    if (setting === "hidden") {
      // Only a category row can be hidden: a legend can carry categories, but
      // nothing else can carry a continuous axis's tick values.
      throw new Error(
        `axis elaboration: a ${row.kind} label row cannot be hidden`
      );
    }
    return resolveLabelRotation(setting);
  };
  const outTierCounts: [number, number] = [...tierCounts];
  for (const dim of [0, 1] as (0 | 1)[]) {
    if (!owns(dim)) continue;
    const s = spaceFor(dim);
    const prefix = dim === 1 ? "__y" : "__x";
    const crossFloor = floors[cross(dim)];
    const kind = axisOver(s);
    const rowsOption = timeOptions.timeRows?.[dim];
    if (rowsOption !== undefined && !(isCONTINUOUS(s) && s.calendar)) {
      throw new Error(
        `axes.${dirName(dim)}.rows: rows of calendar cells need a time axis, ` +
          `but this axis is not over a time column. Declare the column with ` +
          `Schema.time() in the chart's schema.`
      );
    }
    if (kind === "absolute" && isCONTINUOUS(s) && s.calendar) {
      const e = elaborateTimeAxis(
        dim,
        s,
        nices[dim]!,
        ticksFor(dim),
        prefix,
        crossFloor,
        axisSide(dim),
        rowsOption && timeRowsFromOption(rowsOption, dirName(dim)),
        timeOptions.axisLengths?.[dim] ?? 400
      );
      constrained.push(e);
      anchors[dim] = e.anchor;
    } else if (kind === "absolute" && isCONTINUOUS(s)) {
      const e = elaborateContinuousAxis(
        dim,
        nices[dim]!,
        prefix,
        crossFloor,
        axisSide(dim),
        crossDirection(dim),
        resolvedLabelRotation({ dim, kind: "continuous", tier: 0 }),
        s.mirrored === true
      );
      constrained.push(e);
      anchors[dim] = e.anchor;
    } else if (kind === "delta" && isCONTINUOUS(s)) {
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
      const tier = outTierCounts[dim];
      const row: LabelRow = { dim, kind: "ordinal", tier };
      // A hidden row draws nothing and takes no space, but the node still
      // claims the axis (and its tier), so no ancestor draws it instead.
      if (labelSettings(row) !== "hidden") {
        refBased.push(
          elaborateOrdinalAxis(
            dim,
            s,
            keyMap,
            prefix,
            axisSide(dim),
            resolvedLabelRotation(row),
            tier
          )
        );
      }
      outTierCounts[dim] = tier + 1;
    } else {
      continue;
    }
    owned[dim] = true;
    if (dim === 0) node.axis.x = undefined;
    else node.axis.y = undefined;
  }
  return {
    constrained,
    refBased,
    anchors,
    owned,
    sides: [
      owned[0] ? axisSide(0) : undefined,
      owned[1] ? axisSide(1) : undefined,
    ],
    tierCounts: outTierCounts,
  };
}

// ── Chrome elaboration ───────────────────────────────────────────────────────
//
// Chrome is everything drawn ABOUT a node rather than from its data: its axes
// (gutters of ticks, rows of category labels), their titles, and a legend.
// Each node that owns some elaborates it around itself, as rings of ordinary
// shapes + constraints. Every ring is a `layer` holding the rings inside it
// plus that ring's shapes, so each ring seats its shapes past everything
// inside it:
//
//   content                  the node itself, without chrome
//   ↳ axis gutters           continuous/difference axes
//   ↳ category label rows    ordinal axes, tracked by `ref`
//   ↳ axis titles            centered on the axis they name
//   ↳ legend                 beside all of the above
//
// The node's identity (name, key, visibility) moves onto the outermost ring,
// which records the boxes inside it as `chrome` (see `GoFishNode.chrome`).

/** How the chrome a chart asks for is drawn, beyond the axes `resolveAxes`
 *  assigned and the requests stamped on nodes (`GoFishNode._chromeRequest`). */
export type ChromeOptions = {
  /** Per-dim axis `side`; undefined = the axis's default edge. */
  sides?: AxisSides;
  /** How each axis label row is drawn. */
  labelSettings?: LabelRowSettings;
  /** Per-dim `rows` of a time axis (`AxisOptions.rows`), as authored. */
  timeRows?: [TimeRowOption[] | undefined, TimeRowOption[] | undefined];
  /** Per-dim length (px) a time axis assumes when it drops labels that have
   *  no room: the chart's canvas size on that dim (see `elaborateTimeAxis`). */
  axisLengths?: [number, number];
};

/**
 * Recursively elaborate chrome. Children are processed first (bottom-up) so an
 * inner facet's axis is wrapped before its parent reads keys; the wrapper
 * inherits the wrapped node's `key`/`_name` so faceting and external refs keep
 * resolving to it.
 *
 * What a node owns: the axes `resolveAxes` assigned it, and what its
 * `_chromeRequest` asks for: a title on each of those axes that the `axes`
 * options name, and a legend ring.
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
export async function elaborateChrome(
  node: GoFishNode,
  options: ChromeOptions = {}
): Promise<{
  node: GoFishNode;
  changed: boolean;
  tierCounts: [number, number];
}> {
  let changed = false;
  const tierCounts: [number, number] = [0, 0];
  // Bottom-up: replace each child with its elaborated form.
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child instanceof GoFishNode) {
      const res = await elaborateChrome(child, options);
      if (res.changed) changed = true;
      for (const dim of [0, 1] as (0 | 1)[]) {
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
    sides,
    tierCounts: nextTierCounts,
  } = elaborationsFor(
    node,
    options.sides ?? [undefined, undefined],
    options.labelSettings,
    tierCounts,
    options
  );
  // A title names an axis this node draws. The measure is read off the
  // node's own space, which elaboration has not re-resolved yet.
  const request = node._chromeRequest;
  node._chromeRequest = undefined;
  const titles = ([0, 1] as const).map((dim) =>
    owned[dim] && request !== undefined
      ? chartAxisTitle(
          request.axes,
          dim,
          spaceMeasure(node._underlyingSpace?.[dim])
        )
      : undefined
  ) as [string | undefined, string | undefined];
  const legend = request?.legend;

  if (
    constrained.length === 0 &&
    refBased.length === 0 &&
    titles[0] === undefined &&
    titles[1] === undefined &&
    legend === undefined
  ) {
    return { node, changed, tierCounts: nextTierCounts };
  }

  let withAxes: GoFishNode = node;
  const root = await wrapPreservingIdentity(node, async (content) => {
    let ring: GoFishNode = content;

    // Axis gutters: continuous/difference axes seat a gutter via constraints
    // that would SHIFT the content, so the content is seated first and each
    // axis grows into negative gutter space; this keeps the content on the
    // posScale grid both axes' ticks use. Where the content sits on each
    // axis: a delta axis says where in its own frame. Otherwise this is the
    // one seating rule (`seatInScope`): a free content (a bar chart's bars)
    // is a magnitude whose baseline the axis's frame places, so it is left
    // unpinned and the layer seats it at data 0 of the frame's map, so value
    // 0 sits at the 0 tick; a pinned content shares the frame, so its
    // baseline is the frame's 0 (a literal pixel pin). The anchor is
    // `baseline`, not `start`: nested content (facets carrying their own
    // ordinal labels) has a bbox extending past its origin, and pinning
    // bbox-min would slide the marks off the tick grid by that overhang.
    if (constrained.length > 0) {
      const contentSpace = content._underlyingSpace;
      const contentAt = (dim: 0 | 1) => {
        const at = constrained.find((e) => e.contentAt?.dim === dim)?.contentAt;
        if (at !== undefined) return datum(at.at);
        return originIs(contentSpace?.[dim], "free") ? undefined : 0;
      };
      ring = await wrapRing(
        ring,
        CONTENT_NAME,
        {
          nodes: constrained.flatMap((e) => e.nodes),
          constraints: (g) => constrained.flatMap((e) => e.constraints(g)),
        },
        { x: contentAt(0), y: contentAt(1) }
      );
    }

    // Category label rows: ordinal labels track their keys via `ref(...)`, so
    // they must be laid out AFTER the gutters have shifted the content (the
    // ref would otherwise capture the pre-shift position) — hence a ring of
    // their own. They `distribute` against the ring inside, whose bbox
    // includes any nested inner-facet labels, so an outer label row stacks
    // below the inner row.
    if (refBased.length > 0) {
      ring = await wrapRing(ring, INNER_REF_NAME, {
        nodes: refBased.flatMap((e) => e.nodes),
        constraints: (g) => refBased.flatMap((e) => e.constraints(g)),
      });
    }
    withAxes = ring;

    // Axis titles, seated past the axes so they clear the tick and label rows.
    if (titles[0] !== undefined || titles[1] !== undefined) {
      ring = await wrapRing(
        ring,
        TITLE_CONTENT_NAME,
        axisTitles(
          titles,
          [anchors[0] ?? content, anchors[1] ?? content],
          sides
        )
      );
    }

    // The legend, beside everything inside it, titles included.
    if (legend !== undefined) {
      ring = await wrapRing(ring, LEGEND_CONTENT_NAME, legend);
    }
    return ring;
  });
  root.chrome = { content: node, withAxes };

  return { node: root, changed: true, tierCounts: nextTierCounts };
}

// ── Axis titles ──────────────────────────────────────────────────────────────
//
// A title names an axis its owner draws. It is placed RELATIVE TO the axis
// shape it describes — the axis line for that dim, which may span less than
// the whole plot (a difference axis spans the data width) — and falls back to
// the owner's content box for an axis with no spanning line (a row of
// category labels).

export const TITLE_FONT_SIZE = 11;
export const TITLE_COLOR = "gray";

/** The title of the axis on `dim` from the chart's `axes` options: it is
 *  titled only when `axes` turns it on (`true`, or a dim's entry that is not
 *  `false`); its title is then {@link axisTitle}'s, with the axis's measure
 *  as the inferred name. */
function chartAxisTitle(
  axes: AxesOptions | undefined,
  dim: 0 | 1,
  measure: string | undefined
): string | undefined {
  if (axes === true) return measure;
  const opt =
    axes && typeof axes === "object" ? axes[dim === 0 ? "x" : "y"] : undefined;
  return opt === undefined || opt === false
    ? undefined
    : axisTitle(opt, measure);
}

/** The title of a drawn axis from its `axes` option: the option's `title`,
 *  none when it is `false`, and otherwise `inferred` (the axis's measure, or
 *  a name the caller falls back to). Whether the axis is drawn at all is the
 *  caller's rule. */
export function axisTitle(
  opt: AxisOptions | undefined,
  inferred: string | undefined
): string | undefined {
  const title = typeof opt === "object" && opt !== null ? opt.title : undefined;
  return title === false ? undefined : (title ?? inferred);
}
const TITLE_CONTENT_GAP = 8; // gap between a title and the box it is seated past
const TITLE_CONTENT_NAME = "__titleContent";
const LEGEND_CONTENT_NAME = "__legendContent";
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

/** The y-axis title, reading bottom-to-top (facing inward) in the left gutter:
 *  rotated a quarter turn counter-clockwise on screen. Customization seam, like
 *  `xAxisTitle`. */
export function yAxisTitle(text: string): GoFishNode {
  return Text({
    text,
    fontSize: TITLE_FONT_SIZE,
    fill: TITLE_COLOR,
    rotate: -90,
  }).name(Y_TITLE_NAME);
}

/**
 * The title ring: up to two axis titles, each centered on the node it
 * describes (`anchors[dim]`: the axis line, or the owner's content box) and
 * seated past the box inside the ring on the same edge as its axis
 * (`sides[dim]`, in the owner's axis order: a title BEFORE the box seats on
 * the start edge, AFTER it on the end edge).
 *
 * The anchor is referenced with a `ref(node)` stand-in: the anchor sits in a
 * ring inside this one, so by the time `align` reads the ref it is already
 * placed, and `align` moves only the title. Both title Texts resolve
 * UNDEFINED underlying spaces, so the ring preserves the owner's spaces.
 */
function axisTitles(
  titles: [string | undefined, string | undefined],
  anchors: [GoFishNode, GoFishNode],
  sides: AxisSides
): ChromeRing {
  const [xTitle, yTitle] = titles;
  const refs: GoFishNode[] = [];
  const texts: GoFishNode[] = [];
  if (xTitle !== undefined) {
    refs.push((ref(anchors[0]) as any).name(X_TITLE_ANCHOR_NAME) as GoFishNode);
    texts.push(xAxisTitle(xTitle));
  }
  if (yTitle !== undefined) {
    refs.push((ref(anchors[1]) as any).name(Y_TITLE_ANCHOR_NAME) as GoFishNode);
    texts.push(yAxisTitle(yTitle));
  }
  return {
    nodes: [...refs, ...texts],
    constraints: (g, inner) => {
      const cs: any[] = [];
      if (xTitle !== undefined) {
        cs.push(
          Constraint.align({ x: "middle" }, [
            g[X_TITLE_ANCHOR_NAME],
            g[X_TITLE_NAME],
          ])
        );
        cs.push(
          Constraint.distribute(
            { dir: "y", spacing: TITLE_CONTENT_GAP },
            sides[0] === "end"
              ? [g[inner], g[X_TITLE_NAME]]
              : [g[X_TITLE_NAME], g[inner]]
          )
        );
      }
      if (yTitle !== undefined) {
        cs.push(
          Constraint.align({ y: "middle" }, [
            g[Y_TITLE_ANCHOR_NAME],
            g[Y_TITLE_NAME],
          ])
        );
        cs.push(
          Constraint.distribute(
            { dir: "x", spacing: TITLE_CONTENT_GAP },
            sides[1] === "end"
              ? [g[inner], g[Y_TITLE_NAME]]
              : [g[Y_TITLE_NAME], g[inner]]
          )
        );
      }
      return cs;
    },
  };
}
