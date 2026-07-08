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
 * input's `specRuntimes` set, so its writes schedule a full re-run of every
 * chart that read it.
 *
 * Caveat: the context is a module variable, so two charts resolving
 * CONCURRENTLY (interleaving at await points, e.g. a Python derive RPC) could
 * cross-register. Registration sites are synchronous spec-evaluation code in
 * practice; a scoped-storage mechanism can replace this if async marks make
 * the race real.
 */
import type { InputPrimitive, SpecInvalidator } from "./types";

/** The registration surface library inputs see. It is also a
 *  {@link SpecInvalidator}: a spec-read (outside `live()`) adds THIS registrar
 *  to the input's `specRuntimes` set, so the input can invalidate every chart
 *  that depends on it — not just the last one attached. The runtime is the
 *  registrar, so `registerInput` and `invalidate` are the same object. */
export interface AmbientRegistrar extends SpecInvalidator {
  registerInput(input: InputPrimitive): void;
}

let current: AmbientRegistrar | undefined;

/** Install `registrar` as the ambient context for the duration of `fn`. */
export async function withInteractiveResolve<T>(
  registrar: AmbientRegistrar,
  fn: () => Promise<T>
): Promise<T> {
  const prev = current;
  current = registrar;
  try {
    return await fn();
  } finally {
    current = prev;
  }
}

/** The active registrar, if a resolve is in progress. */
export const ambientRegistrar = (): AmbientRegistrar | undefined => current;

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
