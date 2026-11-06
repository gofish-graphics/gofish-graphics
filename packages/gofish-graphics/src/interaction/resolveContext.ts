// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * Ambient interactive-resolve context — the discovery mechanism behind the
 * reactive surface.
 *
 * The principle: interaction enters the spec wherever a value already goes, so
 * the builder cannot know a chart is interactive by inspecting the chain — a
 * live input read inside `derive()`, or a `live()` channel, surfaces only
 * DURING resolve. The render terminal therefore installs the chart's
 * InteractionRuntime as an ambient context around resolve; library inputs
 * register themselves on read (the same shape as Solid's tracked reads). If
 * nothing registered, the chart renders down the static path untouched.
 *
 * The `inLiveEval` flag distinguishes the two read regimes: a read while a
 * `live()` channel is being evaluated at resolve time wires the input into
 * event dispatch but does NOT mark it a pipeline dependency (paint re-runs it
 * reactively). Any other read during resolve adds the ambient runtime to the
 * reader set of the READABLE it read (one of the input's `specReaders`), so
 * writes to that readable schedule a full re-run of every chart that read it.
 *
 * The context is a module variable, so it is right only while one resolve
 * runs at a time: two charts resolving CONCURRENTLY (a page that renders
 * several at once, interleaving at await points) would register each other's
 * inputs. So resolves take turns: `withInteractiveResolve` queues each one
 * behind the resolve before it, and the registrar a read sees is always the
 * chart resolving. Only the resolve waits its turn; layout and paint run
 * outside the queue.
 *
 * A chart's lowering and paint can still run while another chart resolves,
 * and a read there (a paint-time value read once to have something to lower,
 * or a `live()` channel re-run by Solid) is not part of that resolve. Both run
 * under the chart's Solid root, and a resolve never does (it runs from a
 * promise callback), so a read with a Solid owner has no registrar.
 */
import { getOwner } from "solid-js";
import type { InputPrimitive, SpecInvalidator } from "./types";

/** The registration surface library inputs see. It is also a
 *  {@link SpecInvalidator}: a spec-read (outside `live()`) adds THIS registrar
 *  to the read readable's set in `specReaders`, so the input can invalidate every chart
 *  that depends on it — not just the last one attached. The runtime is the
 *  registrar, so `registerInput` and `invalidate` are the same object. */
export interface AmbientRegistrar extends SpecInvalidator {
  registerInput(input: InputPrimitive): void;
}

let current: AmbientRegistrar | undefined;

/** The last resolve queued: the next one starts after it. */
let turn: Promise<unknown> = Promise.resolve();

/** Install `registrar` as the ambient context for the duration of `fn`, once
 *  every resolve queued before it has finished. */
export function withInteractiveResolve<T>(
  registrar: AmbientRegistrar,
  fn: () => Promise<T>
): Promise<T> {
  const run = async (): Promise<T> => {
    current = registrar;
    try {
      return await fn();
    } finally {
      current = undefined;
    }
  };
  const result = turn.then(run, run);
  turn = result.catch(() => undefined);
  return result;
}

/** The registrar of the resolve in progress, if this read is part of it: a
 *  read under a Solid owner is a chart's lowering or paint, not a resolve. */
export const ambientRegistrar = (): AmbientRegistrar | undefined =>
  getOwner() === null ? current : undefined;

let liveEvalDepth = 0;

/** True while a `live()` channel is being evaluated at resolve time. */
export const inLiveEval = (): boolean => liveEvalDepth > 0;

/** Run `fn` with the `inLiveEval` flag set — the resolve-time evaluation of a
 *  `live()` channel, whose reads wire events but never become pipeline deps. */
export function runInLiveEval<T>(fn: () => T): T {
  liveEvalDepth++;
  try {
    return fn();
  } finally {
    liveEvalDepth--;
  }
}
