/**
 * Curve registry — the path-shaping algorithms for the `line`/`ribbon`
 * mark (and any connector). The public `curve` option resolves (via
 * `resolveCurve`) to a *router*: a function that shapes the stroke between two
 * already-resolved endpoints (their bboxes). All of these are screen-space and
 * pure geometry of the resolved point sequence — the data-space cousin
 * (statistical smoothing: loess/regression) is a separate `derive` operator
 * (see issue #635), not a curve.
 *
 * Built-ins below are the *routing* curves (linear / bezier / orthogonal /
 * arc — the GoTree link styles, Li et al. CHI 2020 — plus perfect-arrows), each
 * pairwise, and the *sequence* curves (step, monotone, smooth,
 * catmullRom), which thread the whole point run (`sequenceCurve`). The set is
 * closed: the kinds of the Curve family in gofish-ir's STRATEGIES table.
 */
import {
  type Path,
  type Point,
  type BezierCurve,
  type Step,
  evenStep,
  segment,
  curve,
} from "../../path";
import type { Dimensions } from "../dims";
import type { Curve } from "../../families/curve";
import type { CoordinateTransform } from "../coordinateTransforms/coord";
import { getBoxToBoxArrow } from "perfect-arrows";
import { Frontend } from "gofish-ir";
import {
  SMOOTH_CURVES,
  catmullRomPath,
  centripetalKnots,
  stepPath,
  threadPath,
} from "../../spline";

/** Context handed to a router for one endpoint pair. */
export type RouteContext = {
  /** Main (connection) axis: 0 = x, 1 = y. */
  dir: 0 | 1;
  /** Active coordinate transform, for coordinate-aware routes. */
  coord?: CoordinateTransform;
  /** Free-form per-route options (e.g. `arcDirection`, perfect-arrows `bow`). */
  opts?: Record<string, any>;
};

/**
 * A router turns the resolved bboxes of two endpoints into a `Path` (a list of
 * line/bezier segments). It reads only resolved geometry, never data.
 */
export type Router = (
  b0: Dimensions,
  b1: Dimensions,
  ctx: RouteContext
) => Path;

/**
 * `curve` is the single screen-space path-shaping key on `line`/`ribbon` — it
 * holds both interpolating curves that thread the point sequence (linear,
 * bezier, step, monotone, smooth, catmullRom) and routing curves that shape the stroke between two
 * anchors (orthogonal, arc, perfectArrows). Its value is a `Curve`, made by a
 * call in the `Curve` family (`families/curve.ts`). A curve resolves to a
 * `Router`.
 */

/** The name of a curve value, or undefined when it is omitted. Anything that
 *  is not a Curve-family value (an unknown kind, an undeclared or
 *  out-of-bounds param) throws, naming `where` the option was written. */
export function curveName(
  curve: Curve | undefined,
  where: string
): string | undefined {
  if (curve === undefined) return undefined;
  Frontend.checkStrategy("Curve", curve, where);
  return curve.kind;
}

/**
 * A sequence curve threads the *whole* run of points as one spline, rather
 * than routing each consecutive pair independently. `connect` builds these
 * from the full point sequence instead of the pairwise router loop.
 */
export type SequenceCurve = {
  /** Thread the run, as one step per interval between neighboring points.
   *  A step is one or more segments from the one point to the next, each
   *  with its share of the step's time (`Step`). The run's parameter is only
   *  passed when `takesKnots`. */
  thread: (points: Point[], parameter: RunParameter) => Step[];
  /** Whether the curve is read over the run's parameter (so `connect` works
   *  one out), or is a shape on screen that ignores it. */
  takesKnots: boolean;
};

/** What a sequence curve knows of the parameter a run is read over. */
export type RunParameter = {
  /** The run's own parameter, one value per point, strictly ascending; or
   *  undefined when it has none. */
  knots?: number[];
  /** The coordinate (0 = x, 1 = y) that draws the parameter itself, when one
   *  does: the x of a line chart over years, when the years are the
   *  parameter. Undefined when no coordinate does. */
  parameterAxis?: 0 | 1;
};

// TODO(#1101): user-defined strategies (a route of one's own) are designed
// in #1101, one extensibility model for the strategy families. Until then the
// curves are the built-ins below, and nothing outside this module adds one.

/** The pairwise routes, by curve kind. */
const routes = new Map<string, Router>();

/** The sequence curves, by curve kind: `connect` threads them over the whole
 *  run, which a router never sees. */
const sequenceCurves = new Map<string, SequenceCurve>();

/** The sequence curve registered under `name`, or undefined when `name` is a
 *  pairwise route (or nothing). */
export function sequenceCurve(
  name: string | undefined
): SequenceCurve | undefined {
  return name === undefined ? undefined : sequenceCurves.get(name);
}

/** The names of the registered sequence curves. */
export const sequenceCurveNames = (): string[] => [...sequenceCurves.keys()];

/** Resolve a `Curve` to its router fn + options: the params beside its
 *  `kind`. */
export function resolveCurve(curve: Curve): {
  router: Router;
  options: Record<string, any>;
} {
  const { kind, ...options } = curve;
  const router = routes.get(kind);
  if (router === undefined)
    throw new Error(
      `[gofish] Curve.${kind}() is not a pairwise route (${[...routes.keys()].join(", ")}).`
    );
  return { router, options };
}

// --- geometry helpers -------------------------------------------------------

const center = (b: Dimensions, axis: 0 | 1): number =>
  (b[axis].min! + b[axis].max!) / 2;

export const centerPoint = (b: Dimensions): Point => [
  center(b, 0),
  center(b, 1),
];

/** Build a point from a main-axis and cross-axis coordinate. */
const byAxis = (dir: 0 | 1, mainVal: number, crossVal: number): Point => {
  const p: [number, number] = [0, 0];
  p[dir] = mainVal;
  p[1 - dir] = crossVal;
  return p;
};

// --- built-in routers -------------------------------------------------------

/** Straight center-to-center line (≡ the old `linear` center mode). */
const linearRouter: Router = (b0, b1) => [
  segment(centerPoint(b0), centerPoint(b1)),
];

/**
 * Cubic bezier with both control points at the main-axis midpoint — the
 * d3.linkVertical/linkHorizontal convention, and GoTree's `curve` link (`se`).
 * This is the correct center-mode bezier (the old inline center-mode bezier
 * degraded to a straight line).
 */
const bezierRouter: Router = (b0, b1, { dir }) => {
  const c0 = centerPoint(b0);
  const c1 = centerPoint(b1);
  const mid = (c0[dir] + c1[dir]) / 2;
  const control1 = byAxis(dir, mid, c0[1 - dir]);
  const control2 = byAxis(dir, mid, c1[1 - dir]);
  return [curve(c0, control1, control2, c1)];
};

/**
 * Right-angle elbow bending at the main-axis midpoint — GoTree's `orthogonal`
 * link (`ue`): `c0 → [c0cross, mid] → [c1cross, mid] → c1`, as a plain polyline.
 */
const orthogonalRouter: Router = (b0, b1, { dir, opts }) => {
  const c0 = centerPoint(b0);
  const c1 = centerPoint(b1);
  // The elbow bends at the midpoint of the *main* (growth) axis. Normally that
  // is the caller's declared `dir`. `bend: "auto"` instead infers it from the
  // geometry — whichever axis separates the two endpoints more — so a connector
  // tracks the actual growth direction when the caller can't name it (e.g. a
  // gotree diagonal cascade). Ties prefer the vertical axis (y = 1), matching
  // the default top-down tree.
  const axis: 0 | 1 =
    opts?.bend === "auto"
      ? Math.abs(c1[0] - c0[0]) > Math.abs(c1[1] - c0[1])
        ? 0
        : 1
      : dir;
  const mid = (c0[axis] + c1[axis]) / 2;
  const bend0 = byAxis(axis, mid, c0[1 - axis]);
  const bend1 = byAxis(axis, mid, c1[1 - axis]);
  return [segment(c0, bend0), segment(bend0, bend1), segment(bend1, c1)];
};

/**
 * Cubic-bezier approximation of a circular arc from angle `a0` to `a1` about
 * center `M` with radius `r` (standard k = 4/3·tan(Δ/4) construction).
 */
const arcBezier = (
  M: Point,
  r: number,
  a0: number,
  a1: number
): BezierCurve => {
  const k = (4 / 3) * Math.tan((a1 - a0) / 4);
  const p0: Point = [M[0] + r * Math.cos(a0), M[1] + r * Math.sin(a0)];
  const p1: Point = [M[0] + r * Math.cos(a1), M[1] + r * Math.sin(a1)];
  const c1: Point = [
    p0[0] - k * r * Math.sin(a0),
    p0[1] + k * r * Math.cos(a0),
  ];
  const c2: Point = [
    p1[0] + k * r * Math.sin(a1),
    p1[1] - k * r * Math.cos(a1),
  ];
  return curve(p0, c1, c2, p1);
};

/**
 * Semicircular arc whose diameter is the chord between the two centers —
 * GoTree's `arccurve` link (`re`): center = midpoint, radius = half the chord,
 * so it passes through both endpoints. `direction` ("up"|"down") flips which
 * side it bulges. Split into two 90° beziers for accuracy.
 */
const arcRouter: Router = (b0, b1, { opts }) => {
  const c0 = centerPoint(b0);
  const c1 = centerPoint(b1);
  const M: Point = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2];
  const r = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) / 2;
  if (r < 1e-6) return [segment(c0, c1)];
  // Sweep ±π from c0 to c1 (antipodal on the circle). Sign picks the bulge side.
  const sign = opts?.direction === "down" ? -1 : 1;
  const a0 = Math.atan2(c0[1] - M[1], c0[0] - M[0]);
  const sweep = sign * Math.PI;
  const aMid = a0 + sweep / 2;
  const a1 = a0 + sweep;
  return [arcBezier(M, r, a0, aMid), arcBezier(M, r, aMid, a1)];
};

/**
 * Box-to-box arrow arc via the `perfect-arrows` library (the routing that used
 * to be locked inside the `arrow` operator). Returns just the arc path; an
 * arrowhead, if wanted, is a separate decoration.
 */
const perfectArrowsRouter: Router = (b0, b1, { opts }) => {
  const [sx, sy, cx, cy, ex, ey] = getBoxToBoxArrow(
    b0[0].min!,
    b0[1].min!,
    b0[0].size!,
    b0[1].size!,
    b1[0].min!,
    b1[1].min!,
    b1[0].size!,
    b1[1].size!,
    opts
  );
  // perfect-arrows returns a quadratic arc (start, control, end); elevate to a
  // cubic: C1 = P0 + 2/3(C−P0), C2 = P1 + 2/3(C−P1).
  const p0: Point = [sx, sy];
  const p1: Point = [ex, ey];
  const control1: Point = [sx + (2 / 3) * (cx - sx), sy + (2 / 3) * (cy - sy)];
  const control2: Point = [ex + (2 / 3) * (cx - ex), ey + (2 / 3) * (cy - ey)];
  return [curve(p0, control1, control2, p1)];
};

routes.set("linear", linearRouter);
routes.set("bezier", bezierRouter);
routes.set("orthogonal", orthogonalRouter);
routes.set("arc", arcRouter);
routes.set("perfectArrows", perfectArrowsRouter);

// The data-space curves are read over the run's parameter. A smooth one
// threads a run with none with centripetal knots. `step` holds every
// coordinate but the one that draws the parameter, which a run with no
// parameter of its own has none of. The Catmull-Rom is a shape on screen: its
// knots are always centripetal.
sequenceCurves.set("step", {
  thread: (points, { parameterAxis }) => stepPath(points, parameterAxis),
  takesKnots: true,
});
for (const smooth of SMOOTH_CURVES) {
  sequenceCurves.set(smooth, {
    thread: (points, { knots }) =>
      threadPath(points, knots ?? centripetalKnots(points), smooth),
    takesKnots: true,
  });
}
sequenceCurves.set("catmullRom", {
  thread: (points) => catmullRomPath(points).map((seg) => evenStep([seg])),
  takesKnots: false,
});
