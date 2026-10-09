/**
 * The `Curve` family: how a path runs through its points. It is the value of
 * the `curve` option of `line` and `ribbon`, of `time.transition` and
 * `Animation.tween`, and of `interpolate`'s `method`.
 *
 * `lib.ts` binds this module as `Curve` (`Curve.monotone()`), and
 * `gofish-graphics/curve` exports the same module. Every member is a function
 * call, including the ones that take no options, so no one has to remember
 * which need parentheses. A curve is a plain object, `{ kind, ...params }`,
 * and that object is also its wire form: `kind` names the curve, and the
 * params beside it are passed to it. The kinds and their params are declared
 * once, in gofish-ir's `STRATEGIES` table. The curves themselves are drawn in
 * `ast/graphicalOperators/routers.ts` and `spline.ts`.
 *
 * `linear`, `step`, `monotone` and `smooth` are read over the parameter of the
 * run, from the least to the most smooth, so a transition can read them over
 * time too. `catmullRom` is a shape on screen. `bezier`, `orthogonal`, `arc`
 * and `perfectArrows` route each pair of neighboring points.
 */
import type { Frontend } from "gofish-ir";

/** A curve value: what a `curve` option takes. */
export type Curve = Frontend.CurveIR;

/** The params of the curve of kind `K`: all of its fields but `kind`. */
type Params<K extends Curve["kind"]> = Omit<
  Extract<Curve, { kind: K }>,
  "kind"
>;

/** Straight segments from each point to the next. */
export const linear = (): Curve => ({ kind: "linear" });

/** Hold every value that depends on the ordering field until the next point,
 *  then jump: a staircase when the ordering field is an axis. */
export const step = (): Curve => ({ kind: "step" });

/** Piecewise monotone cubic: between two neighboring points each coordinate
 *  only rises or only falls (d3 `curveMonotoneX`). */
export const monotone = (): Curve => ({ kind: "monotone" });

/** A rounder cubic over the same parameter as `monotone`; it can go a little
 *  past a point, but keeps a run of equal values flat. */
export const smooth = (): Curve => ({ kind: "smooth" });

/** A centripetal Catmull-Rom through the points on screen. */
export const catmullRom = (): Curve => ({ kind: "catmullRom" });

/** Cubic bezier (d3.linkVertical/horizontal convention). */
export const bezier = (): Curve => ({ kind: "bezier" });

/**
 * Right-angle elbow bending at the main-axis midpoint (GoTree orthogonal). The
 * bend axis is the connector's `dir` by default; pass `{ bend: "auto" }` to
 * infer it from the endpoint geometry instead (for layouts with no single
 * declared growth axis, like a diagonal tree cascade).
 */
export const orthogonal = (params: Params<"orthogonal"> = {}): Curve => ({
  kind: "orthogonal",
  ...params,
});

/** Semicircular arc through both endpoints (GoTree arccurve). */
export const arc = (params: Params<"arc"> = {}): Curve => ({
  kind: "arc",
  ...params,
});

/** Box-to-box arrow arc via perfect-arrows (bow/stretch/pad/… options). */
export const perfectArrows = (params: Params<"perfectArrows"> = {}): Curve => ({
  kind: "perfectArrows",
  ...params,
});
