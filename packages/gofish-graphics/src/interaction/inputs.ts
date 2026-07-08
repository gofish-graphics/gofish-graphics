// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * The reactive input library: pointer, drag, wheel, timer, signal.
 *
 * Each factory returns plain accessor(s) backed by SolidJS signals plus a
 * private {@link InputPrimitive} that the runtime drives. Reading an accessor
 * during resolve registers the input with the ambient context; the READ
 * LOCATION decides the regime (see resolveContext.ts):
 *   - inside a `live()` channel → paint-time reactivity only (no re-run);
 *   - anywhere else during resolve → a pipeline dependency whose writes
 *     schedule a full, rAF-coalesced re-render.
 * Reads outside resolve (an external readout) just read.
 */
import { createSignal } from "solid-js";
import type { InputPrimitive, SvgPoint } from "./types";
import type { InteractionRuntime } from "./runtime";
import { ambientRegistrar, inLiveEval } from "./resolveContext";

/** Build the read-time registration hook shared by every input accessor. */
function makeTrack(input: InputPrimitive): () => void {
  return () => {
    const reg = ambientRegistrar();
    if (!reg) return;
    reg.registerInput(input);
    // A read outside a `live()` channel makes the input a pipeline dependency
    // OF THIS CHART. The registrar is the chart's runtime (a SpecInvalidator),
    // so add it to the input's set — an input read in two charts' specs
    // accumulates both, and a write invalidates both.
    if (!inLiveEval()) input.specRuntimes.add(reg);
  };
}

/** Invalidate every chart that reads `input` in its spec (its `specRuntimes`). */
function invalidateSpecReaders(input: InputPrimitive): void {
  for (const rt of input.specRuntimes) rt.invalidate();
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/* ------------------------------- pointer -------------------------------- */

export interface Pointer {
  /** Pointer position in svg-local px, or undefined when off the chart. */
  pos(): SvgPoint | undefined;
  /** Per-axis data coordinates under the pointer, via frame conversions.
   *  Undefined when the chart has no continuous axis or the pointer is off. */
  dataPos(): { x?: number; y?: number } | undefined;
  /** The datum of the mark under the pointer (hit-test via `data-gf-id`). */
  datum(): unknown;
  /** True while the primary button is down over the chart. */
  down(): boolean;
}

export function pointer(): Pointer {
  const [pos, setPos] = createSignal<SvgPoint | undefined>(undefined);
  const [datum, setDatum] = createSignal<unknown>(undefined);
  const [down, setDown] = createSignal(false);
  let runtime: InteractionRuntime | undefined;

  const input: InputPrimitive = {
    specRuntimes: new Set(),
    events: ["pointermove", "pointerdown", "pointerup", "pointerleave"],
    needsFrame: true,
    attach(rt) {
      runtime = rt;
    },
    onEvent(type, _event, hit, pt) {
      if (type === "pointermove") {
        setPos(pt);
        setDatum(hit?.datum);
      } else if (type === "pointerdown") {
        setDown(true);
        setPos(pt);
        setDatum(hit?.datum);
      } else if (type === "pointerup") {
        setDown(false);
      } else if (type === "pointerleave") {
        setPos(undefined);
        setDatum(undefined);
        // No pointer capture on the plain pointer input, so a button release
        // outside the svg is unobservable — treat leave-while-down as a
        // release, or `down()` would stay stuck true forever after a
        // press → drag-out → release-outside.
        setDown(false);
      } else {
        return;
      }
      invalidateSpecReaders(input);
    },
  };
  const track = makeTrack(input);

  return {
    pos() {
      track();
      return pos();
    },
    datum() {
      track();
      return datum();
    },
    down() {
      track();
      return down();
    },
    dataPos() {
      track();
      return pxToData(runtime, pos());
    },
  };
}

/**
 * Convert an svg-px point to per-axis data coords through the last-attached
 * chart's recorded frame conversions. Each axis is OPTIONAL: a leg exists only
 * where that axis has a continuous position scale, so an ordinal/band axis (or
 * a degenerate zero-size axis, whose leg is dropped rather than throwing) comes
 * back `undefined` for that axis. Returns `undefined` overall only when NO axis
 * converts (or the point is off the chart). Data-space conversions bind to the
 * MOST RECENTLY attached chart — sharing one pointer/drag across charts is a
 * known limitation (plan Open Question 1).
 */
function pxToData(
  runtime: InteractionRuntime | undefined,
  p: SvgPoint | undefined
): { x?: number; y?: number } | undefined {
  if (!p) return undefined;
  const conv = runtime?.getConversions();
  if (!conv) return undefined;
  const x = conv.pxToData[0]?.(p.x);
  const y = conv.pxToData[1]?.(p.y);
  if (x === undefined && y === undefined) return undefined;
  return { x, y };
}

/* -------------------------------- drag ---------------------------------- */

export interface DragOptions {
  /** Where a drag may start. Given the pointer-down position (svg-local px),
   *  return true to begin the drag. Default: anywhere. */
  hitTest?: (pt: SvgPoint) => boolean;
}

export interface Drag {
  /** True while a drag is in progress. */
  active(): boolean;
  /** Pointer-down position (svg-local px), if a drag has started. */
  origin(): SvgPoint | undefined;
  /** Latest pointer position (svg-local px), if a drag has started. */
  current(): SvgPoint | undefined;
  /** current − origin (svg-local px), if a drag has started. */
  delta(): SvgPoint | undefined;
  /** `origin` in per-axis data coordinates (via frame conversions). */
  originData(): { x?: number; y?: number } | undefined;
  /** `current` in per-axis data coordinates. */
  currentData(): { x?: number; y?: number } | undefined;
}

export function drag(options: DragOptions = {}): Drag {
  const [active, setActive] = createSignal(false);
  const [origin, setOrigin] = createSignal<SvgPoint | undefined>(undefined);
  const [current, setCurrent] = createSignal<SvgPoint | undefined>(undefined);
  let runtime: InteractionRuntime | undefined;

  const input: InputPrimitive = {
    specRuntimes: new Set(),
    events: ["pointerdown", "pointermove", "pointerup"],
    needsFrame: true,
    attach(rt) {
      runtime = rt;
    },
    onEvent(type, event, _hit, pt) {
      if (!pt) return;
      if (type === "pointerdown") {
        if (options.hitTest && !options.hitTest(pt)) return;
        setActive(true);
        setOrigin(pt);
        setCurrent(pt);
        // Keep receiving moves outside the svg while the button is held.
        const svg = event.currentTarget as SVGSVGElement | null;
        const pointerId = (event as PointerEvent).pointerId;
        try {
          svg?.setPointerCapture?.(pointerId);
        } catch {
          /* capture is best-effort (e.g. synthetic events in tests) */
        }
        event.preventDefault();
      } else if (type === "pointermove") {
        if (!active()) return;
        setCurrent(pt);
      } else if (type === "pointerup") {
        if (!active()) return;
        setCurrent(pt);
        setActive(false);
      } else {
        return;
      }
      invalidateSpecReaders(input);
    },
  };
  const track = makeTrack(input);

  const toData = (
    p: SvgPoint | undefined
  ): { x?: number; y?: number } | undefined => pxToData(runtime, p);

  return {
    active() {
      track();
      return active();
    },
    origin() {
      track();
      return origin();
    },
    current() {
      track();
      return current();
    },
    delta() {
      track();
      const o = origin();
      const c = current();
      if (!o || !c) return undefined;
      return { x: c.x - o.x, y: c.y - o.y };
    },
    originData() {
      track();
      return toData(origin());
    },
    currentData() {
      track();
      return toData(current());
    },
  };
}

/* -------------------------------- wheel --------------------------------- */

export interface WheelOptions {
  /** Parameter range the wheel maps onto. */
  range: [number, number];
  /** Initial parameter value (default: the range midpoint). */
  initial?: number;
  /** Accumulated-deltaY input domain (default [0, 600]). */
  domain?: [number, number];
  /** Round the output to an integer (bin counts, item counts). */
  round?: boolean;
  /** Multiplier on raw `deltaY` before accumulation (default 1). */
  sensitivity?: number;
}

export interface Wheel {
  (): number;
  set(v: number): void;
}

/**
 * wheel({ range, initial }) — a wheel-driven numeric input. Folds the former
 * param + iscale + wheelBind into one: a clamped linear accumulator over
 * `deltaY`, seeded by inverting the scale at the current value so the first
 * tick moves smoothly from the authored initial.
 */
export function wheel(options: WheelOptions): Wheel {
  const [d0, d1] = options.domain ?? [0, 600];
  const [r0, r1] = options.range;
  const round = options.round ?? false;
  const seed = options.initial ?? (options.range[0] + options.range[1]) / 2;

  const scale = (input: number): number => {
    const t = (clamp(input, d0, d1) - d0) / (d1 - d0);
    const out = r0 + t * (r1 - r0);
    return round ? Math.round(out) : out;
  };
  const invert = (out: number): number => {
    const t = (out - r0) / (r1 - r0);
    return d0 + clamp(t, 0, 1) * (d1 - d0);
  };

  const [value, setValue] = createSignal(round ? Math.round(seed) : seed);
  let accum = invert(value());

  const input: InputPrimitive = {
    specRuntimes: new Set(),
    events: ["wheel"],
    onEvent(type, event) {
      if (type !== "wheel") return;
      const we = event as WheelEvent;
      we.preventDefault();
      accum = clamp(accum + we.deltaY * (options.sensitivity ?? 1), d0, d1);
      const next = scale(accum);
      if (next !== value()) {
        setValue(next);
        invalidateSpecReaders(input);
      }
    },
  };
  const track = makeTrack(input);

  const acc = (() => {
    track();
    return value();
  }) as Wheel;
  acc.set = (v: number) => {
    const nv = round ? Math.round(v) : v;
    accum = invert(nv);
    if (nv !== value()) {
      setValue(nv);
      invalidateSpecReaders(input);
    }
  };
  return acc;
}

/* -------------------------------- timer --------------------------------- */

export interface TimerOptions {
  /** Tick interval in ms (default 16, ~60fps). */
  interval?: number;
}

export interface Timer {
  /** Current tick count. Lazy-starts the timer on first read. */
  (): number;
  stop(): void;
  start(): void;
}

/** timer({ interval }) — an accessor of a monotonic tick count. Lazy-starts on
 *  first read; `.stop()` / `.start()` control it. Read in a `live()` channel it
 *  drives paint-only pulses; read in a `derive()` it re-runs the pipeline per
 *  tick (rAF-coalesced). */
export function timer(options: TimerOptions = {}): Timer {
  const interval = options.interval ?? 16;
  const [tick, setTick] = createSignal(0);
  let handle: ReturnType<typeof setInterval> | undefined;
  let autoStarted = false;

  const input: InputPrimitive = {
    specRuntimes: new Set(),
  };
  const track = makeTrack(input);

  const start = (): void => {
    if (handle !== undefined) return;
    handle = setInterval(() => {
      setTick((t) => t + 1);
      invalidateSpecReaders(input);
    }, interval);
  };
  const stop = (): void => {
    if (handle !== undefined) {
      clearInterval(handle);
      handle = undefined;
    }
  };

  const acc = (() => {
    track();
    // Lazy-start ONCE on the first read; an explicit stop() then stays stopped
    // until an explicit start() (a read must not resurrect a stopped timer).
    if (!autoStarted) {
      autoStarted = true;
      start();
    }
    return tick();
  }) as Timer;
  acc.start = start;
  acc.stop = stop;
  return acc;
}

/* ------------------------------- signal --------------------------------- */

export interface Signal<T> {
  (): T;
  set(v: T): void;
}

/** signal(init) — a gofish-wrapped writable param: an accessor plus `.set(v)`.
 *  Unlike a raw Solid signal, reading it during resolve registers it as a
 *  pipeline dependency, so `.set()` schedules a full re-render (read in a
 *  `live()` channel it patches paint only). */
export function signal<T>(init: T): Signal<T> {
  const [value, setValue] = createSignal<T>(init);

  const input: InputPrimitive = {
    specRuntimes: new Set(),
  };
  const track = makeTrack(input);

  const acc = (() => {
    track();
    return value();
  }) as Signal<T>;
  acc.set = (v: T) => {
    setValue(() => v);
    invalidateSpecReaders(input);
  };
  return acc;
}
