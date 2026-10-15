import type { Box } from "./box";
import type { Geometry } from "./index";

export type Circle = { cx: number; cy: number; r: number };

/** A shape that knows a circle enclosing it. A shape that answers should give
 *  the smallest one it can. */
export interface HasEnclosingCircle {
  readonly enclosingCircle?: () => Circle;
}

/** The smallest circle enclosing a box: centered on the box, with a radius of
 *  half its diagonal. */
export function circleAroundBox(box: Box): Circle {
  const w = box.max[0] - box.min[0];
  const h = box.max[1] - box.min[1];
  return {
    cx: (box.min[0] + box.max[0]) / 2,
    cy: (box.min[1] + box.max[1]) / 2,
    r: Math.hypot(w, h) / 2,
  };
}

/** A geometry's enclosing circle, falling back to the circle around its box. */
export function enclosingCircle(g: Geometry): Circle {
  return g.enclosingCircle?.() ?? circleAroundBox(g.box);
}

/** Move a circle by `[dx, dy]`, e.g. by a child's translate into its parent's
 *  frame. */
export function translateCircle(c: Circle, [dx, dy]: [number, number]): Circle {
  return { cx: c.cx + dx, cy: c.cy + dy, r: c.r };
}
