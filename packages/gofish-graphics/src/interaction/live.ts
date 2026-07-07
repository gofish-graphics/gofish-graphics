// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * live() — a reactive channel value (the third value kind: aesthetic literal |
 * data accessor | live). An ordinary accessor callback `(d) => v` is evaluated
 * ONCE at resolve (it feeds measure/scale inference); a `live((d) => v)`
 * callback is ALSO evaluated once at resolve for that static value, but the
 * wrapper marks it so the paint layer RE-evaluates it reactively per frame:
 *
 *   rect({ h: "count", fill: live((d) => (d === p.datum() ? "red" : "gray")) })
 *
 * The callback receives the mark's datum, like any accessor. When it reads a
 * library input (pointer, signal, timer, …), the paint-time re-evaluation
 * happens inside a Solid JSX attribute accessor, so Solid tracks the read and
 * patches only that attribute — zero pipeline re-runs. The layout caveat is
 * inherent: the mark's box is measured at resolve, so live text should not
 * grow past its measured room.
 *
 * v1 contract: a live COLOR must return a literal color (it bypasses the
 * resolve-time color scale). See the plan's "Design notes".
 */

const LIVE_BRAND = Symbol.for("gofish.liveValue");

export interface LiveValue {
  (datum?: unknown): unknown;
  [LIVE_BRAND]: true;
}

export function live(accessor: (datum?: unknown) => unknown): LiveValue {
  const fn = accessor as LiveValue;
  fn[LIVE_BRAND] = true;
  return fn;
}

export const isLive = (v: unknown): v is LiveValue =>
  typeof v === "function" &&
  (v as unknown as Record<symbol, unknown>)[LIVE_BRAND] === true;
