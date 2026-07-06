/**
 * `when(...)` — reactive conditional channel values (Tier-0 states).
 *
 * A mark channel like `fill: when(hov.over, "red").else("#ccc")` renders the
 * `.else` fallback through the ordinary static pipeline (layout never sees a
 * signal), and registers the conditional cases with the interaction runtime,
 * which applies them as paint-time style patches keyed by the display item's
 * node id. This is Meros' `states: [{when, then}]` construct recast as a
 * channel value — no new mark concept.
 */
import type { StatePredicate } from "./types";
import { ambientRegistrar } from "./resolveContext";

/**
 * A selector referenced BY NAME, resolved against the runtime's instrument
 * registry at evaluation time (the fluent surface's answer to hoisting: the
 * instrument is declared in the chain — e.g. `rule().drag("y").name("cut")` —
 * and a channel elsewhere references it as `above("cut", of)`). Names follow
 * the `select("name")` idiom; forward references are fine because resolution
 * is deferred to patch evaluation.
 */
export interface DeferredSelector {
  __gfSelector: {
    name: string;
    kind: "above" | "below" | "inside" | "insideCommitted" | "intersectsX";
    /** Datum → comparable value, for scalar comparisons (above/below). */
    of?: (datum: unknown) => number;
  };
}

export const isDeferredSelector = (v: unknown): v is DeferredSelector =>
  typeof v === "object" &&
  v !== null &&
  "__gfSelector" in (v as Record<string, unknown>);

/** `above("cut", (d) => sumBy(d, "count"))` — true when the datum's value
 *  exceeds the named instrument's scalar value. */
export const above = (
  name: string,
  of: (datum: unknown) => number
): DeferredSelector => ({ __gfSelector: { name, kind: "above", of } });

/** Complement of {@link above}. */
export const below = (
  name: string,
  of: (datum: unknown) => number
): DeferredSelector => ({ __gfSelector: { name, kind: "below", of } });

/** `inside("b")` — the named brush's live interval selector. */
export const inside = (name: string): DeferredSelector => ({
  __gfSelector: { name, kind: "inside" },
});

/** `insideCommitted("b")` — the named brush's onEnd-gated selector. */
export const insideCommitted = (name: string): DeferredSelector => ({
  __gfSelector: { name, kind: "insideCommitted" },
});

/** `intersectsX("b")` — the named brush's geometric x-band selector. */
export const intersectsX = (name: string): DeferredSelector => ({
  __gfSelector: { name, kind: "intersectsX" },
});

export interface StateCase {
  pred: StatePredicate | DeferredSelector;
  /** The channel value when the predicate holds (e.g. a fill color). */
  value: unknown;
}

const STATE_BRAND = Symbol.for("gofish.stateChannel");

export class StateChannel {
  readonly [STATE_BRAND] = true;
  readonly cases: StateCase[];
  /** The static channel value the pipeline renders (field name or literal). */
  readonly fallback: unknown;

  constructor(cases: StateCase[], fallback?: unknown) {
    this.cases = cases;
    this.fallback = fallback;
  }

  /** Add another conditional case (checked in declaration order). */
  elseWhen(
    pred: StatePredicate | DeferredSelector,
    value: unknown
  ): StateChannel {
    return new StateChannel([...this.cases, { pred, value }], this.fallback);
  }

  /** Set the static fallback value rendered by the pipeline. */
  else(value: unknown): StateChannel {
    return new StateChannel(this.cases, value);
  }
}

/** `when(pred, value)` starts a conditional channel; chain `.elseWhen`/`.else`.
 *  `pred` may be a live predicate (an instrument's selector, which
 *  auto-registers its instrument when the channel is unwrapped during
 *  resolve) or a name-deferred selector like `above("cut", of)`. */
export const when = (
  pred: StatePredicate | DeferredSelector,
  value: unknown
): StateChannel => new StateChannel([{ pred, value }]);

export const isStateChannel = (v: unknown): v is StateChannel =>
  typeof v === "object" &&
  v !== null &&
  (v as Record<symbol, unknown>)[STATE_BRAND] === true;

/**
 * Called at the channel-unwrap points (createMark's channel loop, circle):
 * a `when(...)` case whose predicate is an instrument's tagged selector
 * registers that instrument with the ambient interactive-resolve context —
 * the fluent surface's replacement for passing instruments to `.interact()`.
 * Deferred (name-based) selectors register nothing; the named instrument is
 * declared elsewhere in the chain.
 */
export const registerStateChannelInstruments = (sc: StateChannel): void => {
  const registrar = ambientRegistrar();
  if (!registrar) return;
  for (const c of sc.cases) {
    const inst = (c.pred as { __gfInstrument?: object }).__gfInstrument;
    if (inst) registrar.register(inst);
  }
};
