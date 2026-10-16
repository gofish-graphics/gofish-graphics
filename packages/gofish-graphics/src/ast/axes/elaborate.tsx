// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Axes — /internals/frontend/axes
// </gofish-wiki>

import { GoFishNode } from "../_node";
import { Rect } from "../shapes/rect";
import { Text, estimateTextDimensions } from "../shapes/text";
import { FALLBACK_FONT_FAMILY } from "../shapes/fontUtils";
import { Spread } from "../graphicalOperators/spread";
import { ref } from "../shapes/ref";
import { Constraint } from "../constraints";
import { axisName, type AlignAnchor } from "../constraints/shared";
import {
  breadthFirst,
  fmtNum,
  wrapPreservingIdentity,
  wrapRing,
  type ChromeRing,
} from "../elaborationUtils";
import { datum } from "../data";
import { widenScope } from "../extent";
import { ticks as d3Ticks, nice as d3Nice } from "d3-array";
import {
  isORDINAL,
  isCONTINUOUS,
  dataWidth,
  type CONTINUOUS_TYPE,
  type UnderlyingSpace,
  axisOver,
  niceContinuous,
  originIs,
  spaceTitle,
  spaceCalendar,
  axisTickPartition,
  cellPartition,
  DEFAULT_AXIS_TICKS,
  type AxisTicks,
} from "../underlyingSpace";
import type { AxesOptions, AxisOptions } from "../gofish";
import {
  orientSide,
  wrapperDirection,
  type AxisDirection,
} from "../axisDirection";
import { rowLabels } from "./timeRows";
import { rotatedExtent } from "./autoLabelAngle";
import { axisSpan, runStartBox } from "./axisSpan";
import {
  applyLevelEntries,
  entryAt,
  readAtDepth,
  type LabelAlign,
  type LevelEntry,
  type LevelIssue,
  type LevelOptions,
  type PerLevel,
} from "./levels";
import { Cell, CycleCell, spell, type AxisCell, type KeyCell } from "../cells";
import {
  CalendarPartition,
  cycleFields,
  fieldsOf,
  nominalMs,
  zoned,
} from "../calendar";

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
const LABEL_FONT_SIZE = 10;
const AXIS_COLOR = "gray";
const TIME_OUTER_TICK_LEN = 8; // a time axis's ticks for its outer rows
const ROW_GAP = 2; // gap between two label rows of an axis on one dim

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

/** One row of axis labels: an axis, what kind of labels it carries, and its
 *  level's depth among the levels of the dim (0 = nearest the plot; see
 *  `AxisOptions.levels`). */
export type LabelRow = {
  dim: 0 | 1;
  kind: "ordinal" | "continuous";
  depth: number;
};

/** How one label row is drawn: rotated by this many degrees (screen-
 *  clockwise, `undefined` = upright), or `"hidden"`: not drawn at all and
 *  taking no space. Only an ordinal row can be hidden. */
export type LabelRowSetting = number | "hidden" | undefined;

/** The setting of every label row. Axis elaboration asks it once per row. */
export type LabelRowSettings = (row: LabelRow) => LabelRowSetting;

/** The row settings a manual `label.angle` per axis describes (see
 *  `AxisLabelOptions.angle`): a number for every level, or per level. */
export const labelRowSettingsFromAngles =
  (angles: [PerLevel<number>, PerLevel<number>]): LabelRowSettings =>
  (row) =>
    entryAt(angles[row.dim], row.depth);

/**
 * How a `label.angle`-rotated label is anchored to its tick/key — the
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
  if (Math.abs(a) === 90) {
    return { rotate: a, trackAlign: "middle", textAnchor: "start" };
  }
  return {
    rotate: a,
    trackAlign: "baseline",
    textAnchor: a < 0 ? "end" : "start",
  };
}

const cross = (dim: 0 | 1): 0 | 1 => (1 - dim) as 0 | 1;
const crossName = (dim: 0 | 1) => axisName(cross(dim));

/** The bare tick-mark rect, oriented for axis `dim`, `len` pixels long across
 *  it. */
const tickRect = (dim: 0 | 1, len = TICK_LEN): GoFishNode =>
  Rect(
    dim === 1
      ? { w: len, h: 1, fill: AXIS_COLOR }
      : { w: 1, h: len, fill: AXIS_COLOR }
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
  labelAngle: number | undefined,
  depth: number
): GoFishNode {
  const atPixelStart = side === orientSide("start", crossDirection);
  const text = Text({
    text: label,
    fontSize: LABEL_FONT_SIZE,
    fill: AXIS_COLOR,
    rotate: labelAngle,
  });
  // A numeric axis is one level, at `depth` among the levels of the dim.
  text.axisLabel = { dim, kind: "continuous", depth };
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
 *  - `crossFloor` given (the other dim is position-like, whichever node draws
 *    its axis): the line
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

/** One of `positionAxis`'s `extraLabels`. */
type ExtraLabel = {
  value: number;
  text: string;
  offset?: number;
};

/**
 * Shared builder for the "position-like" axes (continuous, time, difference):
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
  /** Extra labels placed at a data position, with no tick of their own:
   *  the delta labels of a difference axis, and the row labels of a time
   *  axis. Each sits `offset` pixels past the line (default: past the ticks,
   *  where a continuous axis's labels sit). `label.angle` does not rotate
   *  them, so they carry no `axisLabel` tag and `label.angle: "auto"` does
   *  not score them. */
  extraLabels?: ExtraLabel[];
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
  // Extra labels are PLAIN text — no tick mark of their own, or a
  // difference axis ends up with a second row of ticks at the midpoints.
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
      const trackAxis = axisName(dim);
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
    // (now seated) line, by default at the same outer offset as the
    // continuous labels (tick + gap).
    extra.forEach((e, i) => {
      const label = g[labelName(i)];
      cs.push(Constraint.position(pos(e.value), [label]));
      cs.push(
        Constraint.distribute(
          {
            dir: crossName(dim),
            spacing: e.offset ?? TICK_LEN + LABEL_TICK_GAP,
          },
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
  ticks: AxisTicks,
  prefix: string,
  crossFloor: number | undefined,
  side: "start" | "end",
  crossDirection: AxisDirection,
  labelRotation: LabelRotation | undefined,
  mirrored: boolean,
  depth: number
): AxisElaboration {
  const [niceMin, niceMax] = nice;
  const tickValues = d3Ticks(niceMin, niceMax, ticks.count);
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
            labelRotation?.rotate,
            depth
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
          label.axisLabel = { dim, kind: "continuous", depth };
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
 * further row sits past the one before it. Each tick is drawn once. A tick the
 * inner row has is short; an outer-row tick that falls between inner ticks
 * is longer, so it stands out. A tick marks a point and aims at the middle
 * of its label, so it stops where an inner row has its own tick there and
 * runs through the rows that lack one to reach its label: the opposite of
 * an ordinal axis's dividers, which separate regions (see
 * `elaborateOrdinalAxis`).
 *
 * `nice` is the axis's domain, niced outward to the cells of the inner row
 * (`niceContinuous` with the axis's `ticks`, the same nicing its scope's
 * solve applies), so both ends are inner ticks. An outer row's first cell
 * may start before the domain: its label is centered on the first tick,
 * under the inner row's first label. The rows are the axis's levels
 * ({@link timeRows}); a hidden row draws no ticks and no labels.
 *
 * Like a numeric axis, a time axis labels every tick and never drops a
 * label; choosing ticks from the labels' room is #1063. `label.angle` does
 * not rotate its labels yet: a rotated row would need its depth, and so the
 * offset of the rows past it, from its rotated label boxes.
 */
function elaborateTimeAxis(
  dim: 0 | 1,
  space: CONTINUOUS_TYPE,
  nice: [number, number],
  levels: readonly { level: CalendarPartition; hidden: boolean }[],
  prefix: string,
  crossFloor: number | undefined,
  side: "start" | "end"
): AxisElaboration {
  const [lo, hi] = nice;
  const zone = spaceCalendar(space)!.zone;
  const rows = levels.filter((r) => !r.hidden).map((r) => r.level);
  const starts = rows.map((row) => rowLabels(row, lo, hi, zone));
  // A row that cuts the same cells as the cells the axis places names
  // those cells: each label sits midway between its cell's two boundary
  // ticks (#1058). Any other row names points: each label sits on its tick.
  const cells = space.cells;
  const labels = rows.map((row, k) =>
    cells !== undefined && row.sameCells(cellPartition(space))
      ? cells
          .filter((c) => c.start >= lo && c.end <= hi)
          .map((c) => ({
            at: (c.start + c.end) / 2,
            text: row.label(c.calendar!.fields, zone),
          }))
      : starts[k]
  );

  // Ticks: every row's cell starts, each drawn once, inner row first. A
  // tick the inner row has is short; only an outer-row tick that falls
  // between inner ticks is long, so it stands out from the inner ticks
  // around it. (An outer label at the first tick, for a cell that starts
  // before the domain, adds no tick: the domain starts on an inner tick.)
  const tickLen = new Map<number, number>();
  starts.forEach((row, k) => {
    for (const l of row) {
      if (!tickLen.has(l.at))
        tickLen.set(l.at, k === 0 ? TICK_LEN : TIME_OUTER_TICK_LEN);
    }
  });
  const tickValues = [...tickLen.keys()].sort((a, b) => a - b);

  // How far each row sits past the line: the ticks and gap, then every row
  // before it. A row's depth across the axis is its labels' height (x) or
  // its widest label (y).
  const font = (t: string) =>
    estimateTextDimensions(t, LABEL_FONT_SIZE, FALLBACK_FONT_FAMILY);
  const rowDepth = (k: number) =>
    dim === 0
      ? font("0").height
      : Math.max(0, ...labels[k].map((l) => font(l.text).width));
  const rowOffset: number[] = [];
  let offset = TICK_LEN + LABEL_TICK_GAP;
  rows.forEach((_, k) => {
    rowOffset.push(offset);
    offset += rowDepth(k) + ROW_GAP;
  });

  return positionAxis({
    dim,
    prefix,
    lineMin: lo,
    lineMax: hi,
    tickValues,
    tickNode: (v, _i, name) => tickRect(dim, tickLen.get(v)!).name(name),
    extraLabels: labels.flatMap((row, k) =>
      row.map((l) => ({ value: l.at, text: l.text, offset: rowOffset[k] }))
    ),
    crossFloor,
    side,
  });
}

/** One difference axis: bare tick marks at tick values, delta labels at
 *  midpoints. `space` is the content's space; the axis spans its niced width
 *  from 0, and the content sits centered in it (`contentAt`): a delta axis
 *  comes from centering (`middle` alignment), so its slack splits evenly. */
function elaborateDifferenceAxis(
  dim: 0 | 1,
  content: CONTINUOUS_TYPE,
  ticks: AxisTicks,
  prefix: string,
  crossFloor?: number,
  side: "start" | "end" = "start"
): AxisElaboration {
  const space = niceContinuous(content, ticks);
  // `space` is the axis's niced space (`niceContinuous`), so its width is a
  // nice value from 0 and the ticks step evenly up to it: the scope that sizes
  // the content solves against the same niced width (`niceScope`), so ticks
  // line up with the marks they annotate. The axis line spans [0, width].
  const width = dataWidth(space);
  const tickValues = d3Ticks(0, width, ticks.count);
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

/** How one level of an ordinal axis is drawn, as its depth's settings say:
 *  hidden (by `label.angle: "auto"`), with its labels rotated, and with the
 *  explicit `label.align` and `divider` at its depth, if any (undefined =
 *  inferred). */
type LevelSetting = {
  hidden: boolean;
  rotation?: LabelRotation;
  align?: LabelAlign;
  divider?: boolean;
};

/** One level of an ordinal axis: the group each slot falls in (an id and a
 *  label), in slot order. Neighboring slots in one group are one run, and
 *  the level labels each run once. */
type OrdinalLevel = {
  name: string;
  groups: { id: string; label: string }[];
  /** The groups have an order (`HasOrder`): cells, or the levels of an
   *  ordered column. */
  hasOrder: boolean;
  /** For a level of cells, the column they bin: the field the axis's space
   *  groups by (`ORDINAL_TYPE.titles`, spread's `by`). Two levels over one
   *  column partition one value, so the outer one's runs get dividers by
   *  default. Undefined for a level of categories. */
  column?: string;
};

/** The `k`-th cell up a cell's chain (0 is the cell itself). */
const ancestor = (cell: KeyCell, k: number): KeyCell | undefined => {
  let c: KeyCell | undefined = cell;
  for (let i = 0; i < k && c !== undefined; i++) c = c.parent;
  return c;
};

/** How many cells a cell's chain holds: 1, plus one per bin before it. */
const chainLength = (cell: KeyCell): number => {
  let n = 0;
  for (let c: KeyCell | undefined = cell; c !== undefined; c = c.parent) n++;
  return n;
};

/**
 * The level that groups `cells` (the slots of an ordinal axis, in order) by
 * the cells of `p`: each slot falls in the cell of `p` that holds its START.
 * A slot that nests in `p` lies in that cell; one that does not is grouped
 * with the cell it begins in, so `Calendar.month` over week slots puts each
 * week in the month it starts in, as a calendar labels its weeks. A part of
 * a cycle falls the same way in a part of `p`'s reading of the same cycle (a
 * month of the year in a quarter of the year), so `p` must be a part of one
 * cell of the cycle (`whyNotAPart`). `p` must be at least as coarse as the
 * slots' level, compared by the levels' nominal lengths as a chain compares
 * them (`checkChain`): a finer one (a week over months) would give each slot
 * its own group. `column` is the column the slots bin. Returns a reason when
 * `p` does not group the slots.
 */
function calendarLevel(
  p: CalendarPartition,
  cells: readonly (AxisCell | undefined)[],
  column: string | undefined
): OrdinalLevel | string {
  const notTime =
    `${String(p)} groups slots of time, and these slots are not cells of a ` +
    `time column`;
  const first = cells[0];
  // The slots' own level: a cell's partition, or the finest level a part of
  // a cycle is named by.
  let slotLevel: CalendarPartition;
  if (first instanceof Cell && first.calendar !== undefined)
    slotLevel = first.calendar.partition;
  else if (first instanceof CycleCell) {
    const { unit, levels } = first.cycle;
    const why = unit.whyNotAPart(p);
    if (why !== undefined)
      return (
        `the slots are parts of a ${unit.unit} (${first.bin ?? spell(levels)}), ` +
        `but ${why}, so ${String(p)} does not group them`
      );
    slotLevel = levels[levels.length - 1];
  } else return notTime;
  if (nominalMs(p.unit, p.step) < nominalMs(slotLevel.unit, slotLevel.step))
    return (
      `${String(p)} is finer than the slots (${String(slotLevel)}), so it ` +
      `does not group them; name a coarser level`
    );
  // The slots are in order, so neighboring slots share a cell of `p`: it is
  // found once per run, and kept while the slots' starts lie in it.
  const groups: OrdinalLevel["groups"] = [];
  let outer: { start: number; end: number; id: string; label: string } = {
    start: Infinity,
    end: -Infinity,
    id: "",
    label: "",
  };
  for (const c of cells) {
    const onLine = c instanceof Cell && c.calendar !== undefined;
    if (onLine !== first instanceof Cell || !(onLine || c instanceof CycleCell))
      return notTime;
    const start = onLine ? (c as Cell).start : (c as CycleCell).ref[0];
    if (start < outer.start || start >= outer.end) {
      if (onLine) {
        const zone = (c as Cell).calendar!.zone;
        const s = p.floor(zoned(start, zone));
        const end = p.next(s).epochMilliseconds;
        outer = {
          start: s.epochMilliseconds,
          end,
          id: String(s.epochMilliseconds),
          label: p.label(fieldsOf(s, end, p.unit), zone),
        };
      } else {
        const s = p.floor(zoned(start, "UTC"));
        const t = s.epochMilliseconds;
        outer = {
          start: t,
          end: p.next(s).epochMilliseconds,
          id: String(p.partAt(s)),
          label: p.partLabel(
            cycleFields(t, p.unit, (c as CycleCell).cycle.unit.unit),
            t
          ),
        };
      }
    }
    groups.push({ id: outer.id, label: outer.label });
  }
  return { name: String(p), groups, hasOrder: true, column };
}

/**
 * The levels an ordinal axis over `slots` infers, nearest the plot first:
 * one for a split, or, for a key binned by a chain of bins
 * (`.bin(Calendar.year).bin(Calendar.month)`), one per bin, each grouping
 * the slots by their cell of that bin (the month level, then the year
 * level). `title` is the field the axis's space groups by: for cells, the
 * column they bin.
 */
function inferredOrdinalLevels(
  slots: readonly { key: string; cell?: AxisCell }[],
  title: string | undefined,
  hasOrder: boolean
): OrdinalLevel[] {
  const first = slots[0]?.cell;
  if (first === undefined || slots.some((s) => s.cell === undefined))
    return [
      {
        name: title !== undefined ? `the groups of "${title}"` : "the groups",
        groups: slots.map((s) => ({
          id: s.key,
          label: s.cell?.label ?? s.key,
        })),
        hasOrder,
      },
    ];
  const depth = chainLength(first);
  return Array.from({ length: depth }, (_, k) => ({
    name: ancestor(first, k)?.bin ?? "the cells",
    groups: slots.map((s) => {
      const c = ancestor(s.cell!, k);
      return { id: c?.id ?? "", label: c?.label ?? "" };
    }),
    hasOrder: true,
    column: title,
  }));
}

/**
 * One ordinal axis: the levels of the key it lays out, one row of labels
 * each, nearest the plot first (see {@link inferredOrdinalLevels}), as its
 * `levels` entries say (`entries[0]` is this axis's first level): `true`
 * keeps a level, `false` hides it, and a Calendar value groups the slots by
 * its cells instead (see {@link calendarLevel}). An outermost axis also
 * takes Calendar entries past its own levels, as more levels
 * ({@link applyLevelEntries}).
 *
 * Each label is centered on the run of slots it names: a slot's label on
 * its key node (via a `ref` stand-in + `align`), a run's on the stretch from
 * the run's first slot to its last ({@link axisSpan}). Each row is seated on
 * a COMMON baseline by `distribute`-ing it past the whole content's near
 * edge, so the labels form a straight row or column and don't follow each
 * mark's own extent (which would scatter them, e.g. under a negative bar).
 * The distribute anchors against the wrapped content layer
 * (`INNER_REF_NAME`), whose bbox includes any inner axes' labels, so an
 * outer axis stacks below the inner one instead of overlapping it; each row
 * sits past the rows before it.
 *
 * The rows of a dim are one stack from the plot edge, whichever axis draws
 * them: `below` is what the dim's inner axes drew ({@link DimFold}): their
 * levels (this axis's first level is at the depth after them), how deep
 * their rows reach, and the column their outer level bins. A row that
 * divides the row inside it (see below) follows it `ROW_GAP` apart; any
 * other row sits `ORDINAL_LABEL_GAP` past the rows inside it.
 *
 * Dividers: a level whose divider setting is on draws one in each gap where
 * its runs break, through the rows of every level with a boundary in that
 * gap, from the plot edge (or the row before) outward (see the divider code
 * below). By default a level's setting is on when it partitions the value
 * of the level inside it: it bins the same column (`OrdinalLevel.column`).
 * `levelAt(depth)` is how the level at a depth is drawn: hidden, rotated,
 * and its explicit `label.align` and `divider`, if any.
 */
function elaborateOrdinalAxis(
  dim: 0 | 1,
  space: Extract<UnderlyingSpace, { kind: "ordinal" }>,
  keyMap: Record<string, GoFishNode>,
  prefix: string,
  side: "start" | "end",
  levelAt: (depth: number) => LevelSetting,
  entries: readonly (LevelEntry | undefined)[],
  outermost: boolean,
  below: DimFold
): {
  elaboration: AxisElaboration;
  names: string[];
  issues: LevelIssue[];
  rowEnd: number;
  column: string | undefined;
} {
  const keys = (space.domain ?? []).filter((k) => keyMap[k] !== undefined);
  const trackAxis = axisName(dim); // labels track their key along the axis dim
  const gutterDir = crossName(dim); // labels sit in the cross gutter
  const title = spaceTitle(space);
  const depth0 = below.names.length;
  const rowsBelow = below.rowEnd;
  const cellOf = new Map(space.cells?.map((c) => [c.id, c]));
  const slots = keys.map((key) => ({
    key,
    cell: cellOf.get(key),
    node: keyMap[key],
  }));
  const issues: LevelIssue[] = [];

  // The levels: inferred, as the entries name them, and, on the outermost
  // axis, more levels from Calendar entries past the inferred ones.
  const inferred = inferredOrdinalLevels(slots, title, space.hasOrder === true);
  const slotCells = slots.map((s) => s.cell);
  const drawn = applyLevelEntries(
    (k) => inferred[k],
    entries,
    outermost,
    (p, k) => {
      const level = calendarLevel(p, slotCells, title);
      if (typeof level !== "string") return level;
      issues.push({ dim, option: "levels", depth: depth0 + k, reason: level });
      return undefined;
    }
  );
  const levels = drawn.map((d) => d.level);
  const settings = drawn.map((d, k) => {
    const s = levelAt(depth0 + k);
    return { ...s, hidden: s.hidden || d.hidden };
  });

  // Runs: each level's neighboring slots in one group, as [first, last].
  const runsOf = (level: OrdinalLevel): [number, number][] => {
    const runs: [number, number][] = [];
    level.groups.forEach((g, i) => {
      const last = runs[runs.length - 1];
      if (last !== undefined && level.groups[last[1]].id === g.id) last[1] = i;
      else runs.push([i, i]);
    });
    return runs;
  };
  const runs = levels.map(runsOf);

  // Each run's label box, as rotated; each row's depth across the axis (its
  // labels' height on x, its widest label on y); and how far past the
  // content it sits.
  const font = (t: string) =>
    estimateTextDimensions(t, LABEL_FONT_SIZE, FALLBACK_FONT_FAMILY);
  const boxes = levels.map((level, k) =>
    runs[k].map(([i]) => {
      const { width, height } = font(level.groups[i].label);
      return rotatedExtent(
        { minX: 0, minY: 0, maxX: width, maxY: height },
        settings[k].rotation?.rotate ?? 0
      );
    })
  );
  const along = (box: (typeof boxes)[number][number]) =>
    dim === 0 ? box.maxX - box.minX : box.maxY - box.minY;
  const across = (box: (typeof boxes)[number][number]) =>
    dim === 0 ? box.maxY - box.minY : box.maxX - box.minX;
  const rowDepth = boxes.map((row) => Math.max(0, ...row.map(across)));
  // Whether each level divides the row inside it: as `divider` says at its
  // depth, else when it partitions the value of the level inside it, that
  // is, it bins the same column (a chained key's levels always do; the
  // first level does when the inner axes' outer level bins its column).
  // Categories nested in other categories (a lake over its species) do not.
  const divides = levels.map((level, k) => {
    const inner = k > 0 ? levels[k - 1].column : below.column;
    return (
      settings[k].divider ??
      (level.column !== undefined && level.column === inner)
    );
  });
  // Every offset is from the plot edge: the rows of the dim's inner axes
  // (`rowsBelow` deep) come first, then this axis's rows, each `ROW_GAP`
  // past the one before. A first level that does not divide the inner
  // axes' rows sits `ORDINAL_LABEL_GAP` past them, as any axis sits past
  // the content inside it.
  const rowOffset: number[] = [];
  let offset =
    rowsBelow + (rowsBelow > 0 && divides[0] ? ROW_GAP : ORDINAL_LABEL_GAP);
  let rowEnd = rowsBelow;
  levels.forEach((_, k) => {
    rowOffset.push(offset);
    if (settings[k].hidden) return;
    rowEnd = offset + rowDepth[k];
    offset = rowEnd + ROW_GAP;
  });

  const lName = (k: number, r: number) =>
    k === 0 ? `${prefix}ol${r}` : `${prefix}ol${k}_${r}`;
  const sName = (i: number) => `${prefix}or${i}`;
  const spanName = (k: number, r: number) => `${prefix}os${k}_${r}`;
  const dName = (i: number) => `${prefix}od${i}`;
  // Each slot's ref, after the first level's label for that slot, if it has
  // one of its own; then the other labels, the spans they center on, and
  // the dividers.
  const slotNodes: GoFishNode[][] = slots.map((s, i) => [
    (ref(s.node) as any).name(sName(i)) as GoFishNode,
  ]);
  const nodes: GoFishNode[] = [];

  // Dividers. The rows of the dim, nearest the plot first: the inner axes'
  // rows (a group of an inner axis never crosses this axis's slots, so they
  // break at every gap), then this axis's visible levels. In each gap, every
  // run of neighboring rows that break there gets one divider when one of
  // its rows divides, through those rows; the first row's divider starts at
  // the plot edge, a later one's at the far edge of the row before it. A
  // divider separates regions, so it runs through the levels whose regions
  // also break here and stops at one whose region continues: the opposite
  // of a time axis's ticks, which mark points and run through the rows that
  // lack them to reach their labels.
  type Row = { start: number; end: number; divides: boolean; k?: number };
  const rows: Row[] = [];
  if (rowsBelow > 0) rows.push({ start: 0, end: rowsBelow, divides: false });
  levels.forEach((_, k) => {
    if (settings[k].hidden) return;
    rows.push({
      start: rows[rows.length - 1]?.end ?? 0,
      end: rowOffset[k] + rowDepth[k],
      divides: divides[k],
      k,
    });
  });
  const breaks = (row: Row, i: number) =>
    row.k === undefined ||
    levels[row.k].groups[i].id !== levels[row.k].groups[i + 1].id;
  const dividers: { at: number; start: number; end: number }[] = [];
  // `${gap}:${k}` for each level `k` a divider runs through in the gap
  // after slot `gap`.
  const divided = new Set<string>();
  for (let i = 0; i + 1 < slots.length; i++) {
    let run: Row[] = [];
    const close = () => {
      if (run.some((r) => r.divides)) {
        dividers.push({
          at: i,
          start: run[0].start,
          end: run[run.length - 1].end,
        });
        for (const r of run) if (r.k !== undefined) divided.add(`${i}:${r.k}`);
      }
      run = [];
    };
    for (const row of rows) {
      if (breaks(row, i)) run.push(row);
      else close();
    }
    close();
  }

  // Where each level's labels sit along the axis: as `label.align` says, else
  // at the start of each run for an outer level over ordered groups (each
  // label begins a run of ordered values, next to the divider before it),
  // else centered (a label collects the unordered groups, or the one slot,
  // beneath it).
  const aligns = levels.map(
    (level, k): LabelAlign =>
      settings[k].align ??
      ((k > 0 || below.ordinal) && level.hasOrder ? "start" : "center")
  );

  // A label and the box it centers on: its slot's ref or the span of its
  // run (centered), or a label-wide box at the start of its run (start).
  const pairs: { label: string; on: string; k: number }[] = [];
  levels.forEach((level, k) => {
    if (settings[k].hidden) return;
    const rotation = settings[k].rotation;
    runs[k].forEach(([a, b], r) => {
      const label = Text({
        text: level.groups[a].label,
        fontSize: LABEL_FONT_SIZE,
        fill: AXIS_COLOR,
        rotate: rotation?.rotate,
        textAnchor: rotation?.textAnchor,
      }).name(lName(k, r));
      label.axisLabel = {
        dim,
        kind: "ordinal",
        depth: depth0 + k,
        field: title,
      };
      // Ink along the axis: it may overdraw the next band (#1115).
      label.inkOn = dim === 0 ? [true, false] : [false, true];
      if (aligns[k] === "start") {
        nodes.push(label);
        nodes.push(
          runStartBox({
            dim,
            axisFirst: slots[0].node,
            axisLast: slots[slots.length - 1].node,
            first: slots[a].node,
            prev: a > 0 ? slots[a - 1].node : undefined,
            width: along(boxes[k][r]),
            pad: divided.has(`${a - 1}:${k}`) ? LABEL_TICK_GAP : 0,
          }).name(spanName(k, r))
        );
        pairs.push({ label: lName(k, r), on: spanName(k, r), k });
      } else if (a === b) {
        if (k === 0) slotNodes[a].unshift(label);
        else nodes.push(label);
        pairs.push({ label: lName(k, r), on: sName(a), k });
      } else {
        nodes.push(label);
        nodes.push(
          axisSpan({
            dim,
            from: { node: slots[a].node, edge: "start" },
            to: { node: slots[b].node, edge: "end" },
            cross: 0,
          }).name(spanName(k, r))
        );
        pairs.push({ label: lName(k, r), on: spanName(k, r), k });
      }
    });
  });

  dividers.forEach((d, n) =>
    nodes.push(
      axisSpan({
        dim,
        from: { node: slots[d.at].node, edge: "end" },
        to: { node: slots[d.at + 1].node, edge: "start" },
        cross: d.end - d.start,
        line: { color: AXIS_COLOR },
      }).name(dName(n))
    )
  );

  // Seat `node` `at` past the plot edge, which lies `rowsBelow` inside the
  // content's gutter edge (the inner axes' rows are past it). `side` picks
  // the edge: "start" seats it before the content (node → content), "end"
  // after it (content → node), flipping which frame edge (top/bottom or
  // left/right) the axis lands on.
  const seat = (g: Record<string, any>, node: any, at: number) =>
    Constraint.distribute(
      { dir: gutterDir, spacing: at - rowsBelow },
      side === "end" ? [g[INNER_REF_NAME], node] : [node, g[INNER_REF_NAME]]
    );
  const constraints = (g: Record<string, any>) => {
    const cs: any[] = [];
    // Hanging-point rule (see `LabelRotation`'s doc comment): unrotated /
    // ±90° keeps plain bbox-middle centering; an oblique angle anchors the
    // LABEL at its own rotation pivot (`"baseline"`) while what it tracks
    // stays "middle"-anchored, via `Constraint.align`'s anchor-array form.
    // A start-aligned label's box is its own rotated box, so it centers its
    // bbox on it at any angle.
    for (const { label, on, k } of pairs) {
      const anchors: AlignAnchor[] =
        aligns[k] === "center" &&
        settings[k].rotation?.trackAlign === "baseline"
          ? ["baseline", "middle"]
          : ["middle", "middle"];
      cs.push(
        Constraint.align({ [trackAxis]: anchors } as any, [g[label], g[on]])
      );
      cs.push(seat(g, g[label], rowOffset[k]));
    }
    dividers.forEach((d, n) => cs.push(seat(g, g[dName(n)], d.start)));
    return cs;
  };

  return {
    elaboration: { nodes: [...slotNodes.flat(), ...nodes], constraints },
    names: levels.map((l) => l.name),
    issues,
    rowEnd,
    column: levels[levels.length - 1]?.column,
  };
}

/**
 * The rows of a time axis, as its `levels` entries name them (`entries[0]`
 * is the axis's first level). It infers two: the inner row (the partition
 * of the cells it places, else the one its domain picks for about 10 ticks,
 * `axisTickPartition`) and that row's parent level, if it has one. A
 * Calendar entry names a row's partition, and `false` hides the row (its
 * ticks and labels; the domain is still niced to the inner row's cells).
 * The parent row follows the inner row as named. An outermost axis also
 * takes Calendar entries past its rows, as more rows
 * ({@link applyLevelEntries}).
 */
function timeRows(
  space: CONTINUOUS_TYPE,
  entries: readonly (LevelEntry | undefined)[],
  outermost: boolean
): { level: CalendarPartition; hidden: boolean }[] {
  return applyLevelEntries<CalendarPartition>(
    (k, before) =>
      k === 0
        ? axisTickPartition(space, DEFAULT_AXIS_TICKS)
        : k === 1
          ? before[0].parent
          : undefined,
    entries,
    outermost,
    (p) => p
  );
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

/** What the axes of a subtree drew on one dim, folded bottom-up by
 * {@link elaborateChrome}: the names of their levels, nearest the plot
 * first (so the next axis out starts at that depth); whether one of them is
 * an ordinal level (so the next ordinal level out is an outer one); how far
 * past the plot edge their ordinal label rows reach (so the next ordinal
 * axis out stacks its rows and dividers on them; 0 when none is drawn, or
 * when a continuous axis is drawn past them); and the column the outermost
 * of those ordinal levels bins (so the next ordinal axis out knows whether
 * its first level partitions the same value; undefined for categories, or
 * when the inner axes disagree). */
export type DimFold = {
  names: string[];
  ordinal: boolean;
  rowEnd: number;
  column: string | undefined;
};

/** What the axes of a subtree say, per dim, and the per-level entries that
 *  could not apply. */
export type LevelFold = { dims: [DimFold, DimFold]; issues: LevelIssue[] };

const emptyDimFold = (): DimFold => ({
  names: [],
  ordinal: false,
  rowEnd: 0,
  column: undefined,
});

const emptyFold = (): LevelFold => ({
  dims: [emptyDimFold(), emptyDimFold()],
  issues: [],
});

/** Whether a node above `node` will draw an axis on `dim`, so `node`'s axis
 *  is not the outermost on it. Ancestors are elaborated after `node`, so
 *  their `axis` flags are still set. */
function hasOuterAxis(node: GoFishNode, dim: 0 | 1): boolean {
  for (let p = node.parent; p !== undefined; p = p.parent) {
    if (p instanceof GoFishNode && (dim === 0 ? p.axis.x : p.axis.y) === true)
      return true;
  }
  return false;
}

/** Why a per-level setting cannot apply to a continuous axis's level (a
 *  numeric axis's ticks, a time axis's rows), if it cannot. */
const POINTS =
  "it is a continuous axis's level, whose labels name points (its ticks)";
const continuousCannot = {
  divider: (v: boolean) =>
    v
      ? `${POINTS}, with no regions between them to divide; only an ` +
        `ordinal axis's levels have dividers`
      : undefined,
  align: (v: LabelAlign | true) =>
    v === "start"
      ? `${POINTS}, so they are centered on them; only an ordinal axis's ` +
        `labels can start their runs`
      : undefined,
};

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
 * `below` is what the axes already elaborated BELOW this node say per dim
 * (see {@link LevelFold}): an axis this node draws on a dim starts at the
 * depth after them, and reads the per-level options from there. Every axis
 * has levels: a numeric axis one (its ticks), a time axis its rows, an
 * ordinal axis one per split or bin. The returned fold adds this node's
 * levels.
 */
function elaborationsFor(
  node: GoFishNode,
  options: ChromeOptions,
  below: LevelFold
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
  /** `below`, with this node's levels added. */
  fold: LevelFold;
} {
  const sides = options.sides ?? [undefined, undefined];
  const labelSettings = options.labelSettings ?? (() => undefined);
  const perLevel = options.perLevel ?? [{}, {}];
  const fold: LevelFold = {
    dims: [
      { ...below.dims[0], names: [...below.dims[0].names] },
      { ...below.dims[1], names: [...below.dims[1].names] },
    ],
    issues: [...below.issues],
  };
  const space = node._underlyingSpace;
  const owns = (dim: 0 | 1) => (dim === 0 ? node.axis.x : node.axis.y) === true;
  // A node that draws no axis elaborates nothing.
  if (!space || (!owns(0) && !owns(1)))
    return {
      constrained: [],
      refBased: [],
      anchors: [undefined, undefined],
      owned: [false, false],
      sides: [undefined, undefined],
      fold,
    };
  // The axis shows the keyed domain of the node's set (#1114): the domain of
  // its unit wherever that unit sits in the space, which a sized node maps
  // into its box, not only the part of it the node's own data covers.
  // Chrome is elaborated only inside `layout()`, which builds the table
  // first, so there is always one here.
  const keyed = node.getRenderSession().keyedDomains;
  if (keyed === undefined)
    throw new Error(
      "axis elaboration: the keyed domains are built by layout() before chrome"
    );
  // Per dim, computed once: the axis's space widened to its keyed domain
  // (`wide`), and that domain widened and niced, the axis's scope
  // (`KeyedDomains.scope`, the widen-then-nice every σ solve over the domain
  // applies, so the ticks and the marks agree by construction). `wide`
  // stays un-niced: a time axis picks its tick partition from it, the same
  // input the nicing picked its partition from.
  const placed = ([0, 1] as const).map((dim) =>
    node.placedSpace(space[dim], dim)
  );
  const wide = ([0, 1] as const).map(
    (dim) =>
      widenScope(
        placed[dim],
        undefined,
        keyed.domainOf(node, dim, placed[dim], true)
      )[0]
  );
  // Niced [min, max] per POSITION dim, computed ONCE: it feeds both that
  // dim's own axis line/ticks (when the node owns it) and the other axis's
  // `crossFloor` (the plot corner), so a nicing change can't skew the corner.
  // A DIFFERENCE dim's floor is 0. An owned dim reads its own nice and the
  // other dim's floor, so a node that owns any axis computes both dims,
  // owned or not: a facet panel that owns only its y axis still seats that
  // axis at the floor of the shared x domain an ancestor draws (#753), since
  // the keyed scope is the same widen-then-nice whichever node draws the
  // axis.
  // The `levels` entries an axis on `dim` reads, from its first level on.
  const entriesFor = (dim: 0 | 1) =>
    (perLevel[dim].levels ?? []).slice(fold.dims[dim].names.length);
  // One per-level option at a depth of `dim` (see `readAtDepth`).
  const optionAt = <N extends keyof LevelOptions>(
    dim: 0 | 1,
    option: N,
    depth: number,
    cannot?: Parameters<typeof readAtDepth<N>>[5]
  ) => readAtDepth(perLevel[dim], option, dim, depth, fold.issues, cannot);
  // The rows of each owned time axis, as its levels name them. Its ticks
  // are stamped with its inner row before anything nices its domain, and
  // recorded as the demand of its keyed domain (`KeyedDomains.recordDemand`):
  // every σ solve over the domain reads that demand, as the axis does.
  const times: (ReturnType<typeof timeRows> | undefined)[] = [
    undefined,
    undefined,
  ];
  const nices: ([number, number] | undefined)[] = [undefined, undefined];
  const floors: (number | undefined)[] = [undefined, undefined];
  // What each owned axis ticks at, as `resolveAxes` stamped it: the same
  // ticks its scope's solve nices the domain to. A numeric axis is drawn
  // from its tick count; a time axis stamps its rows here first.
  const ticksFor = (dim: 0 | 1): AxisTicks =>
    node.axisDemand[dim] ?? DEFAULT_AXIS_TICKS;
  for (const dim of [0, 1] as (0 | 1)[]) {
    const s = wide[dim];
    if (axisOver(s) === "absolute") {
      if (owns(dim) && isCONTINUOUS(s) && spaceCalendar(s)) {
        times[dim] = timeRows(s, entriesFor(dim), !hasOuterAxis(node, dim));
        node.axisDemand[dim] = {
          ...ticksFor(dim),
          rows: times[dim]!.map((r) => r.level),
        };
        keyed.recordDemand(node, dim);
      }
      const niced = keyed.scope(
        node,
        dim,
        placed[dim],
        undefined
      )[0] as CONTINUOUS_TYPE;
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
    sides[dim] ?? defaultAxisSide(dim, wide[dim], crossDirection(dim));
  // Returns the full hanging-point descriptor (see `LabelRotation`), not
  // just the angle — `resolveLabelRotation` also derives the track-axis
  // alignment mode and, for an oblique angle, which end of the label anchors
  // the rotation pivot.
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
  // The shared tail of the continuous axes (numeric, time, difference): one
  // gutter of constraints, a title anchor, and its levels (`names`), whose
  // per-level settings must be ones a continuous level takes. A continuous
  // axis's gutter lies past the ordinal rows inside it.
  const continuousAxis = (
    dim: 0 | 1,
    e: AxisElaboration,
    names: readonly string[]
  ) => {
    constrained.push(e);
    anchors[dim] = e.anchor;
    const d = fold.dims[dim];
    names.forEach((_, k) => {
      optionAt(dim, "divider", d.names.length + k, continuousCannot.divider);
      optionAt(dim, "label.align", d.names.length + k, continuousCannot.align);
    });
    d.names.push(...names);
    d.rowEnd = 0;
    d.column = undefined;
  };
  // A numeric axis's one level: only `true` applies among `levels` entries.
  const numericNames = (dim: 0 | 1) => {
    optionAt(dim, "levels", fold.dims[dim].names.length, (e) =>
      e === false
        ? `a numeric axis's tick labels cannot be hidden (to hide the ` +
          `whole axis, set the axis to false)`
        : e instanceof CalendarPartition
          ? `${String(e)} names cells of time, and this level is a ` +
            `numeric axis's ticks`
          : undefined
    );
    return ["the numeric ticks"];
  };
  for (const dim of [0, 1] as (0 | 1)[]) {
    if (!owns(dim)) continue;
    const s = wide[dim];
    const prefix = dim === 1 ? "__y" : "__x";
    const crossFloor = floors[cross(dim)];
    const kind = axisOver(s);
    const ticks = ticksFor(dim);
    const d = fold.dims[dim];
    const depth0 = d.names.length;
    if (kind === "absolute" && isCONTINUOUS(s) && spaceCalendar(s)) {
      const rows = times[dim]!;
      // A time axis does not rotate its labels yet (see `elaborateTimeAxis`).
      rows.forEach((_, k) =>
        optionAt(dim, "label.angle", depth0 + k, (a) =>
          a
            ? `a time axis's labels are not rotated yet, so an angle cannot ` +
              `apply to its rows`
            : undefined
        )
      );
      continuousAxis(
        dim,
        elaborateTimeAxis(
          dim,
          s,
          nices[dim]!,
          rows,
          prefix,
          crossFloor,
          axisSide(dim)
        ),
        rows.map((r) => String(r.level))
      );
    } else if (kind === "absolute" && isCONTINUOUS(s)) {
      continuousAxis(
        dim,
        elaborateContinuousAxis(
          dim,
          nices[dim]!,
          ticks,
          prefix,
          crossFloor,
          axisSide(dim),
          crossDirection(dim),
          resolvedLabelRotation({ dim, kind: "continuous", depth: depth0 }),
          s.mirrored === true,
          depth0
        ),
        numericNames(dim)
      );
    } else if (kind === "delta" && isCONTINUOUS(s)) {
      continuousAxis(
        dim,
        elaborateDifferenceAxis(
          dim,
          s,
          ticks,
          prefix,
          crossFloor,
          axisSide(dim)
        ),
        numericNames(dim)
      );
    } else if (isORDINAL(s)) {
      keyMap ??= collectKeyMap(node);
      // A hidden level draws nothing and takes no space, but the node still
      // claims the axis (and its depth), so no ancestor draws it instead.
      const levelAt = (depth: number): LevelSetting => {
        const row: LabelRow = { dim, kind: "ordinal", depth };
        const align = optionAt(dim, "label.align", depth);
        const explicit = {
          align: align === true ? undefined : align,
          divider: optionAt(dim, "divider", depth),
        };
        return labelSettings(row) === "hidden"
          ? { hidden: true, ...explicit }
          : {
              hidden: false,
              rotation: resolvedLabelRotation(row),
              ...explicit,
            };
      };
      const axis = elaborateOrdinalAxis(
        dim,
        s,
        keyMap,
        prefix,
        axisSide(dim),
        levelAt,
        entriesFor(dim),
        !hasOuterAxis(node, dim),
        d
      );
      refBased.push(axis.elaboration);
      d.rowEnd = axis.rowEnd;
      d.column = axis.column;
      d.names.push(...axis.names);
      d.ordinal = true;
      fold.issues.push(...axis.issues);
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
    fold,
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
  /** Per-dim per-level options, by depth, nearest the plot first: `levels`,
   *  `label.angle`, `label.align` and `divider` (see `AxisOptions.levels`);
   *  undefined = every level as inferred. */
  perLevel?: [LevelOptions, LevelOptions];
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
 * It also bubbles up what the axes say about their levels (a
 * {@link LevelFold}) purely as an output (nothing is passed DOWN for it):
 * each dim is folded bottom-up over the node's own children (the most
 * levels any child drew; an ordinal level if any child drew one), then
 * `elaborationsFor` adds this node's own levels. That gives each level its
 * depth among the levels of its dim, 0 nearest the plot (a grouped bar
 * chart's year labels, then its city labels), which picks its entry of
 * each per-level option: `levels`, `label.angle`, `label.align` and
 * `divider`. Sibling subtrees don't interfere: each call only sees what ITS
 * OWN children folded. `layout` reads the root's fold to check every
 * per-level entry applied.
 */
export async function elaborateChrome(
  node: GoFishNode,
  options: ChromeOptions = {}
): Promise<{
  node: GoFishNode;
  changed: boolean;
  fold: LevelFold;
}> {
  let changed = false;
  const below = emptyFold();
  // Bottom-up: replace each child with its elaborated form.
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child instanceof GoFishNode) {
      const res = await elaborateChrome(child, options);
      if (res.changed) changed = true;
      for (const dim of [0, 1] as (0 | 1)[]) {
        const b = below.dims[dim];
        const r = res.fold.dims[dim];
        if (r.names.length > b.names.length) b.names = r.names;
        // The inner axes' outer column: one column when every child that
        // drew an ordinal level agrees on it.
        if (r.ordinal)
          b.column = !b.ordinal || b.column === r.column ? r.column : undefined;
        b.ordinal ||= r.ordinal;
        b.rowEnd = Math.max(b.rowEnd, r.rowEnd);
      }
      below.issues.push(...res.fold.issues);
      if (res.node !== child) {
        node.children[i] = res.node;
        res.node.parent = node;
      }
    }
  }

  const { constrained, refBased, anchors, owned, sides, fold } =
    elaborationsFor(node, options, below);
  // A title names an axis this node draws. It is read off the node's own
  // space (`spaceTitle`), which elaboration has not re-resolved yet.
  const request = node._chromeRequest;
  node._chromeRequest = undefined;
  const titles = ([0, 1] as const).map((dim) =>
    owned[dim] && request !== undefined
      ? chartAxisTitle(
          request.axes,
          dim,
          spaceTitle(node._underlyingSpace?.[dim])
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
    return { node, changed, fold };
  }

  let withAxes: GoFishNode = node;
  const rings: GoFishNode[] = [];
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
      rings.push(ring);
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
      rings.push(ring);
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
      rings.push(ring);
    }

    // The legend, beside everything inside it, titles included.
    if (legend !== undefined) {
      ring = await wrapRing(ring, LEGEND_CONTENT_NAME, legend);
      rings.push(ring);
    }
    return ring;
  });
  root.chrome = { content: node, withAxes, rings };

  return { node: root, changed: true, fold };
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
 *  `false`); its title is then {@link axisTitle}'s, with the axis's space's
 *  title (`spaceTitle`) as the inferred name. */
function chartAxisTitle(
  axes: AxesOptions | undefined,
  dim: 0 | 1,
  inferred: string | undefined
): string | undefined {
  if (axes === true) return inferred;
  const opt =
    axes && typeof axes === "object" ? axes[dim === 0 ? "x" : "y"] : undefined;
  return opt === undefined || opt === false
    ? undefined
    : axisTitle(opt, inferred);
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
