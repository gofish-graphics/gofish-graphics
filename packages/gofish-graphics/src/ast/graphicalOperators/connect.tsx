import {
  Path,
  type Step,
  evenStep,
  reversePath,
  samePoint,
  segmentEnds,
  mapPathPoints,
  pathBounds,
  transformPath,
} from "../../path";
import { GoFishAST } from "../_ast";
import type { BlendMode } from "../blendMode";
import { projectBy, type SplitBy } from "../datumProjection";
import { GoFishNode, defaultGeometry, outlineOverhang } from "../_node";
import { outlinePaint, pathOutline } from "../geometry";
import { resolveColorChannel } from "../../color";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  pathToPixelSVG,
  roleFor,
} from "../displayList/lowerHelpers";
import { Dimensions, elaborateDirection, FancyDirection, Size } from "../dims";
import { clamp, pairs } from "../../util";
import {
  type BoundingBox,
  bbox,
  empty,
  isEmptyInfinity,
  union,
} from "../../util/bbox";
import { linear } from "../coordinateTransforms/linear";
import { isValue, MaybeValue } from "../data";
import { Domain, axisScale } from "../domain";
import {
  UNDEFINED,
  UnderlyingSpace,
  isPositioningSpace,
  originIs,
} from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";
import { overlappingMarks, warnLayout } from "../layoutWarnings";
import {
  resolveCurve,
  centerPoint,
  sequenceCurve,
  sequenceCurveNames,
  curveName,
  type RunParameter,
} from "./routers";
import { monotone, type Curve } from "../../families/curve";
import { targetOf } from "../constraints/relationalPaint";
import { readLive } from "../../interaction/live";
import { setLiveSlots } from "../../interaction/liveSlots";
import {
  historyOf,
  keyframeOf,
  lifetimeOf,
  lifetimeRule,
  unrollOrder,
  windowPath,
  type Keyframe,
  type SequenceWindow,
} from "../../timeWindow";

// Per-axis bbox anchor. A literal number is the raw fraction in [0, 1]; the
// keywords map to {start: 0, middle: 0.5, end: 1}, in the connector's axis
// order (see `axisDirection.ts`): on a y that grows upward `start` is the
// bottom, on one that reads top-down it is the top.
// TODO: the decided anchor vocabulary is `start`/`center`/`end`; `middle`
// here is the public `line({ source, target })` spelling, not renamed yet.
export type AnchorAlignment = "start" | "middle" | "end";
export type AnchorAxis = number | AnchorAlignment;
// One of:
//   - a single keyword applied to both axes  (`"middle"` ≡ `[0.5, 0.5]`)
//   - a per-axis tuple                       (`["start", "middle"]`)
//   - an axis-keyed object                   (`{ x: "start", y: 0.5 }`)
// In the object form, omitted axes default to `"middle"` (0.5).
export type AnchorSpec =
  | AnchorAlignment
  | [AnchorAxis, AnchorAxis]
  | { x?: AnchorAxis; y?: AnchorAxis };

const resolveAnchorAxis = (a: AnchorAxis): number =>
  typeof a === "number" ? a : a === "start" ? 0 : a === "middle" ? 0.5 : 1;

const resolveAnchor = (a: AnchorSpec): [number, number] => {
  if (typeof a === "string") {
    const v = resolveAnchorAxis(a);
    return [v, v];
  }
  if (Array.isArray(a)) {
    return [resolveAnchorAxis(a[0]), resolveAnchorAxis(a[1])];
  }
  return [
    a.x !== undefined ? resolveAnchorAxis(a.x) : 0.5,
    a.y !== undefined ? resolveAnchorAxis(a.y) : 0.5,
  ];
};

/**
 * The keyframes a connector's operands are part of, when every operand is
 * part of a keyframe of ONE `time.sequence` (the record the sequence leaves on
 * its keyframe groups, see `src/timeWindow.ts`). Undefined otherwise, and the
 * connector is drawn whole, as any connector is.
 */
function sequenceKeyframes(
  children: readonly GoFishAST[]
): Keyframe[] | undefined {
  // The first operand decides whether there is anything to find, so a chart
  // with no sequence walks up from one operand, not from every one.
  const first =
    children.length === 0 ? undefined : keyframeOf(targetOf(children[0]));
  if (first === undefined) return undefined;
  const found: Keyframe[] = [first];
  for (let i = 1; i < children.length; i++) {
    const keyframe = keyframeOf(targetOf(children[i]));
    if (keyframe?.sequence !== first.sequence) return undefined;
    found.push(keyframe);
  }
  return found;
}

/** Whether `node` sits under a `time.history`. */
function underHistory(node: GoFishNode): boolean {
  for (let n = node.parent; n !== undefined; n = n.parent) {
    if (historyOf(n) !== undefined) return true;
  }
  return false;
}

/** A line threaded through a sequence's keyframes: each knot's time, in time
 *  order, the step of the path from each knot to the next, drawn forward in
 *  time, the sequence whose window it is drawn over, and the lifetime of the
 *  marks it connects, which picks the window. */
type TimeRun = {
  knots: number[];
  pieces: Step[];
  sequence: SequenceWindow;
  last: number;
};

/** Where `values` first stops moving the way its first step goes: the index
 *  of the first value that does not go on up (or down) from the one before
 *  it, or -1 when every value does. The one check that a run moves one way. */
function firstStepBack(values: readonly number[]): number {
  const sign = Math.sign(values[1] - values[0]);
  for (let i = 1; i < values.length; i++) {
    if (!(sign * values[i] > sign * values[i - 1])) return i;
  }
  return -1;
}

/**
 * A candidate parameter of a run, as the knots of its curve: one value per
 * operand in path order, which is a parameter of the run when every value is a
 * finite number and the values move strictly one way along it. A run that
 * moves backward in its parameter is the same curve with the parameter negated
 * (the monotone cubic is affine-invariant; see `monotoneSlopes`). Undefined
 * when the values are not a parameter of the run, including when two of them
 * are equal.
 */
function runKnots(
  values: readonly unknown[] | undefined
): number[] | undefined {
  if (values === undefined || values.length < 2) return undefined;
  const numbers: number[] = [];
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    numbers.push(v);
  }
  if (firstStepBack(numbers) >= 0) return undefined;
  const sign = Math.sign(numbers[1] - numbers[0]);
  return numbers.map((v) => sign * v);
}

/** A connector's box as its intrinsic dims; an empty box (nothing to
 *  connect) is zero-sized at the origin. */
const boxDims = (box: BoundingBox): Size<{ min: number; size: number }> =>
  isEmptyInfinity(box)
    ? [
        { min: 0, size: 0 },
        { min: 0, size: 0 },
      ]
    : [
        { min: box.minX, size: box.maxX - box.minX },
        { min: box.minY, size: box.maxY - box.minY },
      ];

/**
 * One edge of a connector: a path from each operand to the next. Each end
 * says where the edge meets its operand: a point on the operand's box
 * ({@link AnchorSpec}, in x and y), or omitted. An omitted end attaches as
 * near the other end as the box allows: to a point, at the point of the box
 * nearest it, clamped per axis (Bluefish's `Line`), which gives an
 * axis-aligned edge when the point lies within the box on one axis; to an
 * omitted end, at the whole box, which the curve's route reads (a straight
 * route runs from its center, perfect-arrows from its side).
 */
export type ConnectEdge = { source?: AnchorSpec; target?: AnchorSpec };

type Point = [number, number];

/** An edge's ends as fractions of its operands' boxes (`resolveAnchor`). */
type EdgeAnchors = { source?: Point; target?: Point };

/** Where one end of an edge meets an operand in one pair: a box the route
 *  reads, at its center. A point attachment is a box of zero size at the
 *  point, so a route reads the point. */
type Attachment = Dimensions;

/** The coordinate at fraction `f` of a box axis: `min + f · size`, and at
 *  `f = 1` the axis's own `max`. Reading `max` there is a declared shortcut
 *  for a broken invariant upstream: `reflectInterval` (`axisDirection.ts`)
 *  flips `min` and `max` and keeps `size`, so on a box seen through a
 *  reflected y, `min + size` differs from its `max` in the last bit.
 *  TODO: restore the invariant `min + size === max` in `reflectInterval`,
 *  and read `min + f · size` at every `f`. */
const fractionOf = (d: Dimensions[number], f: number): number =>
  f === 1 ? d.max! : d.min! + f * d.size!;

/** The point at fractions `f` of a box. */
const pointOn = (b: Dimensions, f: Point): Point => [
  fractionOf(b[0], f[0]),
  fractionOf(b[1], f[1]),
];

/** The point of `onto` nearest `p`, per axis. */
const clampOnto = (p: Point, onto: Dimensions): Point => [
  clamp(p[0], onto[0].min!, onto[0].max!),
  clamp(p[1], onto[1].min!, onto[1].max!),
];

/** Where an edge meets the two operands of a pair, `b0` then `b1`: the
 *  point each end is at, or undefined for an end that meets the whole box
 *  (`ConnectEdge`). */
const endsOf = (
  b0: Dimensions,
  b1: Dimensions,
  { source, target }: EdgeAnchors
): [Point | undefined, Point | undefined] => {
  const p0 = source && pointOn(b0, source);
  const p1 = target && pointOn(b1, target);
  return [p0 ?? (p1 && clampOnto(p1, b0)), p1 ?? (p0 && clampOnto(p0, b1))];
};

/** A point as an attachment: a box of zero size at it. */
const atPoint = (p: Point): Attachment => [
  { min: p[0], center: p[0], max: p[0], size: 0 },
  { min: p[1], center: p[1], max: p[1], size: 0 },
];

/** Whether a path that ends at `p` and one that starts at `q` meet: the
 *  same point to within rounding. */
const EPS = 1e-6;
const meetAt = (p: Point, q: Point): boolean =>
  Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;

/** What a connector draws from its edges' paths, given each edge's own
 *  start and end: open, the paths themselves; closed, the one region
 *  between its two edges, the first forward, across at the last operand,
 *  the second back, and across at the first. */
const drawEdges = (
  paths: Path[],
  ends: [Point, Point][],
  closed: boolean
): Path[] =>
  closed
    ? [
        [
          ...paths[0],
          { type: "line", points: [ends[0][1], ends[1][1]] },
          ...reversePath(paths[1]),
          { type: "line", points: [ends[1][0], ends[0][0]] },
        ],
      ]
    : paths;

export const connect = createNodeOperator(
  (
    {
      edges,
      closed = false,
      direction,
      fill,
      curve,
      discreteCurve,
      stroke,
      strokeWidth,
      strokeDasharray,
      opacity,
      blendMode,
      along,
      parameterAxis,
    }: {
      // The paths it draws from each operand to the next: one for a line,
      // the two sides of a band for a ribbon (`ConnectEdge`).
      edges: ConnectEdge[];
      // Whether its two edges are joined into one filled region, closed
      // across the first and last operand. Open, each edge is its own path,
      // never filled.
      closed?: boolean;
      // The connection axis: the axis the operands follow one another along.
      // A route that bends reads it (`bezier`, `orthogonal`), and so does an
      // omitted curve, and which operands are cross-sections (see below).
      direction?: FancyDirection;
      fill?: MaybeValue<string>;
      // The single screen-space path-shaping key: a call in the Curve family
      // (`Curve.linear()`, `Curve.bezier()`, `Curve.orthogonal()`,
      // `Curve.arc({ direction })`, `Curve.perfectArrows({ bow })`, …). A
      // sequence curve threads each edge through the whole run; a route
      // shapes each edge between the two ends it is given. Omitted, it is a
      // monotone cubic over a continuous connection axis, else
      // `discreteCurve`.
      curve?: Curve;
      // The curve an omitted `curve` draws between discrete operands. Each
      // connector mark gives its own (straight for a line, a bezier for a
      // ribbon).
      discreteCurve: Curve;
      stroke?: MaybeValue<string>;
      strokeWidth?: number;
      strokeDasharray?: string;
      opacity?: number;
      blendMode?: BlendMode;
      // The connection variable: the key of the flow tier the connector
      // threads (`along: "year"` names years). A smooth run reads each
      // operand's value of it as its knots (see `runKnots`), and only then.
      along?: SplitBy;
      // The axis that draws the connection variable itself, when one does:
      // the flow tier the connector threads places its groups on that axis
      // by the same field it groups them by (a line chart over years). Worked
      // out with the flow (`applyDefaultRelational`); a `step` curve reads it.
      parameterAxis?: "x" | "y";
    },
    children: GoFishAST[]
  ) => {
    const drawnAxis: 0 | 1 | undefined =
      parameterAxis === undefined ? undefined : parameterAxis === "x" ? 0 : 1;
    const dir = elaborateDirection(direction ?? 0);
    const mainAxis = dir as 0 | 1;
    const crossAxis = (1 - mainAxis) as 0 | 1;
    // A curve that is not a Curve-family object fails here, where the
    // connector is made.
    curveName(curve, "line/ribbon({ curve })");
    if (closed && edges.length !== 2)
      throw new Error(
        `[gofish] connect: a closed connector is the region between two ` +
          `edges, but it was given ${edges.length}.`
      );
    const anchors = edges.map(
      (e): EdgeAnchors => ({
        source: e.source === undefined ? undefined : resolveAnchor(e.source),
        target: e.target === undefined ? undefined : resolveAnchor(e.target),
      })
    );
    // An operand the edges meet at two places across the connection axis is
    // a cross-section of what they draw (each operand of a ribbon spans the
    // band from its near side to its far side). It is embedded on the
    // connection axis, and its box is part of the connector's.
    const spans = (ends: (Point | undefined)[]): boolean =>
      new Set(ends.flatMap((f) => (f === undefined ? [] : [f[crossAxis]])))
        .size > 1;
    const crossSections =
      spans(anchors.map((a) => a.source)) ||
      spans(anchors.map((a) => a.target));
    // How it paints its paths, from its fill color (its first child's when
    // it sets none) and its stroke color: filled when closed, never when
    // open, and stroked with its stroke, or its fill when it sets none.
    // `lower` reads it with the colors resolved, `geometry` as given.
    const paintOf = <C,>(color: C | undefined, strokeColor: C | undefined) => ({
      fill: closed ? (color ?? "none") : "none",
      stroke: strokeColor ?? color ?? "black",
      strokeWidth: strokeWidth ?? 0,
    });

    const node = new GoFishNode(
      {
        type: "connect",
        // Labeled by its outline: a line at its end, a band inside itself.
        labelPlacement: "outline",
        // The domain-building walk (`GoFishNode.resolveColorScale`) only
        // reads a node's single `color` property to register a field-valued
        // paint into the shared discrete-color scale. Prefer whichever
        // channel is data-driven — same idiom as rect/petal's `color`. By the
        // time Connect sees them, field-valued paints have already been
        // resolved to `Value`s by `resolveGroupFill` (chart.ts), so
        // `isValue` distinguishes data-driven from a literal color.
        color: isValue(fill) ? fill : stroke,
        // Its outline is drawn in the stroke, or else in its fill color
        // (`lower`).
        strokeOverhang: outlineOverhang(stroke ?? fill ?? "black", strokeWidth),
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: readonly GoFishAST[]
        ) => {
          return [UNDEFINED, UNDEFINED];
        },
        layout: (size, scales, children, node) => {
          const defaultColor = children[0]?.color ?? "black";

          // A connector over a `time.sequence`'s keyframes is read in time as
          // well as in space, by the lifetime of the marks it connects (see
          // `src/timeWindow.ts`). Operands all inside ONE keyframe: the
          // connector is part of that keyframe's picture, so it shows while
          // its operands do, and is not cut. Operands in DIFFERENT keyframes:
          // it threads the time tier, so it draws only the stretch of its run
          // inside its operands' window, cut by data time at paint (see
          // `lower`). With no `time.history` over the operands that window is
          // the playhead alone, and the line draws nothing. Which case it is
          // comes from the keyframes themselves, not from the field names in
          // the spec.
          const keyframes = sequenceKeyframes(children);
          const threadsTime =
            keyframes !== undefined &&
            keyframes.some((k) => k.t !== keyframes[0].t);
          // The lifetime the connector is read by is the union of its
          // operands' (`lifetimeOf`), as a mark's is the union of its parts'.
          const last =
            keyframes === undefined
              ? undefined
              : Math.max(...children.map((c) => lifetimeOf(c as any)));
          if (keyframes !== undefined && !threadsTime) {
            node.INTERNAL_visibleWhile(
              keyframes[0].sequence,
              lifetimeRule(keyframes[0], last!)
            );
          }
          if (threadsTime && underHistory(node)) {
            throw new Error(
              `[gofish] time.history([line(...)]): a line threaded through ` +
                `the keyframes of a time.sequence is drawn over the window of ` +
                `the marks it connects, so a time.history around the line ` +
                `itself has nothing to set. Put the time.history around the ` +
                `keyframe marks (or in the flow) instead.`
            );
          }
          // TODO: the time cut is built for one open edge through the
          // operands' centers. A band (two edges, closed) and an edge pinned
          // to points on its operands are not cut yet. The right fix cuts
          // each edge at the same data time, from where it leaves one
          // keyframe's operand to where it enters the next one's (the
          // attachments, not the centers), and for a band closes the two cut
          // edges across the cut, as `ring` closes them across the ends.
          const pinned = anchors.some(
            (a) => a.source !== undefined || a.target !== undefined
          );
          // (A closed connector has two edges, so `edges.length` covers it.)
          if (threadsTime && (edges.length !== 1 || pinned)) {
            throw new Error(
              `[gofish] line/ribbon(): this connector threads the keyframes ` +
                `of a time.sequence, so it is drawn only over the stretch of ` +
                `time the sequence shows, cut at the exact point in data ` +
                `time. That cut is built for a line through the keyframes' ` +
                `centers; ` +
                (closed
                  ? "a ribbon's band"
                  : pinned
                    ? "a line pinned to `source`/`target` anchors"
                    : "a connector of several edges") +
                ` is not built yet.`
            );
          }

          if (crossSections) {
            for (const child of children) {
              // toggle embedding on the direction axis
              (child as GoFishAST).embed(direction ?? 0);
            }
          }

          // A line threading a sequence's keyframes is cut by data time, so
          // it has to move through the keyframes one way in time. Forward or
          // backward are both fine: backward is the same path, and it is
          // built forward, from the keyframe earliest in time. It is built on
          // its run laid out along the time axis (`unrollOrder`): the run
          // itself, or on a cyclic axis the run repeated a cycle before and
          // after, which joins the last keyframe to the first across the
          // seam. The same mark stands at each of its copies: `points[j]` is
          // the operand the path's `j`-th point is.
          let points = children.map((_, i) => i);
          let timeKnots: number[] | undefined;
          if (threadsTime) {
            const times = keyframes!.map((k) => k.t);
            const back = firstStepBack(times);
            if (back >= 0) {
              throw new Error(
                `[gofish] line(): this line threads the keyframes of a ` +
                  `time.sequence, so each of its points is a moment in time, ` +
                  `and it goes from ${times[back - 1]} to ${times[back]}: ` +
                  `back and forth in time, or twice through one keyframe. A ` +
                  `line drawn in over time has to move through the keyframes ` +
                  `one way. If each keyframe holds several marks, split the ` +
                  `line so each run has one mark per keyframe (for example, ` +
                  `add \`by\` to the operator that places the marks).`
              );
            }
            const run = unrollOrder(times, keyframes![0].sequence.cycle());
            points = run.operand;
            timeKnots = run.knots;
          }

          // Forward σ (size slope) but not the anchored map: connect places
          // endpoints by their own bboxes, not by data position. Each operand
          // is laid out once, however many points of the run it stands at.
          const placed = children.map((child) =>
            child.layout(size, [
              axisScale(scales?.[0]?.sigma, undefined),
              axisScale(scales?.[1]?.sigma, undefined),
            ])
          );
          const childPlaceables = points.map((i) => placed[i]);
          const bboxPairs = pairs(childPlaceables.map((child) => child.dims));

          // Whether the connected points share a homogeneous *continuous*
          // space on the connection axis, i.e. they are samples of one
          // continuous variable. Both the `"auto"` curve and a smooth run's
          // knots ask it.
          //
          // The connection-axis *positioning* space lives on whatever placed
          // the connected marks: the mark itself (a data-bound
          // `ellipse({ x: value(…) })` reports POSITION) or an ancestor (a
          // `circle`/`blank` placed by `scatter` — the scatter reports
          // POSITION). So walk up from each mark to the nearest ancestor whose
          // connection-axis space is a *positioning* kind (POSITION = data
          // axis, ORDINAL = category axis), skipping the mark's own SIZE
          // (its extent, e.g. a circle's radius) and UNDEFINED.
          //
          // The children carry the space because `resolveReferences` runs before the
          // underlying-space pass, so a `ref` already proxies its target's space
          // (falling back to ORDINAL ⇒ discrete when unresolved).
          const connectionSpaceOf = (
            c: GoFishAST
          ): UnderlyingSpace | undefined => {
            let n: any = targetOf(c);
            while (n) {
              const s = n.resolveUnderlyingSpace?.()?.[dir];
              // Stop at the nearest *positioning* space — an ORDINAL ancestor
              // must win over a continuous grandparent (a grouped layout is
              // discrete even inside a continuous frame), so we can't skip it.
              if (s !== undefined && isPositioningSpace(s)) return s;
              n = n.parent;
            }
            return undefined;
          };
          let continuous: boolean | undefined;
          const continuousConnectionAxis = (): boolean =>
            (continuous ??=
              children.length >= 2 &&
              children.every((c) => {
                const s = connectionSpaceOf(c);
                return originIs(s, "pinned");
              }));

          // Resolve the curve. An omitted curve smooths with the monotone
          // cubic over a continuous connection axis, for lines and ribbons
          // alike: a stacked area should curve like its line-chart sibling.
          // Otherwise it is `discreteCurve`, the connector's always-drawable
          // curve between discrete operands. Explicit curves always win.
          const resolvedCurve: Curve =
            curve !== undefined
              ? curve
              : continuousConnectionAxis()
                ? monotone()
                : discreteCurve;
          const resolvedCurveName = resolvedCurve.kind;

          const centers = childPlaceables.map((c) => centerPoint(c.dims));

          // The box holds where the edges meet the operands, added by each
          // branch below for each pair of the run (a run of one point joins
          // none), and every operand that is a cross-section whole.
          let box = empty();
          const addPoint = (p: Point) => {
            box = union(box, bbox(p[0], p[0], p[1], p[1]));
          };
          // The geometry needs only the attachment points and the path; a
          // cross-section's whole box is included to keep the connector's
          // box what it was (layout compatibility).
          // TODO: make the box the attachment points and the path only, and
          // drop the cross-sections' boxes (a layout change to measure).
          if (crossSections && bboxPairs.length > 0) {
            for (const { dims: b } of new Set(childPlaceables)) {
              box = union(
                box,
                bbox(b[0].min!, b[0].max!, b[1].min!, b[1].max!)
              );
            }
          }

          /** What it draws: one path per edge for each run of pairs that
           *  meet, the two joined into one when closed. */
          const drawn: Path[] = [];
          /** Each edge's path, one step from each point to the next: one
           *  segment, or for a sequence curve the segments that draw one
           *  step, with their shares of its time (`SequenceCurve.thread`).
           *  After the branch below, read only by the time cut. */
          let steps: Step[][];

          // A *sequence* curve (`monotone`, `smooth`, `step`, `catmullRom`)
          // threads each edge through the whole run as one spline, bypassing
          // the pairwise routes. Its knots are where the edge enters each
          // operand (`target`) and then where it leaves it (`source`), in
          // that order: the first operand has only its leave point and the
          // last only its enter point, since the edge starts and ends there.
          // An omitted end attaches as near the other end as the box allows,
          // which on the same operand is the other end's own point; with
          // neither given, both are the operand's center. Where an operand's
          // enter and leave points are one point, it is one knot. So a line
          // through its marks' centers threads the centers, a line given
          // only `source` threads each mark's `source` point, a band over
          // points (an area) threads each point once, and a band between
          // bars runs flat across each bar's top, from the first bar's far
          // side to the last bar's near side, as the pairwise band does.
          const sequence = sequenceCurve(resolvedCurveName);
          if (sequence !== undefined) {
            const lastIndex = childPlaceables.length - 1;
            /** An edge's knots, and whether some operand gives it two. */
            const knotsOf = (a: EdgeAnchors) => {
              let sided = false;
              const knots = childPlaceables.flatMap(({ dims: b }, j) => {
                const at = (f: Point | undefined): Point =>
                  f === undefined ? centers[j] : pointOn(b, f);
                const enter = at(a.target ?? a.source);
                const leave = at(a.source ?? a.target);
                // One point (to within rounding), or a run of one operand,
                // which joins nothing: one knot, between the two.
                if (lastIndex === 0 || samePoint(enter, leave)) {
                  return [
                    [(enter[0] + leave[0]) / 2, (enter[1] + leave[1]) / 2],
                  ] as Point[];
                }
                sided = true;
                return j === 0
                  ? [leave]
                  : j === lastIndex
                    ? [enter]
                    : [enter, leave];
              });
              // With one knot per operand, each knot stands for its operand
              // (the time cut and the connection variable read them so), and
              // two operands at one place are two knots. With two, the knots
              // are where the edge touches the operands, and where one
              // operand's leave point is the next one's enter point (bars
              // that touch) it touches once: one knot.
              return {
                knots: sided
                  ? knots.filter(
                      (p, i) => i === 0 || !samePoint(p, knots[i - 1])
                    )
                  : knots,
                sided,
              };
            };
            const edgeKnots = anchors.map(knotsOf);
            const knots = edgeKnots.map((e) => e.knots);
            // The path passes through its knots, and `pathBounds` below
            // holds the rest of it.
            if (bboxPairs.length > 0) {
              for (const k of knots) k.forEach(addPoint);
            }
            // Where an edge enters and leaves its operands at different
            // points, they go on along the connection axis when the operands
            // stand apart on it. Operands that overlap there put one's leave
            // point past the next one's enter point, and the curve turns
            // back: it is drawn through them in order anyway, and says so.
            if (
              edgeKnots.some(
                (e) =>
                  e.sided && firstStepBack(e.knots.map((p) => p[mainAxis])) >= 0
              )
            ) {
              warnLayout(
                node,
                overlappingMarks(mainAxis, closed, resolvedCurveName)
              );
            }
            // A curve read over the run's parameter (a data-space curve)
            // takes the run's own parameter when it has one (#635), so the
            // curve follows the data rather than the distances between its
            // points on screen. A line through a sequence's keyframes uses
            // their times, which are what it is cut by and what a transition
            // reads it at, so the cut, the moving mark and the curve agree
            // (such a line has no anchors, so one knot per keyframe).
            // Otherwise, with one knot per operand, the connection
            // variable's values (the flow tier the run threads, e.g.
            // `along: "year"`), read only here; else the knots' positions on
            // the connection axis when that axis is continuous (a line chart
            // over x). An edge with two knots on some operand has no value of
            // the connection variable for each of them, so it reads
            // positions, when the axis is continuous: when the connection
            // variable is what places the operands on it, the positions are
            // an affine image of its values, and the operands' sides lie on
            // the same scale. A run with none of these has no parameter of
            // its own, so the curve threads it with centripetal knots, and it
            // then depends on where the points sit on screen. So does a run
            // whose positions do not move one way (overlapping operands,
            // above).
            //
            // The spline is evaluated here, in layout space, before any
            // coordinate transform. That equals evaluating it in data space
            // and placing the result because every position scale is affine
            // and every data-space curve commutes with an affine map of each
            // channel (see `monotoneSlopes`). A non-affine position scale (log, pow)
            // would need the spline evaluated upstream of the scale instead.
            //
            // A screen-space curve (`catmullRom`) takes no parameter. A
            // transition along the same run reads a data-space curve, so its
            // moving mark can sit slightly off a Catmull-Rom line (a known
            // gap, left open on purpose).
            //
            // The parameter is drawn on an axis in two cases: the knots are
            // the positions on the connection axis themselves, or the flow
            // tier the run threads places its groups on an axis by the same
            // field it groups them by (`parameterAxis`, worked out where the
            // flow is known), such as a line chart over years. That axis draws
            // the connection variable whether or not the run has knots of its
            // own (bars spread by year, whose sides have no year of their
            // own). `step` reads it; the smooth curves do not need it.
            const dataKnots = ({
              knots: k,
              sided,
            }: {
              knots: Point[];
              sided: boolean;
            }): RunParameter => {
              const time = runKnots(timeKnots);
              if (time !== undefined) {
                return { knots: time, parameterAxis: drawnAxis };
              }
              const byAlong =
                along === undefined || sided
                  ? undefined
                  : runKnots(children.map((c) => projectBy(c, along)));
              if (byAlong !== undefined) {
                return { knots: byAlong, parameterAxis: drawnAxis };
              }
              const byPosition = continuousConnectionAxis()
                ? runKnots(k.map((p) => p[mainAxis]))
                : undefined;
              if (byPosition !== undefined) {
                return { knots: byPosition, parameterAxis: mainAxis };
              }
              // No knots of its own; the axis that draws the connection
              // variable, when one does, still draws it.
              return { parameterAxis: drawnAxis };
            };
            steps = edgeKnots.map((e) =>
              sequence.thread(e.knots, sequence.takesKnots ? dataKnots(e) : {})
            );
            drawn.push(
              ...drawEdges(
                steps.map((s) => s.flatMap((step) => step.segments)),
                knots.map((k): [Point, Point] => [k[0], k[k.length - 1]]),
                closed
              )
            );
          } else {
            // Where each edge meets the two operands of each pair.
            const attachments: [Attachment, Attachment][][] = bboxPairs.map(
              ([b0, b1]) =>
                anchors.map((a): [Attachment, Attachment] => {
                  const [s, t] = endsOf(b0, b1, a);
                  return [
                    s === undefined ? b0 : atPoint(s),
                    t === undefined ? b1 : atPoint(t),
                  ];
                })
            );
            for (const pair of attachments) {
              for (const ends of pair) {
                for (const end of ends) addPoint(centerPoint(end));
              }
            }

            // A route shapes each edge of each pair between the two ends it
            // is given.
            const { router, options: routeOpts } = resolveCurve(resolvedCurve);
            const routed: Path[][] = anchors.map((_, e) =>
              attachments.map((pair) =>
                router(pair[e][0], pair[e][1], {
                  dir: mainAxis,
                  opts: routeOpts,
                })
              )
            );
            // The time cut above leaves one open edge here.
            steps =
              timeKnots === undefined
                ? []
                : routed.map((paths) => paths.map(evenStep));

            // Consecutive pairs whose edges meet at the operand between them
            // are drawn as one path (#520). Each pair was routed on its own,
            // but where adjacent pairs share an exact endpoint, rendering
            // them as separate <path>s lets antialiasing open hairline ~0.5px
            // seams off the pixel grid. One path per run is gap-proof by
            // construction. The edges meet at operand i+1 when each of pair
            // i's paths ends where pair i+1's starts: a line through centers,
            // or a band over an area's zero-width points. Bar-like operands
            // with real width, and a route that stops short of the box (a
            // padded perfect-arrows arc), genuinely don't share an edge and
            // stay separate.
            const meets = (i: number): boolean =>
              routed.every((paths) =>
                meetAt(
                  segmentEnds(paths[i][paths[i].length - 1])[1],
                  segmentEnds(paths[i + 1][0])[0]
                )
              );
            let from = 0;
            for (let i = 0; i < attachments.length; i++) {
              if (i < attachments.length - 1 && meets(i)) continue;
              drawn.push(
                ...drawEdges(
                  routed.map((p) => p.slice(from, i + 1).flat()),
                  anchors.map((_, e): [Point, Point] => [
                    centerPoint(attachments[from][e][0]),
                    centerPoint(attachments[i][e][1]),
                  ]),
                  closed
                )
              );
              from = i + 1;
            }
          }

          // A threaded line is cut inside one step of its path by data time
          // (`windowPath`), which needs each step to run from the one
          // keyframe's center to the next's, and to say how its time is
          // shared among its segments. A sequence curve's step says so
          // (`SequenceCurve.thread`). A pairwise route says nothing about
          // time, so its step can be cut only when it is ONE straight or
          // cubic segment, whose own parameter is then the time. (The check
          // above leaves one open edge.)
          let timeRun: TimeRun | undefined;
          if (timeKnots !== undefined) {
            const threads = steps[0].every(({ segments }, i) => {
              if (sequence === undefined && segments.length !== 1) {
                return false;
              }
              const [start] = segmentEnds(segments[0]);
              const [, end] = segmentEnds(segments[segments.length - 1]);
              return (
                samePoint(start, centers[i]) && samePoint(end, centers[i + 1])
              );
            });
            if (!threads) {
              // The two pairwise routes that draw one segment per step, and
              // every sequence curve.
              const threadingCurves = ["linear", "bezier"]
                .concat(sequenceCurveNames())
                .map((name) => `Curve.${name}()`)
                .join(", ");
              throw new Error(
                `[gofish] line({ curve: Curve.${resolvedCurveName}() }): this line ` +
                  `threads the keyframes of a time.sequence, so it is drawn ` +
                  `only over the stretch of time the sequence shows, cut at ` +
                  `the exact point in data time. That cut needs each step ` +
                  `from one keyframe to the next to run between the keyframes' ` +
                  `centers and to say how its time runs along it, which ` +
                  `${threadingCurves} draw and Curve.${resolvedCurveName}() does ` +
                  `not. Use one of those, or open an issue for ` +
                  `Curve.${resolvedCurveName}().`
              );
            }
            timeRun = {
              knots: timeKnots,
              pieces: steps[0],
              sequence: keyframes![0].sequence,
              last: last!,
            };
          }

          // The drawn path can leave the endpoints' box: an arc bulges, a
          // perfect-arrows bow curves, a smooth curve overshoots (#1166).
          box = union(box, pathBounds(drawn.flat()));

          return {
            intrinsicDims: boxDims(box),
            transform: { translate: [0, 0] },
            // The box above is the WHOLE run's, cut or not: the room a line
            // uses over its run, the way a transition claims its whole
            // trajectory, so the window moving changes nothing above it.
            renderData: {
              paths: drawn,
              defaultColor,
              timeRun,
            },
          };
        },
        // IR lowering — mirror of `render`. Each connector path is offset by the
        // node's absolute translate (the legacy `<g transform>`), warped by any
        // coordinate transform, then mapped through `toPixel`. Paint order
        // (connector beneath the marks) is the connect node's zOrder(-1),
        // resolved globally by the bake — not this method's concern.
        lower: (
          { renderData, coordinateTransform, toPixel, local },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const scaleContext = node.getRenderSession().scaleContext;
          const rawFill: MaybeValue<string> | undefined =
            fill ?? renderData.defaultColor;
          const resolvedFill: string | undefined = resolveColorChannel(
            rawFill as MaybeValue<string>,
            scaleContext?.unit
          );
          const resolvedStroke: string | undefined = resolveColorChannel(
            stroke,
            scaleContext?.unit
          );

          const style = lowerStyle({
            ...paintOf(resolvedFill, resolvedStroke),
            strokeDasharray,
            opacity: opacity ?? 1,
            // Normal (none) by default; a ribbon that wants
            // overlaps to darken opts into `blendMode: "multiply"` explicitly.
            mixBlendMode: blendMode,
          });

          /** A path's pixel-space path data. The paths were built in the
           *  connector's local frame and axis order; `local` places them. */
          const pathData = (orderPath: Path): string => {
            const path = mapPathPoints(orderPath, local);
            return pathToPixelSVG(
              coordinateTransform
                ? transformPath(path, coordinateTransform, { resample: true })
                : path,
              toPixel
            );
          };
          const toItem = (d: string): DisplayList.DisplayItem => ({
            kind: "path",
            d,
            role: roleFor(node.datum),
            datum: node.datum,
            style,
          });

          const timeRun = renderData.timeRun as TimeRun | undefined;
          if (timeRun === undefined) {
            return (renderData.paths as Path[]).map((path) =>
              toItem(pathData(path))
            );
          }
          // A line threading a sequence's keyframes: its steps, cut to
          // the window the sequence is showing. The window is read once here
          // for the value to lower, and then per frame in paint position by
          // the `d` slot, which patches the path data and nothing else — the
          // same split `tween` makes for its playhead.
          const { knots, pieces, sequence, last } = timeRun;
          const drawnOver = (): string =>
            pathData(windowPath(pieces, knots, sequence.showing(last).window));
          const item = toItem(readLive(drawnOver));
          setLiveSlots(item, { d: drawnOver });
          return [item];
        },
        // Its outline is what it draws, over its whole run, painted as
        // `lower` paints it (`paintOf`). The paths are kept in axis order;
        // the outline is in pixels.
        geometry: (laidOut, layoutChildren, node) => {
          const paint = outlinePaint(
            paintOf(fill ?? laidOut.renderData?.defaultColor, stroke)
          );
          return {
            ...defaultGeometry(laidOut, layoutChildren, node),
            outline: (tolerance) =>
              ((laidOut.renderData?.paths ?? []) as Path[]).map((path) =>
                pathOutline(
                  path,
                  tolerance,
                  node.yFrame.direction,
                  closed,
                  paint
                )
              ),
          };
        },
      },
      children
    );
    // It draws between the nodes it reads, where they landed: its layout
    // places it, on both axes.
    node.placedByLayout = [true, true];
    return node;
  }
);
