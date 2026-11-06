// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * The registrar scope: how a library input finds the chart that reads it —
 * the discovery mechanism behind the reactive surface.
 *
 * The principle: interaction enters the spec wherever a value already goes, so
 * the builder cannot know a chart is interactive by inspecting the chain — a
 * live input read inside `derive()`, or a `live()` channel, surfaces only
 * DURING resolve. Each chart's InteractionRuntime is its REGISTRAR, and it
 * travels with the chart's resolve explicitly: the render terminal hands it to
 * the resolve on its {@link RenderPass}, the resolve puts it on the root
 * `LayerContext`, and every `LayerContext` below it carries it on
 * (`LayerContext.registrar`), across every `await`.
 *
 * The last hop cannot be explicit. A user callback reads an input through a
 * zero-argument accessor (`s()`, `p.datum()`, `t()` inside a `derive`, a
 * `live()` channel, a `createMark` body), so the accessor has no argument to
 * be handed the registrar in. This is the domain's one special case, and it is
 * the pattern Solid uses for its tracked reads (its `Listener`): a dynamic
 * scope. Where GoFish calls into user code, it calls it SYNCHRONOUSLY inside
 * `withRegistrar(context.registrar, fn)`, which sets the scope for that one
 * call and restores it before returning. The scope is set only while such a
 * call is on the stack, so it can never name another chart: JavaScript does
 * not interleave synchronous code, and two charts resolving at once take
 * turns only at `await` points, where no scope is set.
 *
 * The one limit is Solid's: a read after an `await` inside an async user
 * callback is outside the call, so it registers with nothing. GoFish warns
 * once when that happens while such a callback is pending
 * ({@link warnUnscopedRead}; GoFish has no separate development build, so it
 * warns in every build): read the input before the `await`.
 *
 * One rule says where the scope is set: `callMark` scopes the synchronous
 * part of every mark call, and every user callback GoFish calls after an
 * `await` (a channel function, a `derive`, a `.hidden(fn)`, a `createMark`
 * body, an operator's layout function) is wrapped where it is called. A root
 * `LayerContext` built with no registrar of its own takes the one in scope
 * (`scopedRegistrar`): that is how a node operator, which builds when it is
 * called, finds its chart when it is called in a component thunk.
 *
 * GoFish's own resolve-time reads (a `time.sequence`'s clock, read as the
 * first statement of its layout function) are made in that same scope.
 * Paint-time reads (a live slot re-run by Solid, a
 * value read once while lowering) register nothing: a paint is not a resolve.
 *
 * The `inLiveEval` flag distinguishes the two read regimes: a read while a
 * `live()` channel is being evaluated at resolve time wires the input into
 * event dispatch but does NOT mark it a pipeline dependency (paint re-runs it
 * reactively). Any other read during resolve adds the registrar to the reader
 * set of the READABLE it read (one of the input's `specReaders`), so writes to
 * that readable schedule a full re-run of every chart that read it.
 */
import type { InputPrimitive, SpecInvalidator } from "./types";

/** The registration surface library inputs see. It is also a
 *  {@link SpecInvalidator}: a spec-read (outside `live()`) adds THIS registrar
 *  to the read readable's set in `specReaders`, so the input can invalidate every chart
 *  that depends on it — not just the last one attached. The runtime is the
 *  registrar, so `registerInput` and `invalidate` are the same object. */
export interface Registrar extends SpecInvalidator {
  registerInput(input: InputPrimitive): void;
}

/** The registrar of the synchronous user call in progress, if any. Set only by
 *  {@link withRegistrar}, for the length of one synchronous call. */
let scoped: Registrar | undefined;

/** How many async user callbacks called with a registrar have not settled
 *  yet: while any has not, a read with no registrar in scope is likely a read
 *  after an `await` in one of them. For {@link warnUnscopedRead} only. */
let pendingCallbacks = 0;

/**
 * Call `fn`, user code reached from a resolve, with `registrar` as the scope
 * its input reads register with: the registrar of the context the call is
 * made in, or none. Synchronous: the scope ends when `fn` returns, so a
 * promise `fn` returns is not in it (see the module header). Call it at the
 * one place GoFish calls each kind of user code.
 */
export function withRegistrar<T>(
  registrar: Registrar | undefined,
  fn: () => T
): T {
  if (registrar === scoped) return fn();
  const prev = scoped;
  scoped = registrar;
  let out: T;
  try {
    out = fn();
  } finally {
    scoped = prev;
  }
  // An async callback goes on after its first `await`, outside the scope.
  if (registrar !== undefined && isThenable(out)) {
    pendingCallbacks++;
    const settle = () => void pendingCallbacks--;
    out.then(settle, settle);
  }
  return out;
}

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof (v as PromiseLike<unknown> | null)?.then === "function";

/** The registrar of the synchronous user call in progress, if any. A root
 *  `LayerContext` built with no registrar of its own (a node operator called
 *  in a component thunk) takes it from here, and carries it on from then on. */
export const scopedRegistrar = (): Registrar | undefined => scoped;

let warned = false;

/**
 * Warn once when an input is read, outside a `live()` channel, with no
 * registrar in scope while an async user callback that was called with one
 * has not settled: that is what a read after an `await` in an async callback
 * looks like. It registers with nothing, so the chart neither re-runs on it
 * nor wires its events.
 */
export function warnUnscopedRead(): void {
  if (warned || pendingCallbacks === 0 || inLiveEval()) return;
  warned = true;
  console.warn(
    "[gofish] An input was read during a chart's resolve but outside the " +
      "call GoFish made, so the chart will not react to it. This happens " +
      "when an async callback (a derive, a createMark body) reads an input " +
      "after an `await`: read the input before the first `await`."
  );
}

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
