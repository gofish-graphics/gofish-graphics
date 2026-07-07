// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * Shared types for the reactive interaction layer.
 *
 * The interaction layer sits OUTSIDE the layout pipeline: the pipeline stays
 * synchronous and signal-free, and interaction state lives in SolidJS signals
 * that either the paint layer reacts to per-attribute (live values) or a
 * re-resolve scheduler reacts to (spec-read inputs). Frames are published
 * after each lower pass; inputs re-bind to fresh nodes by stable identity
 * because node uids are minted per resolve.
 */
import type { DisplayList } from "gofish-ir";
import type { ToPixel } from "../ast/_node";

/**
 * One published layout frame: the lowered items and the recorded root-level
 * maps the interaction layer converts through. All forward maps are the
 * RECORDED ones from the layout run — inversion samples them (they are affine),
 * never re-derives scales.
 */
export interface InteractionFrame {
  items: DisplayList.DisplayItem[];
  /** GoFish-space → screen-px map for this frame (gutters + y-flip). */
  toPixel?: ToPixel;
  /** Root position scales: data → gofish space, per axis. */
  posScales?: [
    ((pos: number) => number) | undefined,
    ((pos: number) => number) | undefined,
  ];
  /** Continuous data domains per axis, when the axis has one. */
  domains?: {
    x?: [number, number];
    y?: [number, number];
  };
  /** Root content size in gofish space (pre-gutter). */
  size?: { width: number; height: number };
}

/** A resolved hit under the pointer. */
export interface Hit {
  id: string;
  item: DisplayList.DisplayItem;
  datum: unknown;
}

/** Pointer position in svg-local pixel coordinates. */
export interface SvgPoint {
  x: number;
  y: number;
}

/** Delegated DOM event types the runtime routes to inputs. */
export type InteractionEventType =
  | "pointermove"
  | "pointerdown"
  | "pointerup"
  | "pointerleave"
  | "wheel";

/** The seam an input sees of the runtime: "the spec changed — schedule a
 *  re-resolve + re-render" (rAF-coalesced, latest-wins). */
export interface SpecInvalidator {
  invalidate(): void;
}

/**
 * A library input primitive (pointer, drag, wheel, timer, signal). Private to
 * the interaction layer — user code sees only the accessor objects the input
 * factories return. Registered with a runtime on first read during resolve;
 * `usedInSpec` decides the execution regime (see resolveContext.ts).
 */
export interface InputPrimitive {
  /** The set of runtimes for which this input is a pipeline dependency — i.e.
   *  the charts that read it during resolve OUTSIDE a `live()` channel. A write
   *  must invalidate every one (an input read in two charts' specs invalidates
   *  BOTH). Each runtime deletes itself from this set at the start of its own
   *  resolve (so a chart's re-resolve doesn't drop another chart's dependency)
   *  and re-adds itself if the read recurs; a disposed runtime removes itself.
   *  Replaces the former single-runtime `usedInSpec` boolean. */
  specRuntimes: Set<SpecInvalidator>;
  /** The delegated DOM event types this input consumes. The runtime attaches
   *  only the union of these across registered inputs, so a wheel/timer/signal-
   *  only chart never pays pointer-move hit-testing. Omitted/empty = no DOM
   *  events (timer, signal). */
  events?: InteractionEventType[];
  /** Whether this input needs the per-frame hit-test map + data-space
   *  conversions built (true for pointer and drag). When no registered input
   *  needs it, `publishFrame` skips the full item walk. */
  needsFrame?: boolean;
  /** Called once when the input is first registered with a runtime. Used to
   *  reach the scheduler (invalidate) and frame conversions. */
  attach?(runtime: import("./runtime").InteractionRuntime): void;
  /** Called after each layout frame is lowered, before paint. */
  onFrame?(frame: InteractionFrame): void;
  /** Delegated events. `hit` is the display item under the pointer, if any;
   *  `pt` is the pointer position in svg-local pixels. */
  onEvent?(
    type: InteractionEventType,
    event: Event,
    hit: Hit | undefined,
    pt: SvgPoint | undefined
  ): void;
}
