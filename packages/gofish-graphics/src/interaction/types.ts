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
import type { GoFishNode, ToPixel } from "../ast/_node";

/**
 * One published layout frame: the lowered items, the resolved root, and the
 * recorded root-level maps the interaction layer converts through. All forward
 * maps are the RECORDED ones from the layout run — inversion samples them
 * (they are affine), never re-derives scales.
 */
export interface InteractionFrame {
  items: DisplayList.DisplayItem[];
  root: GoFishNode;
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
  /** True when the input was read during resolve OUTSIDE a `live()` channel —
   *  i.e. it is a pipeline dependency and its writes must schedule a re-run.
   *  Reset by the runtime at the start of every resolve. */
  usedInSpec: boolean;
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
