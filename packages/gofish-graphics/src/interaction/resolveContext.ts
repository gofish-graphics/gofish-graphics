// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * The interactive-resolve context: the discovery mechanism behind the
 * reactive surface.
 *
 * The principle: interaction enters the spec wherever a value already goes, so
 * the builder cannot know a chart is interactive by inspecting the chain. A
 * live input read inside `derive()`, or a `live()` channel, surfaces only
 * DURING resolve. The render terminal therefore makes the chart's
 * InteractionRuntime the registrar for the length of its resolve; library
 * inputs register themselves on read (the same shape as Solid's tracked
 * reads). If nothing registered, the chart renders down the static path
 * untouched.
 *
 * The `inLiveEval` flag distinguishes the two read regimes: a read while a
 * `live()` channel is being evaluated at resolve time wires the input into
 * event dispatch but does NOT mark it a pipeline dependency (paint re-runs it
 * reactively). Any other read during resolve adds the registrar to the reader
 * set of the READABLE it read (one of the input's `specReaders`), so writes to
 * that readable schedule a full re-run of every chart that read it.
 *
 * ONE RESOLVE AT A TIME (#1191). A read finds its registrar through this
 * module, because the code that reads (a user's accessor, a `derive`
 * callback) is handed no context. JavaScript in the browser has no way to
 * carry a value across `await` (the TC39 AsyncContext proposal is not
 * shipped), so a module variable is only correct if no other chart's resolve
 * runs while it is set. `renderExclusive` makes that true: every interactive
 * render on the page waits for the one before it, so between the first and
 * the last await of a resolve, no other resolve's code runs. The registrar is
 * also never handed to a read made inside a reactive computation
 * (`getListener() !== null`): that is paint, which runs on its own schedule
 * (a clock tick, a pointer move) and belongs to the chart that painted it,
 * whose resolve already registered the input. A resolve itself runs untracked.
 *
 * DECLARED SHORTCUT: the queue is page-wide, so a resolve that waits on
 * something slow (a Python callback during a kernel round trip) makes every
 * other chart's render wait too, and a read made by plain (non-reactive) code
 * in a macrotask during that wait, such as a widget's event handler, still
 * registers with the waiting chart. The right fix is AsyncContext, scoping
 * the registrar to the resolve's own async continuation, once browsers ship it.
 */
import { getListener, untrack } from "solid-js";
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

/** The tail of the page-wide render queue. */
let queue: Promise<unknown> = Promise.resolve();
const settled = (): void => undefined;

/**
 * Run `fn` (one interactive render: its resolve and its paint) after every
 * render queued before it has finished, so no two resolves interleave. A
 * render that fails does not block the ones behind it.
 */
export function renderExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.then(settled, settled);
  return result;
}

/**
 * Make `registrar` the registrar for the duration of `fn`, a resolve. Call it
 * inside {@link renderExclusive}, which is what makes the module-level
 * registrar this resolve's alone. `fn` starts untracked, so a render started
 * from inside a reactive computation still resolves as a resolve.
 */
export async function withInteractiveResolve<T>(
  registrar: AmbientRegistrar,
  fn: () => Promise<T>
): Promise<T> {
  current = registrar;
  try {
    return await untrack(fn);
  } finally {
    current = undefined;
  }
}

/** The registrar of the resolve in progress, if any. A read inside a reactive
 *  computation is paint, never a resolve's read, so it gets none. */
export const ambientRegistrar = (): AmbientRegistrar | undefined =>
  getListener() === null ? current : undefined;

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
