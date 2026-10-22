/**
 * `Animation.*` — WHAT changes while a mark enters. Each effect is a plain
 * value, named by what it does (grow / shrink, fadeIn / fadeOut), not by the
 * phase it is used in, so one can be defined once and reused
 * (`const growIn = Animation.grow({ duration: 600 })`).
 *
 * An effect is read at PAINT time: layout runs once, and the effect maps the
 * display items a mark lowered at rest to the items it shows at a progress
 * `p` in [0, 1] (see `paint.ts`, which schedules `p` from the build clock).
 * `p = 0` is the ENTER state the mark shows before its turn; `p = 1` is the
 * mark as laid out, which it keeps once it has arrived. Each effect carries
 * what it does at `p` (its `Look`), so adding one is writing its constructor.
 *
 * WHEN is not here: that is `time.*` (`time.stagger`, `time.parallel`).
 */
import type { DisplayList } from "gofish-ir";
import { fadeItem } from "../ast/displayList/lowerHelpers";
import { resolveMethod } from "../interpolate";

/** A time warp `u -> u'` on [0, 1], or the name of a standard one. */
export type Ease =
  | ((u: number) => number)
  | "linear"
  | "quadIn"
  | "quadOut"
  | "quadInOut"
  | "cubicIn"
  | "cubicOut"
  | "cubicInOut";

const EASES: Record<
  Exclude<Ease, (u: number) => number>,
  (u: number) => number
> = {
  linear: (u) => u,
  quadIn: (u) => u * u,
  quadOut: (u) => u * (2 - u),
  quadInOut: (u) => (u < 0.5 ? 2 * u * u : -1 + (4 - 2 * u) * u),
  cubicIn: (u) => u * u * u,
  cubicOut: (u) => 1 - (1 - u) ** 3,
  cubicInOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
};

export function resolveEase(ease: Ease | undefined): (u: number) => number {
  if (ease === undefined) return EASES.cubicInOut;
  if (typeof ease === "function") return ease;
  const named = EASES[ease];
  if (named === undefined) {
    throw new Error(
      `[gofish] animation: unknown ease "${String(ease)}". Use one of ` +
        `${Object.keys(EASES).join(", ")}, or a function (u) => u'.`
    );
  }
  return named;
}

export type EffectOptions = {
  /** Milliseconds, default 500. Or a FIELD name: each mark's effect lasts in
   *  proportion to its own value of that field, the way `w: "days"` sizes a
   *  bar. DECLARED SHORTCUT: the time scale is linear with the largest value
   *  at 1000 ms; a real time scale (a size claim on t, with its own unit)
   *  is open. */
  duration?: number | string;
  /** Default slow-in / slow-out (`"cubicInOut"`), which Dragicevic et al.
   *  (2011) found easier to follow than constant speed. */
  ease?: Ease;
};

type WipeSide = "bottom" | "top" | "left" | "right";

export type WipeOptions = EffectOptions & {
  /** The side the reveal starts from, on screen. Default `"bottom"`. */
  from?: WipeSide;
  /** `"circle"`: a circular reveal from the mark's center. */
  shape?: "circle";
};

export type EffectKind =
  | "grow"
  | "shrink"
  | "fadeIn"
  | "fadeOut"
  | "appear"
  | "wipe";

/** An effect as written: a plain `{ kind, ...options }` value, the same in JS
 *  and on the wire (the `Animation` family in gofish-ir's `STRATEGIES`), apart
 *  from an ease that is a JS function. `effectOf` gives it its behavior. */
export type EffectValue = { kind: EffectKind } & WipeOptions;

/** A tween as written: `{ kind: "tween", curve?, ease? }`. The chart builder
 *  draws a `time.transition` tier for it (`tweenTier` in `ast/marks/time.ts`). */
export type TweenValue = {
  kind: "tween";
  curve?: import("../families/curve").Curve;
  ease?: Ease;
};

/** What an effect does to a mark at a progress `p` in [0, 1]. */
type Look = {
  /** One of the mark's own items at `p`. */
  host(
    item: DisplayList.DisplayItem,
    p: number,
    frame: EffectFrame
  ): DisplayList.DisplayItem;
  /** The opacity an item ATTACHED to the mark (its label) takes at `p`: a
   *  label follows its mark's timing. */
  rider(p: number): number;
  /** The fields `host` can change on `item`: what the paint tier patches. */
  channels(item: DisplayList.DisplayItem): readonly string[];
  /** Throw unless the effect can draw an item of this kind. Checked on the
   *  mark's own items as it is lowered, which is where the kind is known (a
   *  rect in polar coordinates lowers to a path), so a mismatch fails before
   *  anything paints. */
  fits(kind: DisplayList.DisplayItem["kind"]): void;
};

/** One effect: what it does, and its timing options as written (validated
 *  here). The build resolves the timing per mark (`TimedEffect`), which is
 *  where a field-valued duration gets its number. */
export type Effect = Look &
  EffectValue & {
    /** Where the effect is at local time `t` (ms since the mark's start),
     *  given its duration and warp: 0 before the start, 1 from the end on. */
    progress(t: number, duration: number, ease: (u: number) => number): number;
  };

/** An effect timed for one mark: its duration in ms and its warp. */
export type TimedEffect = {
  effect: Effect;
  duration: number;
  ease: (u: number) => number;
};

/** Whether two tweens move a mark the same way: the same curve and the same
 *  ease, once resolved (an unset curve is `Curve.monotone()`). Marks whose
 *  tweens do are moved by one transition, however many times
 *  `Animation.tween(...)` was called for them. */
export const sameTween = (a: TweenValue, b: TweenValue): boolean =>
  resolveMethod(a.curve, "Animation.tween({ curve })") ===
    resolveMethod(b.curve, "Animation.tween({ curve })") &&
  easeOf(a) === easeOf(b);

/** A tween's ease, resolved, or none. */
export const easeOf = (t: TweenValue): ((u: number) => number) | undefined =>
  t.ease === undefined ? undefined : resolveEase(t.ease);

export const DEFAULT_DURATION = 500;

/** The usual timing: the eased share of its duration an effect has played
 *  by `t`. A 0-length effect jumps to its end at its start. */
function ramp(
  t: number,
  duration: number,
  ease: (u: number) => number
): number {
  const raw = duration > 0 ? t / duration : t >= 0 ? 1 : 0;
  if (!(raw > 0)) return 0;
  if (raw >= 1) return 1;
  return ease(raw);
}

/** Check an effect's timing options where they are written: a duration is
 *  milliseconds (0 or more) or a field name, and an ease a known name or a
 *  function. */
export function checkEffectOptions(
  kind: EffectKind,
  opts: EffectOptions
): void {
  const { duration, ease } = opts;
  if (typeof duration !== "string") {
    const ms = duration ?? DEFAULT_DURATION;
    if (!(Number.isFinite(ms) && ms >= 0)) {
      throw new Error(
        `[gofish] Animation.${kind}({ duration: ${String(duration)} }): a ` +
          `duration is a number of milliseconds, 0 or more, or a field name.`
      );
    }
  }
  // An unknown ease name fails here, where it was written.
  resolveEase(ease);
}

/** An effect value with its behavior: what it does (`look`) and its timing. */
function effect(
  value: EffectValue,
  look: Look,
  progress: Effect["progress"] = ramp
): Effect {
  checkEffectOptions(value.kind, value);
  return { ...value, progress, ...look };
}

/** `look` played backward: at progress `p` it shows what `look` shows at
 *  `1 − p`. */
const reversed = (look: Look): Look => ({
  ...look,
  host: (item, p, frame) => look.host(item, 1 - p, frame),
  rider: (p) => look.rider(1 - p),
});

/** A geometric effect's rider waits until the mark has arrived (Highcharts'
 *  "labels wait") rather than float beside a mark that is still moving.
 *  DECLARED PROTOTYPE BEHAVIOR: riding the growing bar's end (issue #894) is
 *  not built. */
const waits = (p: number): number => (p === 1 ? 1 : 0);

/** Scale the mark's SIZE axes toward its baseline by `p` (see `collapse`). */
const collapsing = (kind: "grow" | "shrink"): Look => ({
  host: collapse,
  rider: waits,
  channels: boxFieldsOf,
  fits: (item) => {
    if (BOX_FIELDS[item] !== undefined) return;
    throw new Error(
      `[gofish] Animation.${kind}(): collapses a box-shaped mark (a rect ` +
        `or an ellipse) toward its baseline, and this mark ${drawnAs(item)}. ` +
        `Use Animation.fadeIn() or Animation.appear() for it.`
    );
  },
});

/** How a mark that lowered to an item of `kind` is described in a message.
 *  A path is named because the mark usually was not written as one: a rect
 *  or an ellipse in polar or other curved coordinates is drawn as a path. */
const drawnAs = (kind: string): string =>
  `is drawn as a "${kind}"` +
  (kind === "path"
    ? ` (a rect or an ellipse in polar or other curved coordinates is ` +
      `drawn as a path)`
    : "");

/** Multiply the mark's opacity by `p`; its rider fades with it. */
const fading: Look = {
  host: fadeItem,
  rider: (p) => p,
  channels: () => ["opacity"],
  fits: () => {},
};

/** Show the part of the mark a wipe from `from` (or a circular reveal) has
 *  uncovered by `p`. */
const revealing = (
  from: WipeSide | undefined,
  shape: "circle" | undefined
): Look => ({
  host: (item, p) => reveal(item, p, from, shape),
  rider: waits,
  channels: boxFieldsOf,
  fits: (item) => {
    const circle = shape === "circle";
    if (item === (circle ? "ellipse" : "rect")) return;
    throw new Error(
      `[gofish] Animation.wipe(${
        circle ? `{ shape: "circle" }` : `{ from: "${from}" }`
      }): ` +
        (circle
          ? `a circular reveal is built for circles (it grows the radius)`
          : `a side wipe is built for rects (it clips the box)`) +
        `, and this mark ${drawnAs(item)}. Use Animation.fadeIn() or ` +
        `Animation.appear() for it. A general clip needs a clip item in the ` +
        `display list, which this prototype does not have.`
    );
  },
});

/** What each effect kind does. `grow` scales the mark's size axes from its
 *  baseline (a mark with no data size grows from its center), `shrink` is
 *  `grow` reversed, `fadeIn`/`fadeOut` take opacity from 0 to the mark's own
 *  and back, `appear` shows the mark at once at its start (and holds for its
 *  duration, which only matters to what waits for it), and `wipe` reveals the
 *  mark from one side or, with `shape: "circle"`, from its center. */
const LOOKS: Record<EffectKind, (v: EffectValue) => Effect> = {
  grow: (v) => effect(v, collapsing("grow")),
  shrink: (v) => effect(v, reversed(collapsing("shrink"))),
  fadeIn: (v) => effect(v, fading),
  fadeOut: (v) => effect(v, reversed(fading)),
  appear: (v) => effect(v, fading, (t) => (t >= 0 ? 1 : 0)),
  wipe: (v) =>
    effect(
      v,
      revealing(
        v.shape === undefined ? (v.from ?? "bottom") : undefined,
        v.shape
      )
    ),
};

/** The effect each value describes, by the value: the marks one written
 *  value animates share one effect, which a field-valued duration's scale is
 *  over (`timeLeaves` in install.ts). */
const effects = new WeakMap<object, Effect>();

/** The effect an effect value describes. */
export function effectOf(v: EffectValue): Effect {
  let e = effects.get(v);
  if (e === undefined) effects.set(v, (e = LOOKS[v.kind](v)));
  return e;
}

/** An `enter` / `exit` value, which may be one effect or several played
 *  together, as a list. */
export function effectList(
  value: EffectValue | EffectValue[] | undefined,
  where: string
): Effect[] | undefined {
  if (value === undefined) return undefined;
  const list: unknown[] = Array.isArray(value) ? value : [value];
  return list.map((e) => {
    const kind = (e as { kind?: unknown } | null)?.kind;
    if (typeof kind !== "string" || !Object.hasOwn(LOOKS, kind)) {
      throw new Error(
        `[gofish] ${where}: expected animation effects (Animation.grow(), ` +
          `Animation.fadeIn(), …)` +
          (kind === "tween" ? `; Animation.tween() is for \`update\`.` : `.`)
      );
    }
    return effectOf(e as EffectValue);
  });
}

/** The mark's frame at rest, which a geometric effect collapses toward. */
export type EffectFrame = {
  /** Pixel coordinate of the mark's baseline (its local 0) on each axis. */
  baseline: [number, number];
  /** Which axes carry a data SIZE, i.e. collapse toward the baseline. */
  sizeAxes: [boolean, boolean];
};

type Box = { x0: number; x1: number; y0: number; y1: number };

const boxOf = (item: DisplayList.DisplayItem): Box | undefined => {
  if (item.kind === "rect")
    return { x0: item.x, x1: item.x + item.w, y0: item.y, y1: item.y + item.h };
  if (item.kind === "ellipse")
    return {
      x0: item.cx - item.rx,
      x1: item.cx + item.rx,
      y0: item.cy - item.ry,
      y1: item.cy + item.ry,
    };
  return undefined;
};

/** The fields that hold a box item's box, which a geometric effect reshapes
 *  (`withBox` writes them). Its other items it leaves as they are. */
const BOX_FIELDS: Partial<
  Record<DisplayList.DisplayItem["kind"], readonly string[]>
> = {
  rect: ["x", "y", "w", "h"],
  ellipse: ["cx", "cy", "rx", "ry"],
};
const boxFieldsOf = (item: DisplayList.DisplayItem): readonly string[] =>
  BOX_FIELDS[item.kind] ?? [];

const withBox = (
  item: DisplayList.DisplayItem,
  b: Box
): DisplayList.DisplayItem => {
  const [xa, xb] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1)];
  const [ya, yb] = [Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
  if (item.kind === "rect")
    return { ...item, x: xa, y: ya, w: xb - xa, h: yb - ya };
  if (item.kind === "ellipse")
    return {
      ...item,
      cx: (xa + xb) / 2,
      cy: (ya + yb) / 2,
      rx: (xb - xa) / 2,
      ry: (yb - ya) / 2,
    };
  return item;
};

/** Scale a box by `s` about the baseline on each size axis, or about its
 *  center on both axes when it has no size axis. `s = 1` is exact. */
function collapse(
  item: DisplayList.DisplayItem,
  s: number,
  frame: EffectFrame
): DisplayList.DisplayItem {
  if (s === 1) return item;
  const b = boxOf(item);
  if (b === undefined) return item;
  const [sx, sy] = frame.sizeAxes;
  const any = sx || sy;
  const toward = (a: number, origin: number) => origin + s * (a - origin);
  const ox = sx ? frame.baseline[0] : (b.x0 + b.x1) / 2;
  const oy = sy ? frame.baseline[1] : (b.y0 + b.y1) / 2;
  return withBox(item, {
    x0: sx || !any ? toward(b.x0, ox) : b.x0,
    x1: sx || !any ? toward(b.x1, ox) : b.x1,
    y0: sy || !any ? toward(b.y0, oy) : b.y0,
    y1: sy || !any ? toward(b.y1, oy) : b.y1,
  });
}

/** The part of the mark a wipe has revealed at progress `p`. */
function reveal(
  item: DisplayList.DisplayItem,
  p: number,
  from: WipeSide | undefined,
  shape: "circle" | undefined
): DisplayList.DisplayItem {
  if (p === 1) return item;
  if (shape === "circle" && item.kind === "ellipse")
    return { ...item, rx: item.rx * p, ry: item.ry * p };
  if (item.kind !== "rect") return item;
  const { x, y, w, h } = item;
  switch (from) {
    case "top":
      return { ...item, h: h * p };
    case "left":
      return { ...item, w: w * p };
    case "right":
      return { ...item, x: x + w * (1 - p), w: w * p };
    default:
      return { ...item, y: y + h * (1 - p), h: h * p };
  }
}

/** Where a timed effect is at local time `t` (ms since the mark's start). */
const progressOf = ({ effect, duration, ease }: TimedEffect, t: number) =>
  effect.progress(t, duration, ease);

/**
 * One of the mark's own items at local time `t`. Effects compose in order:
 * geometric ones reshape the item, opacity ones multiply its opacity.
 */
export function paintHost(
  item: DisplayList.DisplayItem,
  effects: TimedEffect[],
  t: number,
  frame: EffectFrame
): DisplayList.DisplayItem {
  let out = item;
  for (const e of effects) out = e.effect.host(out, progressOf(e, t), frame);
  return out;
}

/**
 * An item ATTACHED to the mark (its label) at local time `t`. A label follows
 * its mark's timing: it fades or appears with it, and for a geometric effect
 * it waits until the mark has arrived.
 */
export function paintRider(
  item: DisplayList.DisplayItem,
  effects: TimedEffect[],
  t: number
): DisplayList.DisplayItem {
  let factor = 1;
  for (const e of effects) factor *= e.effect.rider(progressOf(e, t));
  return fadeItem(item, factor);
}

/** The display-item fields an effect list can change on `item`: what the
 *  paint tier has to patch. A rider only ever changes its opacity. */
export function channelsOf(
  item: DisplayList.DisplayItem,
  effects: TimedEffect[],
  role: "host" | "rider"
): string[] {
  const out = new Set<string>();
  for (const { effect } of effects) {
    for (const c of role === "host" ? effect.channels(item) : ["opacity"])
      out.add(c);
  }
  return [...out];
}
