/**
 * brush() — a rectangular interval selection (M3; Tier 1).
 *
 * The Meros walkthrough's Brush on the GoFish substrate:
 *   - the brush EXTENT is a pair of writable range anchors in DATA space (the
 *     instrument's own state; data space so a re-layout can't invalidate it);
 *   - a `drag()`'s span drives the extent with event-edge writes (px → data
 *     conversion at the anchor seam via the frame's RECORDED scales);
 *   - the chart's x/y data domains Limit-bind the extent ranges (interval
 *     intersection in the setters) — the type-driven range → range relation;
 *   - `inside` is the interval SELECTOR derived from the range anchors: a
 *     data predicate usable in `when(...)` states and DataRef filters;
 *   - temporal gating: `inside` reads the LIVE extent (during the drag);
 *     `insideCommitted` reads the extent sampled-and-held at drag end — the
 *     `during` vs `onEnd` distinction, as two selectors over the same state.
 */
import { createSignal, type Accessor } from "solid-js";
import { bind, type RangeAnchor } from "../bindings";
import { drag } from "../inputs";
import { frameConversions, type FrameConversions } from "../frameScales";
import type {
  Instrument,
  InteractionFrame,
  Selector,
  StatePredicate,
  SvgPoint,
} from "../types";

/** A 2D data-space extent: [xMin, xMax] × [yMin, yMax]. */
export interface Extent2D {
  x: [number, number];
  y: [number, number];
}

export interface BrushOptions {
  /** Field names (or accessors) the selector tests datums against. */
  x: string | ((d: unknown) => number);
  y: string | ((d: unknown) => number);
  /**
   * Multiply the brush: each new drag starts another instance instead of
   * replacing the previous one (Meros' `multi: true` — anchors lift to a set
   * of instances keyed by creation order). Escape clears all instances.
   */
  multi?: boolean;
  fill?: string;
  stroke?: string;
}

export interface BrushInstrument extends Instrument {
  /** Live data-space extent (reactive; undefined before the first drag). */
  extent: Accessor<Extent2D | undefined>;
  /** Extent sampled-and-held at drag end (`onEnd` gating). */
  committed: Accessor<Extent2D | undefined>;
  /** Interval selector over the LIVE extent (`during` gating). */
  inside: Selector;
  /** Interval selector over the COMMITTED extent (`onEnd` gating). */
  insideCommitted: Selector;
  /**
   * Geometric selector: true when the display ITEM's x center falls inside
   * the brush's x extent (converted through the same recorded maps the brush
   * uses). For marks whose datum has no continuous x field — bars on an
   * ordinal axis — this is the region-selection form of `inside`.
   */
  intersectsX: StatePredicate;
  /** The brush's writable range anchors — bind targets for Limit/Match
   *  (e.g. `bind(bands.anchor, b.anchors.x, { by: "nearest" })`). Under
   *  `multi`, the anchors address the ACTIVE instance; completed instances
   *  are frozen (their values passed through the same constrained setters). */
  anchors: { x: RangeAnchor; y: RangeAnchor };
  /** All live instances, oldest first (a single-element list without
   *  `multi`). The set the anchors lift to under multiplication. */
  instances: Accessor<Extent2D[]>;
  /** True while the brush is being dragged. */
  active: Accessor<boolean>;
}

const fieldOf = (
  f: string | ((d: unknown) => number)
): ((d: unknown) => number) => {
  const of =
    typeof f === "string"
      ? (d: unknown) => Number((d as Record<string, unknown>)?.[f])
      : f;
  // Marks driven by scatter/spread carry their datum as a (often 1-element)
  // group array; test the first element in that case.
  return (d: unknown) => of(Array.isArray(d) ? d[0] : d);
};

export function brush(options: BrushOptions): BrushInstrument {
  const ofX = fieldOf(options.x);
  const ofY = fieldOf(options.y);

  const [extent, setExtent] = createSignal<Extent2D | undefined>(undefined);
  const [committed, setCommitted] = createSignal<Extent2D | undefined>(
    undefined
  );
  // Completed instances under `multi` (empty otherwise). The active extent
  // lives in `extent`; instances() = frozen ∪ active.
  const [frozen, setFrozen] = createSignal<Extent2D[]>([]);
  const instances: Accessor<Extent2D[]> = () => {
    const e = extent();
    return e ? [...frozen(), e] : frozen();
  };

  let conv: FrameConversions | undefined;
  let startData: { x: number; y: number } | undefined;

  // Writable range anchors over the extent (the brush's spatial state).
  // Domain limits are bound below; setters land clamped values in the signal.
  const xRange: RangeAnchor = {
    kind: "range",
    get: () => extent()?.x ?? [NaN, NaN],
    set: (v) => setExtent((e) => ({ x: v, y: e?.y ?? v })),
  };
  const yRange: RangeAnchor = {
    kind: "range",
    get: () => extent()?.y ?? [NaN, NaN],
    set: (v) => setExtent((e) => ({ x: e?.x ?? v, y: v })),
  };
  // Limit: clamp each extent range into the chart's data domain (lazily read
  // from the current frame — the binding survives frame republication).
  bind(
    { kind: "range", get: () => conv?.domains.x ?? [-Infinity, Infinity] },
    xRange
  );
  bind(
    { kind: "range", get: () => conv?.domains.y ?? [-Infinity, Infinity] },
    yRange
  );

  const d = drag({
    hitTest: (pt: SvgPoint) =>
      conv !== undefined &&
      pt.x >= conv.contentPx.x[0] &&
      pt.x <= conv.contentPx.x[1] &&
      pt.y >= conv.contentPx.y[0] &&
      pt.y <= conv.contentPx.y[1],
  });

  const sorted = (a: number, b: number): [number, number] =>
    a <= b ? [a, b] : [b, a];

  const within = (e: Extent2D, x: number, y: number): boolean =>
    x >= e.x[0] && x <= e.x[1] && y >= e.y[0] && y <= e.y[1];

  const insideExtent =
    (which: Accessor<Extent2D | undefined>): Selector =>
    (datum) => {
      const e = which();
      if (!e || datum === undefined) return false;
      return within(e, ofX(datum), ofY(datum));
    };

  // Under `multi`, the live selector is the OR over all instances — a set
  // anchor's compound predicate (Meros §4.2: multiplication yields a
  // compound selection with no extra configuration).
  const insideAny: Selector = (datum) => {
    if (datum === undefined) return false;
    const list = instances();
    if (list.length === 0) return false;
    const x = ofX(datum);
    const y = ofY(datum);
    return list.some((e) => within(e, x, y));
  };

  const itemCenterX = (item: {
    kind: string;
    x?: number;
    w?: number;
    cx?: number;
  }): number | undefined =>
    item.kind === "rect" && item.x !== undefined
      ? item.x + (item.w ?? 0) / 2
      : item.kind === "ellipse"
        ? item.cx
        : undefined;

  return {
    extent,
    committed,
    inside: insideAny,
    insideCommitted: insideExtent(committed),
    intersectsX: (_datum, item) => {
      if (!conv || !item) return false;
      const cxPx = itemCenterX(item as never);
      if (cxPx === undefined) return false;
      const cx = conv.pxToData[0](cxPx);
      return instances().some((e) => cx >= e.x[0] && cx <= e.x[1]);
    },
    anchors: { x: xRange, y: yRange },
    instances,
    active: d.active,

    onFrame(frame: InteractionFrame) {
      conv = frameConversions(frame);
    },

    onEvent(type, event, hit, pt) {
      if (type === "keydown") {
        if ((event as KeyboardEvent).key === "Escape") {
          setFrozen([]);
          setExtent(undefined);
          setCommitted(undefined);
          startData = undefined;
        }
        return;
      }
      const wasActive = d.active();
      d.onEvent!(type, event, hit, pt);
      if (!conv || !pt) return;
      const toData = (p: SvgPoint) => ({
        x: conv!.pxToData[0](p.x),
        y: conv!.pxToData[1](p.y),
      });
      if (type === "pointerdown" && !wasActive && d.active()) {
        // Multiplication is an instance-creation EVENT: freeze the current
        // instance and start a new one (single-brush replaces instead).
        const prev = extent();
        if (options.multi && prev) setFrozen((f) => [...f, prev]);
        startData = toData(pt);
        xRange.set!([startData.x, startData.x]);
        yRange.set!([startData.y, startData.y]);
      } else if (d.active() && startData) {
        // Event-edge write: extent = span(start, current), clamped by limits.
        const cur = toData(pt);
        xRange.set!(sorted(startData.x, cur.x));
        yRange.set!(sorted(startData.y, cur.y));
      }
      if (type === "pointerup" && wasActive && !d.active()) {
        // onEnd commit: sample-and-hold the live extent.
        setCommitted(extent());
        startData = undefined;
      }
    },

    renderOverlay() {
      const toBox = (e: Extent2D) => {
        const x = sorted(conv!.dataToPx[0](e.x[0]), conv!.dataToPx[0](e.x[1]));
        const y = sorted(conv!.dataToPx[1](e.y[0]), conv!.dataToPx[1](e.y[1]));
        return { x: x[0], y: y[0], w: x[1] - x[0], h: y[1] - y[0] };
      };
      const boxes = () => (conv ? instances().map(toBox) : []);
      return (
        <g>
          {boxes().map((b) => (
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              fill={options.fill ?? "rgba(105, 140, 190, 0.15)"}
              stroke={options.stroke ?? "#5b7ba6"}
              stroke-width={1}
              stroke-dasharray="4,3"
            />
          ))}
        </g>
      );
    },
  };
}
