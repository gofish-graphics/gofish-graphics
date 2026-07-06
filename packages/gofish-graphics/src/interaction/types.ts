/**
 * Shared types for the interaction layer (see notes/design/interaction.md).
 *
 * The interaction layer sits OUTSIDE the layout pipeline: the pipeline stays
 * synchronous and signal-free, and interaction state lives in SolidJS signals
 * that the paint layer (Tier 0), the overlay (Tier 1), or a re-resolve
 * scheduler (Tier 2) react to. Frames are published after each lower pass;
 * instruments re-attach to fresh nodes by stable identity because node uids
 * are minted per resolve.
 */
import type { JSX } from "solid-js";
import type { DisplayList } from "gofish-ir";
import type { GoFishNode, ToPixel } from "../ast/_node";

/** A style override applied to one display item at paint time (Tier 0). */
export type ItemPatch = Partial<DisplayList.Style>;

/**
 * A per-item predicate backing a `when(...)` state. `datum` is the mark's
 * backing datum (data-space predicates: thresholds, brushes); `item` is the
 * lowered display item (identity predicates: hover). Predicates may read
 * signals — they are evaluated inside reactive style accessors.
 */
export type StatePredicate = (
  datum: unknown,
  item: DisplayList.DisplayItem
) => boolean;

/**
 * A selector: a data predicate derived from an anchor (scalar → point,
 * range → interval, set → region). Selectors ignore the display item, so they
 * are usable both as `when(...)` states and as DataRef filters.
 */
export type Selector = (
  datum: unknown,
  item?: DisplayList.DisplayItem
) => boolean;

/**
 * One published layout frame: the lowered items, the resolved root, and the
 * recorded root-level maps anchors convert through. All forward maps are the
 * RECORDED ones from the layout run — inversion samples them (they are
 * affine), never re-derives scales.
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

/** Delegated DOM event types the runtime routes to instruments. */
export type InteractionEventType =
  | "pointermove"
  | "pointerdown"
  | "pointerup"
  | "pointerleave"
  | "wheel"
  | "keydown";

/** The Tier-2 seam an instrument sees of the runtime: "the spec changed —
 *  schedule a re-resolve + re-render" (rAF-coalesced, latest-wins). */
export interface SpecInvalidator {
  invalidate(): void;
}

/**
 * An instrument packages input handling + (optionally) overlay shapes +
 * selectors. Plain object — composed by library functions, not a class
 * hierarchy.
 */
export interface Instrument {
  /** Called once when the instrument is registered with a runtime. Used by
   *  parameter bindings to reach the Tier-2 scheduler. */
  attach?(runtime: SpecInvalidator): void;
  /** Called after each layout frame is lowered, before paint. */
  onFrame?(frame: InteractionFrame): void;
  /** Delegated events. `hit` is the display item under the pointer, if any;
   *  `pt` is the pointer position in svg-local pixels (pointer events only). */
  onEvent?(
    type: InteractionEventType,
    event: Event,
    hit: Hit | undefined,
    pt: SvgPoint | undefined
  ): void;
  /**
   * Tier-1 overlay: instrument-owned geometry painted above the chart in
   * pixel space. Attribute expressions may read signals — they update through
   * Solid's fine-grained reactivity with zero pipeline re-runs.
   */
  renderOverlay?(): JSX.Element;
}
