// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * The reactive input library: pointer, drag, click, wheel, timer, signal.
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
import { createSignal, untrack } from "solid-js";
import type { Hit, InputPrimitive, SvgBox, SvgPoint } from "./types";
import type { InteractionRuntime } from "./runtime";
import { ambientRegistrar, inLiveEval } from "./resolveContext";
import { clamp } from "../util";

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

/**
 * The frame-state read every attached input can serve. It is not drag state and
 * not pointer state: it is where LAYOUT put a node, recorded per node uid when
 * the chart published its frame — so it is declared once here and mixed into
 * `Pointer`, `Drag` and `Click` alike.
 */
export interface FrameBoxReader {
  /**
   * The on-screen box (svg-local px) of the node with uid `id`, read off the
   * frame the chart last published — the geometric counterpart of
   * `drag().currentData()`: both read off the frame, neither re-derives anything.
   *
   * This is what lets a control map a pointer position onto its OWN geometry
   * without knowing where the surrounding operators put it: the widget knows the
   * uids of the nodes it built, and the frame knows where they landed.
   * `undefined` when that node is not in the current frame, when its primitive
   * carries no box (a `text` or `path` item), or when the input is not attached
   * to a chart yet.
   *
   * Reading it registers the input, like any accessor here, but the box ITSELF is
   * not a signal — it is frame state, replaced wholesale by each render. So a new
   * box does not by itself wake anything: read it from an effect that a pointer
   * or drag signal already woke.
   */
  nodeBox(id: string): SvgBox | undefined;
}

/** The one implementation of {@link FrameBoxReader}, for mixing into an input's
 *  accessor object. */
const frameBoxReader = (
  track: () => void,
  getRuntime: () => InteractionRuntime | undefined
): FrameBoxReader => ({
  nodeBox(id) {
    track();
    return getRuntime()?.nodeBox(id);
  },
});

/* ------------------------------- pointer -------------------------------- */

export interface Pointer extends FrameBoxReader {
  /** Pointer position in svg-local px, or undefined when off the chart. */
  pos(): SvgPoint | undefined;
  /** Per-axis data coordinates under the pointer, via frame conversions.
   *  Undefined when the chart has no continuous axis or the pointer is off. */
  dataPos(): { x?: number; y?: number } | undefined;
  /** The datum of the mark under the pointer (hit-test via `data-gf-id`). */
  datum(): unknown;
  /** True while the primary button is down over the chart. (Naming convention:
   *  verbs mutate, `isX` reads a boolean.) */
  isDown(): boolean;
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
    isDown() {
      track();
      return down();
    },
    dataPos() {
      track();
      return pxToData(runtime, pos());
    },
    ...frameBoxReader(track, () => runtime),
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
  /** Where a drag may start. Given the pointer-down position (svg-local px) and
   *  the display item under it (the same hit `pointer().datum()` reads, or
   *  `undefined` off any mark), return true to begin the drag. Default:
   *  anywhere.
   *
   *  The `hit` leg is what lets a handle-shaped control claim its own drags: a
   *  widget knows the uids of the nodes it just built, so matching `hit.id`
   *  against them (see `control` in widgets.ts) starts a drag on the handle and
   *  nowhere else — no geometry arithmetic, and correct under any layout the
   *  surrounding operators choose. */
  hitTest?: (pt: SvgPoint, hit: Hit | undefined) => boolean;
}

export interface Drag extends FrameBoxReader {
  /** True while a drag is in progress. */
  isActive(): boolean;
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
    onEvent(type, event, hit, pt) {
      if (!pt) return;
      if (type === "pointerdown") {
        if (options.hitTest && !options.hitTest(pt, hit)) return;
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
    isActive() {
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
    ...frameBoxReader(track, () => runtime),
  };
}

/* -------------------------------- click --------------------------------- */

export interface ClickOptions {
  /** Which targets count. Given the pointer-DOWN position and the hit under it,
   *  return true to arm a click there. Default: any mark. */
  hitTest?: (pt: SvgPoint, hit: Hit | undefined) => boolean;
}

export interface Click extends FrameBoxReader {
  /** How many clicks have committed so far — enough to drive a button ("fire
   *  when the count grows"). */
  count(): number;
  /** True between a press that armed a click and its release — "held down on
   *  the target", which is what a control paints its pressed state from. */
  isArmed(): boolean;
}

/**
 * `click()` — a press input: how many clicks have committed, plus whether one is
 * armed right now.
 *
 * A click is not a pointer state, so neither `pointer()` nor `drag()` expresses
 * it: it is the PAIR down-then-up on the SAME target. That pairing is the whole
 * content of this input — pointerdown arms it (recording the hit), pointerup
 * commits only if the release is over the same node, and a pointerleave disarms.
 *
 * It counts rather than accumulating a table of click rows. Treating an input as
 * a DATASET (so a click history could itself be charted) is a real design, and it
 * is tracked as issue #830 rather than guessed at here.
 */
export function click(options: ClickOptions = {}): Click {
  const [count, setCount] = createSignal(0);
  // The armed press: the hit a pointerdown accepted, awaiting its release. Kept
  // as a signal so a control can paint itself pressed (`isArmed`).
  const [armed, setArmed] = createSignal<Hit | undefined>(undefined);
  let runtime: InteractionRuntime | undefined;

  const input: InputPrimitive = {
    specRuntimes: new Set(),
    events: ["pointerdown", "pointerup", "pointerleave"],
    needsFrame: true,
    attach(rt) {
      runtime = rt;
    },
    onEvent(type, _event, hit, pt) {
      if (type === "pointerleave") {
        if (armed() !== undefined) {
          setArmed(undefined);
          invalidateSpecReaders(input);
        }
        return;
      }
      if (!pt) return;
      if (type === "pointerdown") {
        const next =
          hit !== undefined && (!options.hitTest || options.hitTest(pt, hit))
            ? hit
            : undefined;
        // Only an actual transition is a change worth re-running specs for: a
        // press that lands off this control's targets leaves `armed` undefined,
        // exactly as it was, and must not re-run every spec reading `isArmed()`
        // (the pointerleave branch above has always worked this way).
        if (next !== armed()) {
          setArmed(next);
          invalidateSpecReaders(input);
        }
        return;
      }
      if (type !== "pointerup") return;
      // Commit only when the release passes the SAME acceptance test the press
      // did. Default: the same node ("a click is on one target"). With a
      // `hitTest`, that test — so a two-part control (a box plus its caption,
      // each its own node) reads as one target, and pressing the box and
      // releasing a pixel later on the glyph is still one click.
      const press = armed();
      const accepted =
        press !== undefined &&
        hit !== undefined &&
        (options.hitTest ? options.hitTest(pt, hit) : hit.id === press.id);
      if (!accepted) {
        if (press !== undefined) {
          setArmed(undefined);
          invalidateSpecReaders(input);
        }
        return;
      }
      setArmed(undefined);
      setCount((prev) => prev + 1);
      invalidateSpecReaders(input);
    },
  };
  const track = makeTrack(input);

  return {
    count() {
      track();
      return count();
    },
    isArmed() {
      track();
      return armed() !== undefined;
    },
    ...frameBoxReader(track, () => runtime),
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

/** A band domain: the ordered values a timer steps through (Observable's
 *  Scrubber shape, and the Animated Vega-Lite default time scale). */
export type TimerValues<T> = readonly T[];

export interface TimerOptions<T = number> {
  /**
   * The domain the clock is read BACKWARD into:
   *   - `[lo, hi]` (exactly two numbers) — a continuous domain; the emitted
   *     value sweeps `lo → hi` over `duration`. Without `step`, `lo` and `hi`
   *     are the SAME instant of a looping sweep (as they are for an angle), so
   *     `hi` is approached at the instant before the wrap and never emitted
   *     exactly; with `step` the domain is quantized and every slot, `hi`
   *     included, gets an equal share of the loop.
   *   - any other array — a BAND over those values; the emitted value is
   *     `values[i]`, one band per value.
   *   - omitted — `[0, duration]`, so a plain elapsed-milliseconds timer is
   *     the degenerate case.
   *
   * The two forms collide for a two-element numeric array (`[1, 2]` reads as
   * continuous, never as a two-value band). The ambiguity is inherent to
   * spelling both domains as arrays, as scale APIs do; a two-value band is
   * spellable as a continuous domain with `step: 1`.
   */
  domain?: readonly [number, number] | TimerValues<T>;
  /** Wall-clock milliseconds one sweep of the domain takes. Default 5000. */
  duration?: number;
  /** Quantize a CONTINUOUS domain to `lo + k*step` (floor). Ignored for a band
   *  domain, whose values are already discrete. */
  step?: number;
  /** Wrap elapsed at `duration` (default true). When false the clock clamps at
   *  the end of the domain and pauses itself. */
  loop?: boolean;
  /** Start playing (default true). `false` starts paused at the domain's start
   *  until `.play()` runs (a read does not start a paused clock). */
  playing?: boolean;
}

export interface Timer<T = number> {
  /** The domain value at the current elapsed time — `invert(elapsed)`, not
   *  milliseconds (unless the domain IS milliseconds). Lazy-starts the clock on
   *  first read unless `playing: false` was passed. */
  (): T;
  /** Seek, in DOMAIN units: `elapsed := scale(v)`. Does NOT change whether the
   *  clock is playing — a scrub widget decides that itself. */
  set(v: T): void;
  play(): void;
  pause(): void;
  /** Reactive readable: true while the clock is running. */
  isPlaying(): boolean;
  /** The resolved domain: `[lo, hi]`, or the values array. */
  readonly domain: readonly [number, number] | TimerValues<T>;
  /** The resolved `step`, if any. */
  readonly step: number | undefined;
}

/**
 * How often a running clock is sampled, in ms (~60fps). Elapsed time is measured
 * from `performance.now()` deltas, NOT by counting ticks, so this only decides
 * the sampling rate — it never makes the clock drift. Not an option: a coarser
 * rate is expressible as a coarser `step` (which is also what stops a sample
 * landing on the same domain value from writing anything).
 */
const SAMPLE_MS = 16;

/** True for a two-number `[lo, hi]` pair (a continuous domain). */
const isContinuousDomain = (
  d: readonly unknown[]
): d is readonly [number, number] =>
  d.length === 2 && typeof d[0] === "number" && typeof d[1] === "number";

/**
 * `timer(options?)` — a SCALE from a data domain onto wall-clock time, read
 * backward: `t() = scale(domain → [0, duration]).invert(elapsed)`, so what it
 * hands you is a value of your data (a day, a year, a category), not a count of
 * ticks, and `.set(v)` is the same scale forward. See the "timer as a scale"
 * section of /internals/frontend/reactivity for the model and the regimes.
 */
export function timer<T = number>(options: TimerOptions<T> = {}): Timer<T> {
  const duration = options.duration ?? 5000;
  const loop = options.loop ?? true;
  const rawDomain = options.domain ?? ([0, duration] as const);
  const values: TimerValues<T> | undefined = isContinuousDomain(rawDomain)
    ? undefined
    : (rawDomain as TimerValues<T>);
  const [lo, hi] = values ? [0, 0] : (rawDomain as readonly [number, number]);
  const step = values ? undefined : options.step;

  /**
   * How many DISCRETE values one loop covers, for a quantized domain (a band's
   * values, or `[lo, hi]` cut by `step`); `undefined` for a continuous one.
   *
   * It is the whole of the band/step mapping: slot `k` owns
   * `[k·duration/N, (k+1)·duration/N)` of the loop, so the N slots tile the
   * period evenly and the LAST one — `hi`, or the last band value — is emitted
   * like any other. (Spreading the slots over `[lo, hi]` instead, as this used
   * to, gives the last slot zero width under a loop: `elapsed` folds to
   * `[0, duration)`, so `hi` was never reached and `set(hi)` read back as `lo`.)
   */
  const slots: number | undefined = values
    ? values.length
    : step !== undefined && step > 0
      ? Math.floor((hi - lo) / step + 1e-9) + 1
      : undefined;

  /** invert: elapsed ms → domain value. */
  const invert = (e: number): T => {
    const frac = duration > 0 ? clamp(e / duration, 0, 1) : 0;
    if (slots !== undefined) {
      if (slots <= 0) return undefined as unknown as T;
      // The epsilon keeps `set(v)` → read an exact round trip: without it
      // floating-point error turns slot 3 into 2.999… and the floor loses a
      // step.
      const i = clamp(Math.floor(frac * slots + 1e-9), 0, slots - 1);
      return values ? values[i] : ((lo + i * step!) as unknown as T);
    }
    return (lo + frac * (hi - lo)) as unknown as T;
  };

  /** scale: domain value → elapsed ms (the forward direction, for `.set`).
   *  A quantized value seeks to the START of its slot, which is what makes
   *  `set(v)` then a read give back exactly `v` for every value in the
   *  domain — `hi` included. */
  const scale = (v: T): number => {
    if (slots !== undefined) {
      if (slots <= 0) return 0;
      // An unknown band value seeks to the start rather than throwing: the only
      // realistic caller is a widget writing back a value it read. A continuous
      // quantized value floors to its slot, so a value between slots reads back
      // as the slot below it (the same floor `invert` applies).
      const raw = values
        ? values.indexOf(v)
        : Math.floor(((v as unknown as number) - lo) / step! + 1e-9);
      const i = clamp(raw, 0, slots - 1);
      return (i / slots) * duration;
    }
    if (hi === lo) return 0;
    return clamp(
      (((v as unknown as number) - lo) / (hi - lo)) * duration,
      0,
      duration
    );
  };

  // Elapsed bookkeeping: `base` is elapsed as of the last pause/seek, `since`
  // the performance.now() reading when the clock last started running.
  const now = (): number =>
    typeof performance !== "undefined" ? performance.now() : Date.now();
  let base = 0;
  let since = 0;

  // "Is the clock running" is ONE piece of state: the `playing` signal (below).
  // `running` used to shadow it as a plain boolean, which meant two things to
  // keep in step. The internal reads go through `untrack` because they happen
  // inside the pipeline (the lazy start on first read) and must not make the
  // clock's own play state a dependency of the spec that read the value.
  const isRunning = (): boolean => untrack(playing);

  /** Write the play state, invalidating the specs that read it — and only on an
   *  actual transition. `isPlaying()` is a readable like any other here, so a
   *  bare `play()`/`pause()` (a keyboard shortcut, a caption that says "pause")
   *  has to re-run the specs that read it; without this it only appeared to,
   *  because the click that called it invalidated them itself. */
  const setPlayingTracked = (next: boolean): void => {
    if (untrack(playing) === next) return;
    setPlaying(next);
    invalidateSpecReaders(input);
  };

  const rawElapsed = (): number => base + (isRunning() ? now() - since : 0);
  /** Elapsed folded into [0, duration] by `loop`; clamped at the end if not. */
  const elapsed = (): number => {
    const e = rawElapsed();
    if (e < duration) return e;
    if (loop) return duration > 0 ? e % duration : 0;
    return duration;
  };

  // The SIGNAL holds the emitted DOMAIN VALUE, not elapsed: a tick that doesn't
  // change the value writes nothing, so a 365-day year over 10s costs one
  // pipeline re-run per day rather than one per frame.
  const [value, setValue] = createSignal<T>(invert(0));
  const [playing, setPlaying] = createSignal(false);

  let handle: ReturnType<typeof setInterval> | undefined;
  let autoStarted = false;

  const input: InputPrimitive = {
    specRuntimes: new Set(),
  };
  const track = makeTrack(input);

  const startTicking = (): void => {
    if (handle !== undefined) return;
    handle = setInterval(() => sample(), SAMPLE_MS);
  };
  const stopTicking = (): void => {
    if (handle !== undefined) {
      clearInterval(handle);
      handle = undefined;
    }
  };

  /** Publish the current domain value; end a non-looping sweep at `duration`. */
  const sample = (): void => {
    if (!loop && isRunning() && rawElapsed() >= duration) {
      base = duration;
      stopTicking();
      setPlayingTracked(false);
    }
    publish();
  };

  const publish = (): void => {
    const next = invert(elapsed());
    if (next !== value()) {
      setValue(() => next);
      invalidateSpecReaders(input);
    }
  };

  const play = (): void => {
    autoStarted = true;
    if (isRunning()) return;
    // Replaying a finished non-looping sweep starts it over.
    if (!loop && base >= duration) base = 0;
    since = now();
    setPlayingTracked(true);
    startTicking();
    publish();
  };
  const pause = (): void => {
    autoStarted = true;
    if (isRunning()) base = elapsed();
    stopTicking();
    setPlayingTracked(false);
  };

  const acc = (() => {
    track();
    // Lazy-start ONCE on the first read, as before: an explicit pause() then
    // stays paused until an explicit play() (a read must not resurrect a
    // paused clock), and `playing: false` starts paused for the same reason.
    if (!autoStarted) {
      autoStarted = true;
      if (options.playing !== false) play();
    }
    return value();
  }) as Timer<T>;

  acc.set = (v: T) => {
    base = scale(v);
    if (isRunning()) since = now();
    publish();
  };
  acc.play = play;
  acc.pause = pause;
  acc.isPlaying = () => {
    track();
    return playing();
  };
  (acc as { domain: Timer<T>["domain"] }).domain = values ?? [lo, hi];
  (acc as { step: number | undefined }).step = step;
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
