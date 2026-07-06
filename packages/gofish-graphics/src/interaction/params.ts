/**
 * Parameter bindings and interaction scales (M6; Tier 2).
 *
 * A `param` is a signal-backed spec parameter — the WRITABLE third of the
 * manipulability rule (instrument state / params / data). Specs consume it by
 * reading `p.value()` inside a `derive(...)` (or any thunk the builder
 * re-runs at resolve time); an input bound to it through an `iscale` writes
 * it and invalidates the runtime, whose rAF-coalesced scheduler re-resolves
 * and re-renders the chart (the pipeline itself stays signal-free — params
 * are tracked reads at thunk invocation only in the sense that the scheduler
 * re-invokes the thunk).
 *
 * An `iscale` is the interaction analogue of an encoding scale: it maps an
 * input domain (accumulated wheel delta, drag position) onto a parameter
 * range, with clamping and optional integer rounding.
 */
import { createSignal, type Accessor } from "solid-js";
import type { Instrument, SpecInvalidator } from "./types";
import { ambientRegistrar } from "./resolveContext";

export interface Param<T> {
  /** Reactive read (also safe to call non-reactively inside a derive). */
  value: Accessor<T>;
  set: (v: T) => void;
}

export function param<T>(init: T): Param<T> {
  const [value, set] = createSignal(init);
  return { value, set: (v: T) => void set(() => v) };
}

export interface IScaleOptions {
  /** Input domain (e.g. accumulated wheel deltaY). */
  domain: [number, number];
  /** Parameter range the domain maps onto. */
  range: [number, number];
  /** Round the output to an integer (bin counts, item counts). */
  round?: boolean;
}

export interface IScale {
  (input: number): number;
  invert: (output: number) => number;
  domain: [number, number];
}

/** A continuous interaction scale: clamped linear domain → range map. */
export function iscale(options: IScaleOptions): IScale {
  const [d0, d1] = options.domain;
  const [r0, r1] = options.range;
  const fn = ((input: number): number => {
    const t = (Math.min(d1, Math.max(d0, input)) - d0) / (d1 - d0);
    const out = r0 + t * (r1 - r0);
    return options.round ? Math.round(out) : out;
  }) as IScale;
  fn.invert = (output: number): number => {
    const t = (output - r0) / (r1 - r0);
    return d0 + Math.min(1, Math.max(0, t)) * (d1 - d0);
  };
  fn.domain = options.domain;
  return fn;
}

export interface WheelBindOptions extends IScaleOptions {
  /** Multiplier on raw `deltaY` before accumulation (default 1). */
  sensitivity?: number;
}

/**
 * A live numeric spec parameter (the fluent surface's "third value kind":
 * aesthetic | data | LIVE). Call it wherever code runs at resolve time —
 * inside a `derive()`, a mark callback — and the read (a) returns the
 * current value and (b) registers the backing input instrument with the
 * ambient interactive-resolve context, so the chart needs no `.interact()`
 * clause at all. Reads outside resolve (an overlay readout) just read.
 */
export type LiveNumber = (() => number) & {
  set: (v: number) => void;
};

export interface LiveWheelOptions {
  /** Parameter range the wheel maps onto. */
  range: [number, number];
  /** Initial parameter value (default: the range midpoint). */
  initial?: number;
  /** Accumulated-deltaY input domain (default [0, 600]). */
  domain?: [number, number];
  round?: boolean;
  sensitivity?: number;
}

/**
 * wheel({ range, initial }) — a wheel-driven live parameter. Sugar over
 * `param()` + `iscale()` + `wheelBind()` with read-time registration:
 *
 *   const bins = wheel({ range: [3, 40], initial: 12, round: true });
 *   chart(data).flow(derive(() => binRows(bins())), ...)
 */
export function wheel(options: LiveWheelOptions): LiveNumber {
  const domain = options.domain ?? [0, 600];
  const initial = options.initial ?? (options.range[0] + options.range[1]) / 2;
  const p = param(options.round ? Math.round(initial) : initial);
  const instrument = wheelBind(p, {
    domain,
    range: options.range,
    round: options.round,
    sensitivity: options.sensitivity,
  });
  const live = (() => {
    ambientRegistrar()?.register(instrument);
    return p.value();
  }) as LiveNumber;
  live.set = p.set;
  return live;
}

/**
 * wheelBind(param, {domain, range, round}) — a parameter binding: wheel
 * input → interaction scale → param, invalidating the runtime's Tier-2
 * scheduler on change. The accumulated wheel delta is seeded by inverting
 * the scale at the param's current value, so the first tick moves smoothly
 * from the authored initial value.
 */
export function wheelBind(
  p: Param<number>,
  options: WheelBindOptions
): Instrument {
  const scale = iscale(options);
  let accum = scale.invert(p.value());
  let runtime: SpecInvalidator | undefined;

  return {
    attach(rt: SpecInvalidator) {
      runtime = rt;
    },
    onEvent(type, event) {
      if (type !== "wheel") return;
      const we = event as WheelEvent;
      we.preventDefault();
      const [d0, d1] = scale.domain;
      accum = Math.min(
        d1,
        Math.max(d0, accum + we.deltaY * (options.sensitivity ?? 1))
      );
      const next = scale(accum);
      if (next !== p.value()) {
        p.set(next);
        runtime?.invalidate();
      }
    },
  };
}
