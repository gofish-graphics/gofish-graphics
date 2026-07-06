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
