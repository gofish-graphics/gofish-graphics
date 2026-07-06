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

export interface StateCase {
  pred: StatePredicate;
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
  elseWhen(pred: StatePredicate, value: unknown): StateChannel {
    return new StateChannel([...this.cases, { pred, value }], this.fallback);
  }

  /** Set the static fallback value rendered by the pipeline. */
  else(value: unknown): StateChannel {
    return new StateChannel(this.cases, value);
  }
}

/** `when(pred, value)` starts a conditional channel; chain `.elseWhen`/`.else`. */
export const when = (pred: StatePredicate, value: unknown): StateChannel =>
  new StateChannel([{ pred, value }]);

export const isStateChannel = (v: unknown): v is StateChannel =>
  typeof v === "object" &&
  v !== null &&
  (v as Record<symbol, unknown>)[STATE_BRAND] === true;
