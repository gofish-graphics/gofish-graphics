import { Path, transformPath } from "../../path";
import { convertPointsToBezierCurves } from "../../adaptive-resampling";
import { GoFishAST } from "../_ast";
import { GoFishNode, type ToPixel } from "../_node";
import { resolveColorChannel } from "../../color";
import type { DisplayList } from "gofish-ir";
import {
  lowerStyle,
  pathToPixelSVG,
  roleFor,
} from "../displayList/lowerHelpers";
import {
  Dimensions,
  displayTranslate,
  elaborateDirection,
  FancyDirection,
  Size,
} from "../dims";
import { pairs } from "../../util";
import { linear } from "../coordinateTransforms/linear";
import { isValue, MaybeValue } from "../data";
import { Domain, axisScale } from "../domain";
import {
  UNDEFINED,
  UnderlyingSpace,
  isPOSITION,
  isPositioningSpace,
} from "../underlyingSpace";
import { createNodeOperator } from "../withGoFish";
import {
  resolveCurve,
  centerPoint,
  isSequenceCurve,
  isThreadingCurve,
  type Curve,
} from "./routers";
import { targetOf } from "./layer";
import { readLive } from "../../interaction/live";
import { setLiveSlots } from "../../interaction/liveSlots";
import {
  keyframeOf,
  keyframeShowing,
  windowPath,
  type Keyframe,
  type SequenceWindow,
  type TimeWindow,
} from "../../timeWindow";

// Per-axis bbox anchor. A literal number is the raw fraction in [0, 1]; the
// keywords map to {start: 0, middle: 0.5, end: 1}. GoFish is y-up, so
// `start`/`end` on the y axis are bottom/top respectively.
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
function sequenceKeyframes(children: GoFishAST[]): Keyframe[] | undefined {
  const found = children.map((child) => keyframeOf(targetOf(child)));
  const first = found[0];
  if (first === undefined) return undefined;
  return found.every((k) => k?.sequence === first.sequence)
    ? (found as Keyframe[])
    : undefined;
}

/** A line threaded through a sequence's keyframes: each knot's time, in path
 *  order, and the sequence whose window it is drawn over. */
type TimeRun = { knots: number[]; sequence: SequenceWindow };

export const connect = createNodeOperator(
  (
    {
      direction,
      fill,
      curve,
      stroke,
      strokeWidth,
      strokeDasharray,
      opacity,
      mode = "edge",
      mixBlendMode,
      source,
      target,
    }: {
      // Optional in anchor mode (source/target), where it is ignored.
      direction?: FancyDirection;
      fill?: MaybeValue<string>;
      // The single screen-space path-shaping key. A curve value from a factory
      // (`bezier()`, `orthogonal()`, `arc({ direction })`,
      // `perfectArrows({ bow })`, …) or a bare name (`"linear"` | `"bezier"`).
      // Center ("line") mode resolves it through the curve registry; edge
      // ("ribbon") mode only honors `linear` (linear band) vs `bezier`
      // (S-curve band). Omitted means `"auto"` (resolved below).
      curve?: Curve;
      stroke?: MaybeValue<string>;
      strokeWidth?: number;
      strokeDasharray?: string;
      opacity?: number;
      mode?: "edge" | "center";
      mixBlendMode?: "multiply" | "normal";
      // Per-endpoint anchor on each child's bbox. Accepts a per-axis tuple
      // `[fx, fy]` of numbers (`min + f * size`) or alignment keywords
      // (`start | middle | end` → `0 | 0.5 | 1`), with a single keyword as
      // shorthand for both axes (e.g. `"middle"` ≡ `[0.5, 0.5]`).
      //
      // When either is given, the connector runs straight between the
      // anchored points of each consecutive child pair, ignoring
      // `direction`/`mode`. If both are given, the line runs directly between
      // them. If only one is given, the other endpoint is the specified
      // point clamped onto the opposite bbox per axis (Bluefish `Line`
      // behavior) — yielding an axis-aligned line when the point lies within
      // that box on one axis.
      source?: AnchorSpec;
      target?: AnchorSpec;
    },
    children: GoFishAST[]
  ) => {
    const resolvedSource =
      source !== undefined ? resolveAnchor(source) : undefined;
    const resolvedTarget =
      target !== undefined ? resolveAnchor(target) : undefined;
    const dir = elaborateDirection(direction ?? 0);
    const curveNameOf = (c: Curve | undefined): string | undefined =>
      c === undefined ? undefined : typeof c === "string" ? c : c.type;

    const self: GoFishNode = new GoFishNode(
      {
        type: "connect",
        shared: [false, false],
        // The domain-building walk (`GoFishNode.resolveColorScale`) only
        // reads a node's single `color` property to register a field-valued
        // paint into the shared discrete-color scale. Prefer whichever
        // channel is data-driven — same idiom as rect/petal's `color`. By the
        // time Connect sees them, field-valued paints have already been
        // resolved to `Value`s by `resolveGroupFill` (chart.ts), so
        // `isValue` distinguishes data-driven from a literal color.
        color: isValue(fill) ? fill : stroke,
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => {
          return [UNDEFINED, UNDEFINED];
        },
        layout: (shared, size, scales, children) => {
          const defaultColor = children[0]?.color ?? "black";

          const paths: Path[] = [];

          const hasAnchors =
            resolvedSource !== undefined || resolvedTarget !== undefined;

          // A connector over a `time.sequence`'s keyframes is read in time as
          // well as in space, by the window the sequence shows (see
          // `src/timeWindow.ts`). Operands all inside ONE keyframe: the
          // connector is part of that keyframe's picture, so it shows when
          // the keyframe does, and is not cut. Operands in DIFFERENT
          // keyframes: it threads the time tier, so it draws only the stretch
          // of its run inside the window, cut by data time at paint (see
          // `lower`). Which case it is comes from the keyframes themselves,
          // not from the field names in the spec.
          const keyframes = sequenceKeyframes(children);
          const threadsTime =
            keyframes !== undefined &&
            keyframes.some((k) => k.t !== keyframes[0].t);
          if (keyframes !== undefined && !threadsTime) {
            self.INTERNAL_visibleWhile(() => keyframeShowing(keyframes[0]));
          }
          if (threadsTime && (mode !== "center" || hasAnchors)) {
            throw new Error(
              `[gofish] ${mode === "center" ? "line" : "ribbon"}(): this ` +
                `connector threads the keyframes of a time.sequence, so it ` +
                `is drawn only over the stretch of time the sequence shows, ` +
                `cut at the exact point in data time. That cut is built for ` +
                `a line through the keyframes' centers; ` +
                (mode === "center"
                  ? "a line pinned to `source`/`target` anchors"
                  : "a ribbon's band") +
                ` is not built yet.`
            );
          }

          if (mode === "edge" && !hasAnchors) {
            for (const child of children) {
              // toggle embedding on the direction axis
              (child as GoFishAST).embed(direction ?? 0);
            }
          }

          // Forward σ (size slope) but not the anchored map: connect places
          // endpoints by their own bboxes, not by data position.
          const childPlaceables = children.map((child) =>
            child.layout(size, [
              axisScale(scales?.[0]?.sigma, undefined),
              axisScale(scales?.[1]?.sigma, undefined),
            ])
          );
          const bboxPairs = pairs(childPlaceables.map((child) => child.dims));

          // Resolve the curve. An omitted/`"auto"` curve detects whether the
          // connected points share a homogeneous *continuous* space on the
          // connection axis (i.e. they are samples of a continuous variable):
          // if so we smooth with a centripetal Catmull-Rom spline; otherwise we
          // fall back to the always-drawable discrete connector (line→linear,
          // ribbon→bezier). Connecting two arbitrary points is therefore always
          // valid — it just isn't smoothed. Explicit curves always win.
          //
          // The children carry the space because `resolveNames` runs before the
          // underlying-space pass, so a `ref` already proxies its target's space
          // (falling back to ORDINAL ⇒ discrete when unresolved).
          const isAuto = curve === undefined || curveNameOf(curve) === "auto";
          let resolvedCurve: Curve;
          if (!isAuto) {
            resolvedCurve = curve as Curve;
          } else {
            const axis = dir as 0 | 1;
            // The connection-axis *positioning* space lives on whatever placed
            // the connected marks: the mark itself (a data-bound
            // `ellipse({ x: value(…) })` reports POSITION) or an ancestor (a
            // `circle`/`blank` placed by `scatter` — the scatter reports
            // POSITION). So walk up from each mark to the nearest ancestor whose
            // connection-axis space is a *positioning* kind (POSITION = data
            // axis, ORDINAL = category axis), skipping the mark's own SIZE
            // (its extent, e.g. a circle's radius) and UNDEFINED.
            const connectionSpaceOf = (
              c: GoFishAST
            ): UnderlyingSpace | undefined => {
              let node: any = (c as any).targetNode ?? c;
              while (node) {
                const s = node.resolveUnderlyingSpace?.()?.[axis];
                // Stop at the nearest *positioning* space — an ORDINAL ancestor
                // must win over a continuous grandparent (a grouped layout is
                // discrete even inside a continuous frame), so we can't skip it.
                if (s !== undefined && isPositioningSpace(s)) return s;
                node = node.parent;
              }
              return undefined;
            };
            const homogeneousContinuous =
              children.length >= 2 &&
              children.every((c) => {
                const s = connectionSpaceOf(c);
                return s !== undefined && isPOSITION(s);
              });
            // A *homogeneous continuous* connection axis (the points are samples
            // of one continuous variable — a line chart, or a stacked area /
            // streamgraph over a continuous x) smooths with centripetal
            // Catmull-Rom, for BOTH lines and ribbons: a stacked area should
            // curve like its line-chart sibling. Otherwise we draw the mode's
            // "linear" connector: a *line* (center) is a straight polyline
            // between the points; a *ribbon* (edge) is a bezier band between
            // discrete regions (bezier is to a band what a straight segment is
            // to a line — the honest discrete-region connector). Explicit curves
            // always win over this default.
            resolvedCurve = homogeneousContinuous
              ? "catmullRom"
              : mode === "center"
                ? "linear"
                : "bezier";
          }
          const resolvedCurveName = curveNameOf(resolvedCurve);
          // Edge ("ribbon") mode: bezier = S-curve band (discrete regions),
          // catmullRom = smoothed band over a continuous axis, else linear band.
          const edgeBezier = resolvedCurveName === "bezier";

          // Anchor mode: connect normalized points on each endpoint's bbox.
          if (hasAnchors) {
            const onlySource =
              resolvedSource !== undefined && resolvedTarget === undefined;
            const onlyTarget =
              resolvedTarget !== undefined && resolvedSource === undefined;

            // Resolve a normalized [fx, fy] anchor to an absolute point on a bbox.
            const anchorPoint = (
              b: Dimensions,
              f: [number, number]
            ): [number, number] => [
              b[0].min! + f[0] * b[0].size!,
              b[1].min! + f[1] * b[1].size!,
            ];

            // When one anchor is omitted, clamp the specified point's
            // coordinates into the other bbox's range (per-axis). This is
            // Bluefish's Line behavior: it produces an axis-aligned line when
            // the specified point lies within the other box on one axis, and
            // falls back to the nearest corner otherwise.
            const clamp = (v: number, lo: number, hi: number): number =>
              Math.max(lo, Math.min(hi, v));
            const clampOnto = (
              pt: [number, number],
              onto: Dimensions
            ): [number, number] => [
              clamp(pt[0], onto[0].min!, onto[0].max!),
              clamp(pt[1], onto[1].min!, onto[1].max!),
            ];

            let aMinX = Infinity;
            let aMaxX = -Infinity;
            let aMinY = Infinity;
            let aMaxY = -Infinity;
            for (const [b0, b1] of bboxPairs) {
              let p0: [number, number];
              let p1: [number, number];
              if (onlySource) {
                p0 = anchorPoint(b0, resolvedSource!);
                p1 = clampOnto(p0, b1);
              } else if (onlyTarget) {
                p1 = anchorPoint(b1, resolvedTarget!);
                p0 = clampOnto(p1, b0);
              } else {
                p0 = anchorPoint(b0, resolvedSource ?? [0.5, 0.5]);
                p1 = anchorPoint(b1, resolvedTarget ?? [0.5, 0.5]);
              }
              paths.push([{ type: "line", points: [p0, p1] }]);
              aMinX = Math.min(aMinX, p0[0], p1[0]);
              aMaxX = Math.max(aMaxX, p0[0], p1[0]);
              aMinY = Math.min(aMinY, p0[1], p1[1]);
              aMaxY = Math.max(aMaxY, p0[1], p1[1]);
            }
            const hasPaths = bboxPairs.length > 0;
            const w = hasPaths ? aMaxX - aMinX : 0;
            const h = hasPaths ? aMaxY - aMinY : 0;
            return {
              intrinsicDims: [
                {
                  min: hasPaths ? aMinX : 0,
                  size: w,
                },
                {
                  min: hasPaths ? aMinY : 0,
                  size: h,
                },
              ],
              transform: { translate: [0, 0] },
              renderData: { paths, defaultColor },
            };
          }
          // A line threading a sequence's keyframes is cut inside a segment
          // by data time, which needs segment `i` of its path to run from
          // knot `i` to knot `i + 1` (a threading curve), and the knots to
          // move forward in time along the path.
          let timeRun: TimeRun | undefined;
          if (threadsTime) {
            if (!isThreadingCurve(resolvedCurveName)) {
              throw new Error(
                `[gofish] line({ curve: "${resolvedCurveName}" }): this line ` +
                  `threads the keyframes of a time.sequence, so it is drawn ` +
                  `only over the stretch of time the sequence shows, cut at ` +
                  `the exact point in data time. That cut needs each step ` +
                  `from one keyframe to the next to be ONE straight or cubic ` +
                  `segment between the keyframes' centers, which "linear", ` +
                  `"bezier" and "catmullRom" (the default) draw and ` +
                  `"${resolvedCurveName}" does not. Use one of those, or ` +
                  `open an issue for "${resolvedCurveName}".`
              );
            }
            const knots = keyframes.map((k) => k.t);
            const back = knots.findIndex(
              (t, i) => i > 0 && !(t > knots[i - 1])
            );
            if (back >= 0) {
              throw new Error(
                `[gofish] line(): this line threads the keyframes of a ` +
                  `time.sequence, so each of its points is a moment in time, ` +
                  `and it goes from ${knots[back - 1]} to ${knots[back]}: ` +
                  `back in time, or twice through one keyframe. A line drawn ` +
                  `in over time has to move forward through the keyframes. If ` +
                  `each keyframe holds several marks, split the line so each ` +
                  `run has one mark per keyframe (for example, add \`by\` to ` +
                  `the operator that places the marks).`
              );
            }
            timeRun = { knots, sequence: keyframes[0].sequence };
          }

          // If in center mode, adjust bounding boxes to have zero width/height
          // with min and max equal to the center point

          // Compute bounding box from connected elements
          let bboxMinX = Infinity;
          let bboxMaxX = -Infinity;
          let bboxMinY = Infinity;
          let bboxMaxY = -Infinity;

          for (const [b0, b1] of bboxPairs) {
            if (mode === "center") {
              const cx0 = (b0[0].min! + b0[0].max!) / 2;
              const cy0 = (b0[1].min! + b0[1].max!) / 2;
              const cx1 = (b1[0].min! + b1[0].max!) / 2;
              const cy1 = (b1[1].min! + b1[1].max!) / 2;
              bboxMinX = Math.min(bboxMinX, cx0, cx1);
              bboxMaxX = Math.max(bboxMaxX, cx0, cx1);
              bboxMinY = Math.min(bboxMinY, cy0, cy1);
              bboxMaxY = Math.max(bboxMaxY, cy0, cy1);
            } else {
              bboxMinX = Math.min(bboxMinX, b0[0].min!, b1[0].min!);
              bboxMaxX = Math.max(bboxMaxX, b0[0].max!, b1[0].max!);
              bboxMinY = Math.min(bboxMinY, b0[1].min!, b1[1].min!);
              bboxMaxY = Math.max(bboxMaxY, b0[1].max!, b1[1].max!);
            }
          }

          // `catmullRom` is a *sequence* curve — it threads the whole run of
          // points as one centripetal spline (d3's `.curve(curveCatmullRom)`),
          // bypassing the pairwise router loop. A line (center) threads its
          // centers; a ribbon (edge) threads BOTH facing boundaries of the band
          // — forward along the near edge, a cap across, back along the far edge
          // — so a continuous stacked area curves like its line-chart sibling.
          const mainAxis = dir as 0 | 1;
          const edgePoint = (main: number, cross: number): [number, number] => {
            const p: [number, number] = [0, 0];
            p[mainAxis] = main;
            p[1 - mainAxis] = cross;
            return p;
          };
          if (isSequenceCurve(resolvedCurveName)) {
            if (mode === "center") {
              const centers = childPlaceables.map((c) => centerPoint(c.dims));
              paths.push(convertPointsToBezierCurves(centers));
            } else {
              const near: [number, number][] = [];
              const far: [number, number][] = [];
              for (const c of childPlaceables) {
                const b = c.dims;
                const main = (b[mainAxis].min! + b[mainAxis].max!) / 2;
                near.push(edgePoint(main, b[1 - mainAxis].min!));
                far.push(edgePoint(main, b[1 - mainAxis].max!));
              }
              const farRev = far.slice().reverse();
              paths.push([
                ...convertPointsToBezierCurves(near),
                { type: "line", points: [near[near.length - 1], farRev[0]] },
                ...convertPointsToBezierCurves(farRev),
                { type: "line", points: [farRev[farRev.length - 1], near[0]] },
              ]);
            }
          } else if (mode === "center") {
            const { router, options: routeOpts } = resolveCurve(resolvedCurve);
            for (const [b0, b1] of bboxPairs) {
              paths.push(
                router(b0, b1, { dir: dir as 0 | 1, opts: routeOpts })
              );
            }
          } else if (dir === 0) {
            // Edge ("ribbon") mode: a filled quad between the facing edges.
            if (!edgeBezier) {
              for (const [b0, b1] of bboxPairs) {
                paths.push([
                  {
                    type: "line",
                    points: [
                      [b0[0].max!, b0[1].min!],
                      [b1[0].min!, b1[1].min!],
                    ],
                  },
                  {
                    type: "line",
                    points: [
                      [b1[0].min!, b1[1].min!],
                      [b1[0].min!, b1[1].max!],
                    ],
                  },
                  {
                    type: "line",
                    points: [
                      [b1[0].min!, b1[1].max!],
                      [b0[0].max!, b0[1].max!],
                    ],
                  },
                  {
                    type: "line",
                    points: [
                      [b0[0].max!, b0[1].max!],
                      [b0[0].max!, b0[1].min!],
                    ],
                  },
                ]);
              }
            } else {
              for (const [b0, b1] of bboxPairs) {
                const midX = (b0[0].max! + b1[0].min!) / 2;
                paths.push([
                  {
                    type: "bezier",
                    start: [b0[0].max!, b0[1].min!],
                    control1: [midX, b0[1].min!],
                    control2: [midX, b1[1].min!],
                    end: [b1[0].min!, b1[1].min!],
                  },
                  {
                    type: "line",
                    points: [
                      [b1[0].min!, b1[1].min!],
                      [b1[0].min!, b1[1].max!],
                    ],
                  },
                  {
                    type: "bezier",
                    start: [b1[0].min!, b1[1].max!],
                    control1: [midX, b1[1].max!],
                    control2: [midX, b0[1].max!],
                    end: [b0[0].max!, b0[1].max!],
                  },
                  {
                    type: "line",
                    points: [
                      [b0[0].max!, b0[1].max!],
                      [b0[0].max!, b0[1].min!],
                    ],
                  },
                ]);
              }
            }
          } else {
            if (!edgeBezier) {
              for (const [b0, b1] of bboxPairs) {
                paths.push([
                  {
                    type: "line",
                    points: [
                      [b0[0].min!, b0[1].max!],
                      [b1[0].min!, b1[1].min!],
                    ],
                  },
                  {
                    type: "line",
                    points: [
                      [b1[0].min!, b1[1].min!],
                      [b1[0].max!, b1[1].min!],
                    ],
                  },
                  {
                    type: "line",
                    points: [
                      [b1[0].max!, b1[1].min!],
                      [b0[0].max!, b0[1].max!],
                    ],
                  },
                  {
                    type: "line",
                    points: [
                      [b0[0].max!, b0[1].max!],
                      [b0[0].min!, b0[1].max!],
                    ],
                  },
                ]);
              }
            } else {
              for (const [b0, b1] of bboxPairs) {
                const midY = (b0[1].max! + b1[1].min!) / 2;
                paths.push([
                  {
                    type: "bezier",
                    start: [b0[0].min!, b0[1].max!],
                    control1: [b0[0].min!, midY],
                    control2: [b1[0].min!, midY],
                    end: [b1[0].min!, b1[1].min!],
                  },
                  {
                    type: "line",
                    points: [
                      [b1[0].min!, b1[1].min!],
                      [b1[0].max!, b1[1].min!],
                    ],
                  },
                  {
                    type: "bezier",
                    start: [b1[0].max!, b1[1].min!],
                    control1: [b1[0].max!, midY],
                    control2: [b0[0].max!, midY],
                    end: [b0[0].max!, b0[1].max!],
                  },
                  {
                    type: "line",
                    points: [
                      [b0[0].max!, b0[1].max!],
                      [b0[0].min!, b0[1].max!],
                    ],
                  },
                ]);
              }
            }
          }

          // Merge consecutive segments that meet at a zero-extent joint into a
          // single region/polyline (#520). Each pair was emitted as its own path,
          // but adjacent segments share an edge at exact coordinates, so rendering
          // them as separate <path>s lets antialiasing open hairline ~0.5px seams
          // off the pixel grid. One path per run is gap-proof by construction.
          //
          // The joint between paths[i] and paths[i+1] is child i+1; it "has no
          // extent" when that child collapses to a point on the connection
          // (direction) axis (area points are zero-width; bar-like children with
          // real width genuinely don't share an edge and must stay separate).
          const EPS = 1e-6;
          const jointMerges = (i: number): boolean => {
            // center mode connects exact center points — always contiguous
            if (mode === "center") return true;
            // the joint between paths[i] and paths[i+1] is child i+1
            const b = childPlaceables[i + 1].dims;
            return Math.abs((b[dir].max ?? 0) - (b[dir].min ?? 0)) < EPS;
          };

          const flushRun = (run: Path[]): Path => {
            if (run.length === 1) return run[0];
            if (mode === "center") {
              // Single-segment lines → one continuous polyline.
              return run.flat();
            }
            // Each edge-mode segment is a quad
            // [leadingEdge, endCap, trailingEdge, startCap]. Trace every leading
            // edge forward, cap the last segment, trace every trailing edge back
            // (reverse order; interior caps are zero-length so segments chain
            // exactly), then cap the first — one closed region.
            return [
              ...run.map((p) => p[0]),
              run[run.length - 1][1],
              ...run
                .slice()
                .reverse()
                .map((p) => p[2]),
              run[0][3],
            ];
          };

          const mergedPaths: Path[] = [];
          let run: Path[] = [];
          for (let i = 0; i < paths.length; i++) {
            run.push(paths[i]);
            if (i === paths.length - 1 || !jointMerges(i)) {
              mergedPaths.push(flushRun(run));
              run = [];
            }
          }

          // If no paths were created, use zero dimensions
          const bboxW = bboxPairs.length > 0 ? bboxMaxX - bboxMinX : 0;
          const bboxH = bboxPairs.length > 0 ? bboxMaxY - bboxMinY : 0;

          return {
            intrinsicDims: [
              {
                min: bboxPairs.length > 0 ? bboxMinX : 0,
                size: bboxW,
              },
              {
                min: bboxPairs.length > 0 ? bboxMinY : 0,
                size: bboxH,
              },
            ],
            transform: { translate: [0, 0] },
            // The box above is the WHOLE run's, cut or not: the room a line
            // uses over its run, the way a transition claims its whole
            // trajectory, so the window moving changes nothing above it.
            renderData: { paths: mergedPaths, defaultColor, timeRun },
          };
        },
        // IR lowering — mirror of `render`. Each connector path is offset by the
        // node's absolute translate (the legacy `<g transform>`), warped by any
        // coordinate transform, then mapped through `toPixel`. Paint order
        // (connector beneath the marks) is the connect node's zOrder(-1),
        // resolved globally by the bake — not this method's concern.
        lower: (
          { transform, renderData, coordinateTransform, toPixel },
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

          // The legacy `<g transform="translate(tx,ty)">` offset, folded into a
          // local pixel map so each path point lands at its absolute pixel.
          //
          // LIMITATION (#657, a #629 follow-up): the connector is ONE bake entry
          // with ONE flip, so every path point — both endpoints — maps through
          // this single `toPixel`. A connector spanning two DIFFERENT orientation
          // scopes (e.g. a y-up bar to a y-down heatmap cell) therefore mirrors
          // one endpoint incorrectly. A clean fix needs per-endpoint scopes plus
          // a mid-path reconciliation; deferred. Single-scope connectors (the
          // common case) are correct.
          const [tx, ty] = displayTranslate(transform);
          const offsetToPixel: ToPixel = ([px, py]) =>
            toPixel([px + tx, py + ty]);

          const style = lowerStyle({
            fill: mode === "center" ? "none" : (resolvedFill ?? "none"),
            stroke: resolvedStroke ?? resolvedFill ?? "black",
            strokeWidth: strokeWidth ?? 0,
            strokeDasharray,
            opacity: opacity ?? 1,
            // Normal by default for both modes; a ribbon that wants overlaps to
            // darken opts into `mixBlendMode: "multiply"` explicitly.
            mixBlendMode: mixBlendMode ?? "normal",
          });

          /** A path's pixel-space path data. */
          const pathData = (path: Path): string =>
            pathToPixelSVG(
              coordinateTransform
                ? transformPath(path, coordinateTransform, { resample: true })
                : path,
              offsetToPixel
            );
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
          // A line threading a sequence's keyframes: its one path, cut to
          // the window the sequence is showing. The window is read once here
          // for the value to lower, and then per frame in paint position by
          // the `d` slot, which patches the path data and nothing else — the
          // same split `tween` makes for its playhead.
          const [run] = renderData.paths as Path[];
          const drawnOver = (window: TimeWindow): string =>
            pathData(windowPath(run, timeRun.knots, window));
          const item = toItem(drawnOver(readLive(timeRun.sequence.window)));
          setLiveSlots(item, { d: () => drawnOver(timeRun.sequence.window()) });
          return [item];
        },
      },
      children
    );
    return self;
  }
);
