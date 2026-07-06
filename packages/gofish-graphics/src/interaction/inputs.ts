/**
 * Input components — event streams exposed through the same anchor interface
 * shapes use, which is what lets the binding algebra close over inputs and
 * shapes alike (Meros' key move, kept intact).
 *
 * `drag()` exposes scalar anchors for the current pointer position (svg-local
 * px) that PUSH on events (discrete-time semantics: equate writes land at
 * event boundaries), plus an `active` signal for temporal gating.
 */
import { createSignal, type Accessor } from "solid-js";
import type { ScalarAnchor } from "./bindings";
import type { Instrument, SvgPoint } from "./types";

export interface DragInput extends Instrument {
  /** Scalar anchors (svg-local px). Push on pointer events while dragging. */
  x: ScalarAnchor;
  y: ScalarAnchor;
  /** True while a drag is in progress (temporal gate). */
  active: Accessor<boolean>;
  /** Last pointer position (reactive), if any. */
  current: Accessor<SvgPoint | undefined>;
}

export interface DragOptions {
  /**
   * Where a drag may start. Given the pointer-down position (svg-local px),
   * return true to begin the drag. Default: anywhere. This is the M2 stand-in
   * for binding the drag to a shape's area anchor.
   */
  hitTest?: (pt: SvgPoint) => boolean;
}

export function drag(options: DragOptions = {}): DragInput {
  const [active, setActive] = createSignal(false);
  const [current, setCurrent] = createSignal<SvgPoint | undefined>(undefined);
  const xSubs = new Set<(v: number) => void>();
  const ySubs = new Set<(v: number) => void>();

  const push = (pt: SvgPoint): void => {
    setCurrent(pt);
    for (const fn of xSubs) fn(pt.x);
    for (const fn of ySubs) fn(pt.y);
  };

  const anchor = (subs: Set<(v: number) => void>, axis: "x" | "y") =>
    ({
      kind: "scalar",
      get: () => current()?.[axis] ?? NaN,
      subscribe: (fn: (v: number) => void) => {
        subs.add(fn);
        return () => subs.delete(fn);
      },
    }) satisfies ScalarAnchor;

  return {
    x: anchor(xSubs, "x"),
    y: anchor(ySubs, "y"),
    active,
    current,
    onEvent(type, event, _hit, pt) {
      if (!pt) return;
      if (type === "pointerdown") {
        if (options.hitTest && !options.hitTest(pt)) return;
        setActive(true);
        // Keep receiving moves outside the svg while the button is held.
        const svg = event.currentTarget as SVGSVGElement | null;
        const pointerId = (event as PointerEvent).pointerId;
        try {
          svg?.setPointerCapture?.(pointerId);
        } catch {
          /* capture is best-effort (e.g. synthetic events in tests) */
        }
        push(pt);
        event.preventDefault();
      } else if (type === "pointermove") {
        if (active()) push(pt);
      } else if (type === "pointerup") {
        if (active()) {
          push(pt);
          setActive(false);
        }
      }
    },
  };
}
