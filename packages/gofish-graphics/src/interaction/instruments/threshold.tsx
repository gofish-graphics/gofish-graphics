/**
 * threshold() — a draggable horizontal reference line (M2; Tier 1).
 *
 * The Meros walkthrough's Threshold instrument on the GoFish substrate:
 *   - the threshold VALUE is a writable scalar anchor in DATA space (the
 *     instrument's own state — never derived chart geometry);
 *   - a `drag()` input's y anchor is Equate-bound to the rule's pixel-space
 *     anchor, whose setter converts px → data through the frame's RECORDED
 *     scales (space conversion at the anchor seam);
 *   - the chart's y data domain Limit-binds the value (clamp in the setter) —
 *     the type-driven range → scalar relation;
 *   - `above` / `below` selectors derive data predicates from the scalar
 *     anchor, driving `when(...)` states at Tier 0;
 *   - the rule itself is overlay geometry: dragging repaints the overlay and
 *     restyles marks with ZERO layout-pipeline re-runs.
 */
import { createSignal, Show, type Accessor } from "solid-js";
import { bind, invertAffine, type ScalarAnchor } from "../bindings";
import { drag } from "../inputs";
import type {
  Instrument,
  InteractionFrame,
  StatePredicate,
  SvgPoint,
} from "../types";

export interface ThresholdOptions {
  /** Registry name for deferred selectors (`above("cut")`) and `refs`. */
  name?: string;
  /** Initial threshold value, in data space. */
  at: number;
  /** Datum → comparable value (e.g. `(d) => sumBy(d, "count")`). Optional
   *  when consumers use name-deferred selectors (`above("cut", of)`), which
   *  carry their own accessor. */
  of?: (datum: unknown) => number;
  /** False renders a static (non-grabbable) reference line. Default true. */
  draggable?: boolean;
  stroke?: string;
  strokeWidth?: number;
}

export interface ThresholdInstrument extends Instrument {
  /** The threshold value in data space (reactive read). */
  value: Accessor<number>;
  /** Selectors: data predicates derived from the scalar anchor. */
  above: StatePredicate;
  below: StatePredicate;
}

const GRAB_RADIUS = 8;

export function threshold(options: ThresholdOptions): ThresholdInstrument {
  const [value, setValue] = createSignal(options.at);

  // Frame-recorded conversion legs (rebuilt on each published frame; the
  // getters below always read the current ones — stable-path re-binding).
  let dataToPx: ((d: number) => number) | undefined;
  let pxToData: ((px: number) => number) | undefined;
  let xExtent: [number, number] = [0, 0];
  let domain: [number, number] | undefined;

  // The writable DATA-space scalar anchor (the instrument's state).
  const valueAnchor: ScalarAnchor = {
    kind: "scalar",
    get: value,
    set: (v: number) => setValue(v),
  };
  // Limit: clamp the value into the chart's y data domain. The range anchor
  // reads the CURRENT frame's domain lazily, so the binding survives frames.
  bind(
    { kind: "range", get: () => domain ?? [-Infinity, Infinity] },
    valueAnchor
  );

  // The rule's pixel-space y anchor: setter converts px → data at the seam,
  // then writes through the (clamped) data-space anchor.
  const rulePxAnchor: ScalarAnchor = {
    kind: "scalar",
    get: () => (dataToPx ? dataToPx(value()) : NaN),
    set: (px: number) => {
      if (pxToData) valueAnchor.set!(pxToData(px));
    },
  };

  // Equate: the drag's y drives the rule's pixel anchor, gated on the drag
  // being active (grabbing starts within GRAB_RADIUS of the line).
  const d = drag({
    hitTest: (pt: SvgPoint) =>
      options.draggable !== false &&
      dataToPx !== undefined &&
      Math.abs(pt.y - dataToPx(value())) < GRAB_RADIUS,
  });
  bind(d.y, rulePxAnchor, { when: () => d.active() });

  const [ready, setReady] = createSignal(false);

  const instrument: ThresholdInstrument = {
    name: options.name,
    value,
    above: (datum) => (options.of ? options.of(datum) > value() : false),
    below: (datum) => (options.of ? options.of(datum) <= value() : false),

    onFrame(frame: InteractionFrame) {
      const posScaleY = frame.posScales?.[1];
      const toPixel = frame.toPixel;
      if (!posScaleY || !toPixel || !frame.size) return;
      // Compose the RECORDED forward maps: data → gofish → screen px. Both
      // legs are affine, so the inverse is sampled, never re-derived.
      dataToPx = (dv: number) => toPixel([0, posScaleY(dv)])[1];
      pxToData = invertAffine(dataToPx);
      xExtent = [toPixel([0, 0])[0], toPixel([frame.size.width, 0])[0]];
      domain = frame.domains?.y;
      // Re-apply the clamp to the current value under the new frame's domain.
      valueAnchor.set!(value());
      setReady(true);
    },

    onEvent(type, event, hit, pt) {
      d.onEvent!(type, event, hit, pt);
    },

    renderOverlay() {
      const y = () => (dataToPx && ready() ? dataToPx(value()) : 0);
      return (
        <Show when={ready()}>
          <g style={{ cursor: "ns-resize" }}>
            {/* invisible grab band */}
            <line
              x1={xExtent[0]}
              x2={xExtent[1]}
              y1={y()}
              y2={y()}
              stroke="transparent"
              stroke-width={GRAB_RADIUS * 2}
            />
            <line
              x1={xExtent[0]}
              x2={xExtent[1]}
              y1={y()}
              y2={y()}
              stroke={options.stroke ?? "#333"}
              stroke-width={options.strokeWidth ?? 1.5}
              stroke-dasharray="6,4"
            />
          </g>
        </Show>
      );
    },
  };
  // Tag selectors with their owner so `when(...)` unwrapping auto-registers.
  for (const key of ["above", "below"] as const) {
    (instrument[key] as { __gfInstrument?: object }).__gfInstrument =
      instrument;
  }
  return instrument;
}
