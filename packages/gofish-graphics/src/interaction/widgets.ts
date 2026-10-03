// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * Controls as ordinary GoFish marks — a slider and a button, built from
 * `rect`/`ellipse`/`text` plus `drag()`/`click()`. Nothing here touches the DOM;
 * a control is a picture inside the same `<svg>` as the chart it drives.
 *
 * See /internals/frontend/reactivity for the model (read location decides the
 * regime, controlled one-way inputs, why a control is a MARK and not a node).
 * Two invariants are local to this file:
 *
 *  - a control's BOX does not depend on the state it shows. What follows the
 *    value or the pointer (the slider's handle and readout, the pressed
 *    shading) is read at PAINT, through live slots, so it patches attributes
 *    and never makes the input a pipeline dependency: a clock driving a slider
 *    does not re-lay-out the chart around it. That is sound only because
 *    nothing it moves changes the box (the handle's travel is inset, the
 *    readout is right-aligned in a reserved slot). What does change the box
 *    (a button's caption) is read at resolve, and re-measures;
 *  - the input and its write effect are created ONCE, when the widget is made,
 *    so a re-resolve neither leaks inputs nor loses a drag in flight.
 *
 * The write is a Solid `createEffect`, the repo's existing precedent
 * (`DraggableThreshold`), kept INSIDE the widget so a spec never sees it. The
 * principled replacement is one declarative write primitive, designed under #830.
 */
import { createEffect, createRoot, untrack } from "solid-js";
import { GoFishNode } from "../ast/_node";
import type { AnimationRule } from "../animation/paint";
import { rect } from "../ast/shapes/rect";
import { ellipse } from "../ast/shapes/ellipse";
import { text } from "../ast/shapes/text";
import { layer as Layer } from "../ast/graphicalOperators/layer";
import { Constraint } from "../ast/constraints";
import { nameableMark, type NameableMark } from "../ast/marks/createOperator";
import { resolveMarkResult } from "../ast/marks/markResult";
import type { Mark } from "../ast/types";
import { clamp, mod } from "../util";
import { click, drag } from "./inputs";
import { live, readLive } from "./live";
import { setLiveSlots } from "./liveSlots";
import type { Hit, SvgPoint } from "./types";

/* ------------------------------- scaffold -------------------------------- */

/** A control mark. `dispose()` tears down the write effect's reactive root —
 *  a control outlives any one resolve, so it owns that root and hands the
 *  disposer back rather than dropping it. */
export type Control = NameableMark<unknown> & { dispose(): void };

/**
 * The scaffold both controls are: an input that accepts hits only on the nodes
 * this control itself built, ONE write effect created once outside any spec, and
 * a mark that builds the picture whenever the spec around it resolves.
 *
 * `build` returns the finished node plus the control's two own hit targets, in
 * order; the FIRST is the one a write maps the pointer onto (the slider's
 * track), which `write` reads as `primaryId()`.
 */
function control<I>(spec: {
  input: (hitTest: (pt: SvgPoint, hit: Hit | undefined) => boolean) => I;
  write: (input: I, primaryId: () => string | undefined) => void;
  build: (
    input: I
  ) => Promise<{ node: GoFishNode; targets: [GoFishNode, GoFishNode] }>;
}): Control {
  // The uids of the two nodes the latest build produced. Refreshed per build,
  // read only at pointerdown — no set needed for two of them.
  let primary: string | undefined;
  let secondary: string | undefined;
  const input = spec.input((_pt, hit) => {
    const id = hit?.id;
    return id !== undefined && (id === primary || id === secondary);
  });

  const dispose = createRoot((disposeRoot) => {
    spec.write(input, () => primary);
    return disposeRoot;
  });

  const mark: Mark<unknown> = async () => {
    const { node, targets } = await spec.build(input);
    primary = targets[0].uid;
    secondary = targets[1].uid;
    return node;
  };
  const result = nameableMark(mark) as Control;
  result.dispose = dispose;
  return result;
}

/** Invoke a leaf mark with no datum — what an operator does to a mark child. */
const leaf = (mark: unknown): Promise<GoFishNode> =>
  resolveMarkResult(mark as Parameters<typeof resolveMarkResult>[0]);

/* -------------------------------- slider -------------------------------- */

export interface SliderOptions {
  /** The displayed value, in domain units. Read at PAINT, so the handle and
   *  the readout follow the underlying input (a clock tick, a `.set`) without
   *  the chart being resolved or laid out again. */
  value: () => number;
  /** Called with the pointed-at value, in domain units, already quantized by
   *  `step` and either clamped to `domain` or wrapped around it (`wrap`). */
  onInput: (v: number) => void;
  /** The value range the track spans. */
  domain: readonly [number, number];
  /** Quantize the emitted value to `lo + k*step`. Default: continuous. */
  step?: number;
  /** Track length in px. Default 300. */
  w?: number;
  /**
   * Treat the domain as a CYCLE: dragging past either end comes back in at the
   * other, continuously and with no clamp. Default false. The name and the
   * behavior are Qt's (`QAbstractSpinBox.wrapping`, `QDial.wrapping`).
   *
   * The cycle length is `hi - lo` for a continuous domain (so `hi` and `lo` are
   * the same point on the circle, as they are for an angle) and `hi - lo + step`
   * for a quantized one (a day-of-year domain `[1, 365]` with `step: 1` has 365
   * distinct slots, so day 365 is followed by day 1 rather than identified with
   * it).
   */
  wrap?: boolean;
  /** Format the value readout drawn to the right of the track. Default
   *  `String`. */
  format?: (v: number) => string;
}

/** Handle radius (px) — also the inset of the handle's travel at each end, so
 *  the widget's bounding box is exactly `w` wide whatever the value is. */
const HANDLE_R = 7;
const TRACK_H = 4;
/** Gap between the track's right edge and the value readout's slot. */
const READOUT_GAP = 8;
const READOUT_FONT = 12;
/** Reserved readout width PER CHARACTER (px, at `READOUT_FONT`) — a rough
 *  average glyph width. It sizes the READOUT SLOT only: the readout is
 *  right-aligned against the slot's far edge, so the widget's bbox is stable
 *  whether or not the estimate is right, and this decides only how close a long
 *  label comes to the track. Measuring the text properly happens at layout,
 *  inside the text node. */
const READOUT_SLOT_W = 0.62 * READOUT_FONT;

/**
 * `slider({ value, onInput, domain, step, w, wrap, format })` — a track with a
 * handle and a value readout.
 *
 * The handle's CENTER travels `w - 2r` px, from `r` to `w - r`, so the handle
 * always lies inside the track and the bbox never changes width with the value.
 * The readout is right-aligned against a reserved slot for the same reason: the
 * glyphs grow leftward from a fixed edge, so nothing laid out beside the slider
 * moves when the value changes.
 *
 * Because the box is value-independent, the value is a PAINT-time fact: the
 * slider lays out once at the value it was built with, and the handle's `cx`,
 * the readout's text and the handle's pressed shading are live slots that
 * re-read `value()` and the drag state per frame.
 *
 * The pointer position IS the value: the write maps `current.x` onto the
 * fraction of the handle's travel it fell at, asking the frame — through
 * `nodeBox(track.uid)` — where layout put the track. Without `wrap` that
 * fraction is clamped to `[0, 1]`; with it the raw fraction is used and the
 * quantized value folded modulo the cycle, so a drag off either end continues
 * around instead of piling up at the stop.
 */
export function slider(opts: SliderOptions): Control {
  const { value: readValue, onInput } = opts;
  const w = opts.w ?? 300;
  const [lo, hi] = opts.domain;
  const span = hi - lo;
  const format = opts.format ?? String;
  /** The handle center's travel in px, at the authored width. The write uses the
   *  travel of the track's MEASURED box instead, so a scaled frame still maps. */
  const travel = Math.max(1, w - 2 * HANDLE_R);
  /** Reserved width for the readout — the widest of the two end labels. */
  const slotW = Math.ceil(
    READOUT_SLOT_W * Math.max(format(lo).length, format(hi).length, 1)
  );

  const quantize = (v: number): number => {
    const step = opts.step;
    if (step === undefined || step <= 0) return v;
    return lo + Math.round((v - lo) / step) * step;
  };

  /** The value at a fraction of the handle's travel. Unclamped input: `frac < 0`
   *  is a pointer left of the track's start, `frac > 1` one past its end. */
  const valueAt = (frac: number): number => {
    if (!opts.wrap)
      return clamp(quantize(lo + clamp(frac, 0, 1) * span), lo, hi);
    // The cycle: `span` identifies hi with lo (an angle), `span + step` gives a
    // quantized domain one slot per value (day 365 then day 1). See `wrap`.
    const step = opts.step !== undefined && opts.step > 0 ? opts.step : 0;
    const cycle = span + step;
    if (cycle <= 0) return lo;
    return lo + mod(quantize(lo + frac * span) - lo, cycle);
  };

  return control({
    input: (hitTest) => drag({ hitTest }),
    // The write: one pure function of the pointer's position along the track.
    write: (scrub, trackId) =>
      createEffect(() => {
        if (!scrub.isActive()) return;
        const pt = scrub.current();
        const id = trackId();
        if (!pt || id === undefined) return;
        // The frame's own record of where layout put the track. Absent on the
        // first event of a chart whose frame hasn't published yet — then there is
        // nothing to map against, and skipping is the honest answer.
        const box = scrub.nodeBox(id);
        if (!box) return;
        const px = Math.max(1, box.w - 2 * HANDLE_R);
        const next = valueAt((pt.x - (box.x + HANDLE_R)) / px);
        if (next !== untrack(readValue)) onInput(next);
      }),
    build: async (scrub) => {
      // Every read of the value or the drag state is a PAINT-time read. This
      // one is the value the handle is laid out at: `readLive` reads it without
      // making the input a pipeline dependency, and still registers it with
      // the runtime so its writes reach the live slots below.
      const frac = (v: number): number =>
        span === 0 ? 0 : clamp((v - lo) / span, 0, 1);
      const frac0 = frac(readLive(readValue));

      const track = (
        await leaf(
          rect({
            x: 0,
            cy: HANDLE_R,
            w,
            h: TRACK_H,
            rx: TRACK_H / 2,
            fill: "#e5e5e5",
          })
        )
      ).name("track");
      const handle = await leaf(
        ellipse({
          cx: HANDLE_R + frac0 * travel,
          cy: HANDLE_R,
          w: 2 * HANDLE_R,
          h: 2 * HANDLE_R,
          fill: live(() => (scrub.isActive() ? "#111" : "#333")),
        })
      );
      // The handle follows the value at paint. Lowered items are in pixels, so
      // the slot moves the lowered `cx` by the value's change of fraction times
      // the travel in pixels; the handle keeps the layout box of `frac0`, which
      // is sound because the travel is inside the widget's box either way.
      handle.INTERNAL_animate(
        followValue(travel, frac0, () => frac(readValue()))
      );
      // `textAnchor: "end"` at the slot's right edge: for text, `x` is the
      // ANCHOR, and the node's box runs leftward from it — which is the whole
      // bbox-stability trick.
      const readout = (
        await leaf(
          text({
            x: w + READOUT_GAP + slotW,
            textAnchor: "end",
            text: live(() => format(readValue())),
            fontSize: READOUT_FONT,
            fill: "#333",
          })
        )
      ).name("readout");
      const node = await (
        await Layer({}, [track, handle, readout])
      ).relate(({ track: t, readout: r }) => [
        Constraint.align({ y: "middle" }, [t, r]),
      ]);
      // The track and the handle are this widget's drag targets; the readout is
      // not one.
      return { node, targets: [track, handle] };
    },
  });
}

/**
 * The slider handle's paint tier: each ellipse item's `cx` follows `frac()`,
 * offset from the `cx` it was lowered at (`frac0`) by the handle's `travel`
 * mapped to PIXELS through `toPixel` (translate plus a y flip, so today the
 * same length). The static value is written into the item too, so a
 * headless lowering shows the value as it stands.
 */
const followValue = (
  travel: number,
  frac0: number,
  frac: () => number
): AnimationRule => ({
  paint(items, { toPixel }) {
    const travelPx = toPixel([travel, 0])[0] - toPixel([0, 0])[0];
    for (const item of items) {
      if (item.kind !== "ellipse") continue;
      const cx0 = item.cx;
      const cx = (): number => cx0 + (frac() - frac0) * travelPx;
      item.cx = readLive(cx);
      setLiveSlots(item, { cx });
    }
  },
});

/* -------------------------------- button -------------------------------- */

export interface ButtonOptions {
  /** The caption. A function is read during resolve, so the text re-measures
   *  when it changes (a `live()` caption would keep the first one's box). */
  label: string | (() => string);
  onClick: () => void;
  w?: number;
  h?: number;
}

/**
 * `button({ label, onClick, w, h })` — a rounded box with a centered caption.
 *
 * Press detection is the `click()` input: a press is down-then-up over this
 * button, which is neither a pointer state nor a drag. The effect fires
 * `onClick` once per new click, so a re-resolve mid-press cannot double-fire it.
 */
export function button(opts: ButtonOptions): Control {
  const { label: caption, onClick } = opts;
  const w = opts.w ?? 24;
  const h = opts.h ?? 24;

  return control({
    input: (hitTest) => click({ hitTest }),
    write: (press) => {
      let handled = 0;
      createEffect(() => {
        const n = press.count();
        if (n <= handled) return;
        handled = n;
        onClick();
      });
    },
    build: async (press) => {
      // The caption changes the text's box, so it is read at resolve and
      // re-measures. The pressed shading changes no box, so it is a paint-time
      // read; evaluating that `live()` channel at resolve is also what
      // registers the click input with the runtime.
      const label = typeof caption === "function" ? caption() : caption;
      const box = (
        await leaf(
          rect({
            w,
            h,
            rx: 4,
            fill: live(() => (press.isArmed() ? "#e0e0e0" : "#f2f2f2")),
            stroke: "#ccc",
            strokeWidth: 1,
          })
        )
      ).name("box");
      const glyph = (
        await leaf(text({ text: label, fontSize: 12, fill: "#333" }))
      ).name("label");
      const node = await (
        await Layer({}, [box, glyph])
      ).relate(({ box: b, label: l }) => [
        Constraint.align({ x: "middle", y: "middle" }, [b, l]),
      ]);
      return { node, targets: [box, glyph] };
    },
  });
}
