/**
 * The `Curve` family: how a path runs through its points. It is the value of
 * the `curve` option of `line` and `ribbon`, of `time.transition` and
 * `Animation.tween`, and of `interpolate`'s `method`.
 *
 * `lib.ts` binds this module as `Curve` (`Curve.monotone`), and
 * `gofish-graphics/curve` exports the same module. No curve has a required
 * option, so each is a value as it is, and calling it sets options:
 * `Curve.monotone` is `Curve.monotone()`, and `Curve.arc({ direction: "down" })`
 * sets the arc's direction (#1133, `ast/strategyKind.ts`). A curve is a plain
 * object, `{ kind, ...params }`,
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
import { bareKind } from "../ast/strategyKind";

/** A curve value: what a `curve` option takes. */
export type Curve = Frontend.CurveIR;

/** The curve of kind `K`. */
type Kind<K extends Curve["kind"]> = Extract<Curve, { kind: K }>;

/** The params of the curve of kind `K`: all of its fields but `kind`. */
type Params<K extends Curve["kind"]> = Omit<Kind<K>, "kind">;

/** Straight segments from each point to the next. */
export const linear = bareKind(
  "Curve.linear",
  (): Kind<"linear"> => ({ kind: "linear" })
);

/** Hold every value that depends on the ordering field until the next point,
 *  then jump: a staircase when the ordering field is an axis. */
export const step = bareKind(
  "Curve.step",
  (): Kind<"step"> => ({ kind: "step" })
);

/** Piecewise monotone cubic: between two neighboring points each coordinate
 *  only rises or only falls (d3 `curveMonotoneX`). */
export const monotone = bareKind(
  "Curve.monotone",
  (): Kind<"monotone"> => ({ kind: "monotone" })
);

/** A rounder cubic over the same parameter as `monotone`; it can go a little
 *  past a point, but keeps a run of equal values flat. */
export const smooth = bareKind(
  "Curve.smooth",
  (): Kind<"smooth"> => ({ kind: "smooth" })
);

/** A centripetal Catmull-Rom through the points on screen. */
export const catmullRom = bareKind(
  "Curve.catmullRom",
  (): Kind<"catmullRom"> => ({ kind: "catmullRom" })
);

/** Cubic bezier (d3.linkVertical/horizontal convention). */
export const bezier = bareKind(
  "Curve.bezier",
  (): Kind<"bezier"> => ({ kind: "bezier" })
);

/**
 * Right-angle elbow bending at the main-axis midpoint (GoTree orthogonal). The
 * bend axis is the connector's `dir` by default; pass `{ bend: "auto" }` to
 * infer it from the endpoint geometry instead (for layouts with no single
 * declared growth axis, like a diagonal tree cascade).
 */
export const orthogonal = bareKind(
  "Curve.orthogonal",
  (params: Params<"orthogonal"> = {}): Kind<"orthogonal"> => ({
    kind: "orthogonal",
    ...params,
  })
);

/** Semicircular arc through both endpoints (GoTree arccurve). */
export const arc = bareKind(
  "Curve.arc",
  (params: Params<"arc"> = {}): Kind<"arc"> => ({
    kind: "arc",
    ...params,
  })
);

/** Box-to-box arrow arc via perfect-arrows (bow/stretch/pad/… options). */
export const perfectArrows = bareKind(
  "Curve.perfectArrows",
  (params: Params<"perfectArrows"> = {}): Kind<"perfectArrows"> => ({
    kind: "perfectArrows",
    ...params,
  })
);
