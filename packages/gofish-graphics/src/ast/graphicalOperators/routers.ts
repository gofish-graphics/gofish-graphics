/**
 * Curve registry — pluggable path-shaping algorithms for the `line`/`ribbon`
 * mark (and any connector). The public `curve` option resolves (via
 * `resolveCurve`) to a *router*: a function that shapes the stroke between two
 * already-resolved endpoints (their bboxes). All of these are screen-space and
 * pure geometry of the resolved point sequence — the data-space cousin
 * (statistical smoothing: loess/regression) is a separate `derive` operator
 * (see issue #635), not a curve.
 *
 * Built-ins below are the *routing* curves (straight / bezier / orthogonal /
 * arc — the GoTree link styles, Li et al. CHI 2020 — plus perfect-arrows), each
 * pairwise. Sequence curves that thread the whole point run (catmullRom /
 * monotone / step) are added in a later stage.
 *
 * Register a new router with `registerRoute(name, fn)`; look one up with
 * `getRoute(name)`.
 */
import {
  type Path,
  type Point,
  type BezierCurve,
  segment,
  curve,
} from "../../path";
import type { Dimensions } from "../dims";
import type { CoordinateTransform } from "../coordinateTransforms/coord";
import { getBoxToBoxArrow } from "perfect-arrows";

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
 * A serializable curve value, produced by a curve factory (`straight()`,
 * `bezier()`, `orthogonal()`, `arc({ direction: "down" })`, …) — the same
 * builder-object idiom GoFish uses for coordinate spaces, axes, and labels.
 * `type` names a registered router; `options` are forwarded to it. A bare
 * string is accepted as shorthand for an option-less curve (`"straight"`).
 *
 * `curve` is the single screen-space path-shaping key on `line`/`ribbon` — it
 * holds both interpolating curves that thread the point sequence (straight,
 * bezier, catmullRom, …) and routing curves that shape the stroke between two
 * anchors (orthogonal, arc, perfectArrows). A curve resolves to a `Router`.
 */
export type CurveSpec = { type: string; options?: Record<string, any> };
export type Curve = string | CurveSpec;

type RouteEntry = {
  fn: Router;
  /** Whether this route is valid for the filled `ribbon` (edge) mode. */
  ribbon: boolean;
};

const registry = new Map<string, RouteEntry>();

export function registerRoute(
  name: string,
  fn: Router,
  opts?: { ribbon?: boolean }
): void {
  registry.set(name, { fn, ribbon: opts?.ribbon ?? false });
}

export function getRoute(name: string): Router {
  const entry = registry.get(name);
  if (!entry) {
    throw new Error(
      `connect: unknown route "${name}". Registered routes: ${[
        ...registry.keys(),
      ].join(", ")}.`
    );
  }
  return entry.fn;
}

export function hasRoute(name: string): boolean {
  return registry.has(name);
}

/** Resolve a `Curve` (string or spec) to its router fn + options. */
export function resolveCurve(curve: Curve): {
  router: Router;
  options?: Record<string, any>;
} {
  if (typeof curve === "string") return { router: getRoute(curve) };
  return { router: getRoute(curve.type), options: curve.options };
}

// --- geometry helpers -------------------------------------------------------

const center = (b: Dimensions, axis: 0 | 1): number =>
  (b[axis].min! + b[axis].max!) / 2;

const centerPoint = (b: Dimensions): Point => [center(b, 0), center(b, 1)];

/** Build a point from a main-axis and cross-axis coordinate. */
const byAxis = (dir: 0 | 1, mainVal: number, crossVal: number): Point => {
  const p: [number, number] = [0, 0];
  p[dir] = mainVal;
  p[1 - dir] = crossVal;
  return p;
};

// --- built-in routers -------------------------------------------------------

/** Straight center-to-center line (≡ the old `linear` center mode). */
const straightRouter: Router = (b0, b1) => [
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
const orthogonalRouter: Router = (b0, b1, { dir }) => {
  const c0 = centerPoint(b0);
  const c1 = centerPoint(b1);
  const mid = (c0[dir] + c1[dir]) / 2;
  const bend0 = byAxis(dir, mid, c0[1 - dir]);
  const bend1 = byAxis(dir, mid, c1[1 - dir]);
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

registerRoute("straight", straightRouter, { ribbon: false });
registerRoute("bezier", bezierRouter, { ribbon: false });
registerRoute("orthogonal", orthogonalRouter, { ribbon: false });
registerRoute("arc", arcRouter, { ribbon: false });
registerRoute("perfectArrows", perfectArrowsRouter, { ribbon: false });

// --- curve factories --------------------------------------------------------
// Builder-object idiom (like `polar({…})` / axis / label specs): each returns a
// serializable `CurveSpec` carrying its own options, so call sites read
// `line({ curve: orthogonal() })`, `line({ curve: arc({ direction: "down" }) })`.

/** Straight center-to-center line. */
export const straight = (): CurveSpec => ({ type: "straight" });

/** Cubic bezier (d3.linkVertical/horizontal convention). */
export const bezier = (): CurveSpec => ({ type: "bezier" });

/** Right-angle elbow bending at the main-axis midpoint (GoTree orthogonal). */
export const orthogonal = (): CurveSpec => ({ type: "orthogonal" });

/** Semicircular arc through both endpoints (GoTree arccurve). */
export const arc = (options?: { direction?: "up" | "down" }): CurveSpec => ({
  type: "arc",
  ...(options ? { options } : {}),
});

/** Box-to-box arrow arc via perfect-arrows (bow/stretch/pad/… options). */
export const perfectArrows = (options?: Record<string, any>): CurveSpec => ({
  type: "perfectArrows",
  ...(options ? { options } : {}),
});
