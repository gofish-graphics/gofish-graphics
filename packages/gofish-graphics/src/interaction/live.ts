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

import { untrack } from "solid-js";
import { runInLiveEval } from "./resolveContext";

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

/**
 * Evaluate a `live()` accessor for its resolve-time static value: untracked (so
 * the input reads inside it wire event dispatch but do NOT become pipeline
 * dependencies) and under the `inLiveEval` flag (so a read is classified as
 * paint-time reactivity, not a spec dependency). The pipeline renders and
 * measures this value; the paint layer re-evaluates the same accessor per frame.
 */
export const evalLiveStatic = (accessor: LiveValue, datum: unknown): unknown =>
  readLive(() => accessor(datum));

/**
 * Read a paint-time value once, at resolve time: untracked and under the
 * `inLiveEval` flag, so the inputs it reads are wired for events but do NOT
 * become pipeline dependencies of the chart.
 *
 * `evalLiveStatic` is this applied to a `live()` channel. A NODE reaches for it
 * directly when the paint-time value is its own rather than a channel the user
 * wrote — `tween` reads the playhead this way, to have a value to lower and to
 * register the clock, while leaving the per-frame reading to the paint tier.
 */
export const readLive = <T>(read: () => T): T =>
  untrack(() => runInLiveEval(read));

/**
 * The `live(...)` channels of an options bag, keyed by channel name — or
 * `undefined` when there are none (the overwhelmingly common case, so callers
 * skip the per-node `__gfLive` stamp on a cheap null check).
 *
 * This is the one place that asks "which of these channels are live?". A mark
 * factory needs the answer at construction time, before any datum exists, so it
 * is separate from evaluating them.
 */
export const liveChannelsOf = (
  opts: Record<string, unknown>
): Record<string, LiveValue> | undefined => {
  let live: Record<string, LiveValue> | undefined;
  for (const channel of Object.keys(opts)) {
    const value = opts[channel];
    if (isLive(value)) (live ??= {})[channel] = value;
  }
  return live;
};

/**
 * An options bag whose `live(...)` channels have been substituted away: no
 * channel can still hold a `LiveValue`. `withLiveStatics` is what produces one,
 * and saying so in the type is what lets its consumers (a connector's `produce`,
 * a leaf mark's channel encoding) read each channel straight through instead of
 * casting the `LiveValue` arm back off one by one.
 */
export type StripLive<O> = { [K in keyof O]: Exclude<O[K], LiveValue> };

/**
 * `opts` with each live channel replaced by its resolve-time value at `datum`.
 * Reading a live channel here is also what REGISTERS its input with the
 * interaction runtime, so this is the single point where that happens for a
 * mark's channels — and the single point where the `LiveValue` arm is discharged
 * from the type.
 */
export const withLiveStatics = <O extends Record<string, unknown>>(
  opts: O,
  live: Record<string, LiveValue> | undefined,
  datum: unknown
): StripLive<O> =>
  (live
    ? {
        ...opts,
        ...Object.fromEntries(
          Object.entries(live).map(([k, v]) => [k, evalLiveStatic(v, datum)])
        ),
      }
    : opts) as StripLive<O>;

/**
 * Split an options bag at one datum: the live channels to stamp on the produced
 * node as paint-time thunks, and the bag the pipeline builds from, with each of
 * those channels replaced by its resolve-time value. The one-shot form of
 * `liveChannelsOf` + `withLiveStatics`, for a factory that has its datum in hand.
 */
export const splitLiveChannels = <O extends Record<string, unknown>>(
  opts: O,
  datum: unknown
): { static: StripLive<O>; live: Record<string, LiveValue> | undefined } => {
  const live = liveChannelsOf(opts);
  return { static: withLiveStatics(opts, live, datum), live };
};
