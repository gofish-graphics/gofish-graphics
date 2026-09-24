/**
 * `animation.*` — WHAT changes while a mark enters. Each effect is a plain
 * value, named by what it does (grow / shrink, fadeIn / fadeOut), not by the
 * phase it is used in, so one can be defined once and reused
 * (`const growIn = animation.grow({ duration: 600 })`).
 *
 * An effect is read at PAINT time: layout runs once, and the effect maps the
 * display items a mark lowered at rest to the items it shows at a progress
 * `p` in [0, 1] (see `paint.ts`, which schedules `p` from the build clock).
 * `p = 0` is the ENTER state the mark shows before its turn; `p = 1` is the
 * mark as laid out, which it keeps once it has arrived.
 *
 * WHEN is not here: that is `time.*` (`time.stagger`, `time.parallel`).
 */
import type { DisplayList } from "gofish-ir";

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

export type WipeSide = "bottom" | "top" | "left" | "right";

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

/** One effect, resolved: what it does, how long it takes, and its warp. */
export type Effect = {
  readonly __effect: true;
  kind: EffectKind;
  duration: number;
  /** A field-valued duration (see `EffectOptions.duration`), resolved per
   *  mark when the build is installed; `duration` is NaN until then. */
  durationField?: string;
  ease: (u: number) => number;
  from?: WipeSide;
  shape?: "circle";
  /** The options as written, so a context that fixes the timing itself (a
   *  sequence's fade over a whole stretch) can refuse a duration it would
   *  otherwise ignore. */
  written: EffectOptions;
};

/** `animation.tween(...)`: how a mark MOVES between two keyframes of a
 *  `time.sequence` (the update phase). It is the chained spelling of today's
 *  `.layer(time.transition({ curve, ease }))`, and like it keeps
 *  `time.transition`'s defaults (the auto curve, no ease). `layer` builds that
 *  transition tier; it is bound where the `time` namespace is in reach
 *  (`animation/index.ts`), so the chart builder can use it without importing
 *  `time` (which would cycle). */
export type TweenEffect = {
  readonly __effect: true;
  kind: "tween";
  curve?: "auto" | "step" | "linear" | "catmullRom";
  ease?: (u: number) => number;
  layer: () => unknown;
};

export const DEFAULT_DURATION = 500;

function effect(
  kind: EffectKind,
  opts: EffectOptions & { from?: WipeSide; shape?: "circle" } = {}
): Effect {
  const field = typeof opts.duration === "string" ? opts.duration : undefined;
  const duration =
    typeof opts.duration === "string"
      ? NaN
      : (opts.duration ?? DEFAULT_DURATION);
  if (field === undefined && !(Number.isFinite(duration) && duration >= 0)) {
    throw new Error(
      `[gofish] animation.${kind}({ duration: ${String(opts.duration)} }): a ` +
        `duration is a number of milliseconds, 0 or more, or a field name.`
    );
  }
  return {
    __effect: true,
    kind,
    duration,
    ...(field !== undefined ? { durationField: field } : {}),
    ease: resolveEase(opts.ease),
    written: { duration: opts.duration, ease: opts.ease },
    ...(opts.from !== undefined ? { from: opts.from } : {}),
    ...(opts.shape !== undefined ? { shape: opts.shape } : {}),
  };
}

/** Collapse the mark's SIZE axes toward its baseline, then let it grow to its
 *  laid-out size. A bar grows up from 0 (down, for a negative value); a
 *  stacked segment grows in place from its own stack start. A mark with no
 *  data size (a fixed-radius dot) has no baseline, so it grows from its
 *  center. */
export const grow = (opts?: EffectOptions): Effect => effect("grow", opts);
/** `grow` reversed: from the laid-out size down to the baseline. */
export const shrink = (opts?: EffectOptions): Effect => effect("shrink", opts);
/** Opacity from 0 to the mark's own. */
export const fadeIn = (opts?: EffectOptions): Effect => effect("fadeIn", opts);
/** Opacity from the mark's own to 0. */
export const fadeOut = (opts?: EffectOptions): Effect =>
  effect("fadeOut", opts);
/** No motion: hidden until the mark's start, then shown at once (Keynote and
 *  PowerPoint "Appear"). It holds for its duration, which only matters to
 *  what waits for it. */
export const appear = (opts?: EffectOptions): Effect => effect("appear", opts);
/** Reveal the mark from one side (a clip), or from its center outward with
 *  `shape: "circle"`. */
export const wipe = (opts: WipeOptions = {}): Effect =>
  effect("wipe", {
    ...opts,
    from: opts.shape === undefined ? (opts.from ?? "bottom") : undefined,
  });

export const isEffect = (v: unknown): v is Effect | TweenEffect =>
  typeof v === "object" && v !== null && (v as Effect).__effect === true;

/** An `enter` / `exit` value, which may be one effect or several played
 *  together, as a list. */
export function effectList(
  value: Effect | Effect[] | undefined,
  where: string
): Effect[] | undefined {
  if (value === undefined) return undefined;
  const list: unknown[] = Array.isArray(value) ? value : [value];
  for (const e of list) {
    if (!isEffect(e) || e.kind === "tween") {
      throw new Error(
        `[gofish] ${where}: expected animation effects (animation.grow(), ` +
          `animation.fadeIn(), …)` +
          (isEffect(e) ? `; animation.tween() is for \`update\`.` : `.`)
      );
    }
  }
  return list as Effect[];
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
  e: Effect
): DisplayList.DisplayItem {
  if (p === 1) return item;
  if (e.shape === "circle" && item.kind === "ellipse")
    return { ...item, rx: item.rx * p, ry: item.ry * p };
  if (item.kind !== "rect") return item;
  const { x, y, w, h } = item;
  switch (e.from) {
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

const withOpacity = (
  item: DisplayList.DisplayItem,
  factor: number
): DisplayList.DisplayItem =>
  factor === 1
    ? item
    : {
        ...item,
        style: { ...item.style, opacity: (item.style?.opacity ?? 1) * factor },
      };

/** Where an effect is at local time `t` (ms since the mark's start): its
 *  eased progress, 0 before the start and 1 from the end on. */
export function progressOf(e: Effect, t: number): number {
  const raw = e.duration > 0 ? t / e.duration : t >= 0 ? 1 : 0;
  if (!(raw > 0)) return 0;
  if (raw >= 1) return 1;
  return e.ease(raw);
}

/**
 * One of the mark's own items at local time `t`. Effects compose in order:
 * geometric ones reshape the item, opacity ones multiply its opacity.
 */
export function paintHost(
  item: DisplayList.DisplayItem,
  effects: Effect[],
  t: number,
  frame: EffectFrame
): DisplayList.DisplayItem {
  let out = item;
  for (const e of effects) {
    const p = progressOf(e, t);
    switch (e.kind) {
      case "grow":
        out = collapse(out, p, frame);
        break;
      case "shrink":
        out = collapse(out, 1 - p, frame);
        break;
      case "wipe":
        out = reveal(out, p, e);
        break;
      case "fadeIn":
        out = withOpacity(out, p);
        break;
      case "fadeOut":
        out = withOpacity(out, 1 - p);
        break;
      case "appear":
        out = withOpacity(out, t >= 0 ? 1 : 0);
        break;
    }
  }
  return out;
}

/**
 * An item ATTACHED to the mark (its label) at local time `t`. A label follows
 * its mark's timing: it fades or appears with it, and for a geometric effect
 * it waits until the mark has arrived (Highcharts' "labels wait") rather than
 * float beside a mark that is still growing. DECLARED PROTOTYPE BEHAVIOR:
 * riding the growing bar's end (issue #894) is not built.
 */
export function paintRider(
  item: DisplayList.DisplayItem,
  effects: Effect[],
  t: number
): DisplayList.DisplayItem {
  let factor = 1;
  for (const e of effects) {
    const p = progressOf(e, t);
    switch (e.kind) {
      case "fadeIn":
        factor *= p;
        break;
      case "fadeOut":
        factor *= 1 - p;
        break;
      case "appear":
        factor *= t >= 0 ? 1 : 0;
        break;
      case "shrink":
        factor *= p === 0 ? 1 : 0;
        break;
      default:
        factor *= p === 1 ? 1 : 0;
    }
  }
  return withOpacity(item, factor);
}

/** The display-item fields an effect list can change, per item kind: what
 *  the paint tier has to patch. */
export function channelsOf(
  kind: DisplayList.DisplayItem["kind"],
  effects: Effect[],
  role: "host" | "rider"
): string[] {
  const out = new Set<string>();
  for (const e of effects) {
    const geometric =
      e.kind === "grow" || e.kind === "shrink" || e.kind === "wipe";
    if (!geometric || role === "rider") out.add("opacity");
    else if (kind === "rect") ["x", "y", "w", "h"].forEach((f) => out.add(f));
    else if (kind === "ellipse")
      ["cx", "cy", "rx", "ry"].forEach((f) => out.add(f));
  }
  return [...out];
}

/** Can `effect` draw a mark of this node type? Checked when the build is
 *  installed, so a mismatch fails before anything paints. */
export function checkEffectFits(effect: Effect, nodeType: string): void {
  const boxy = nodeType === "rect" || nodeType === "blank";
  const round = nodeType === "ellipse";
  if (effect.kind === "grow" || effect.kind === "shrink") {
    if (boxy || round) return;
    throw new Error(
      `[gofish] animation.${effect.kind}(): collapses a rect or an ellipse ` +
        `toward its baseline, and this mark is a "${nodeType}". Use ` +
        `animation.fadeIn() or animation.appear() for it.`
    );
  }
  if (effect.kind === "wipe") {
    if (effect.shape === "circle" ? round : boxy) return;
    throw new Error(
      `[gofish] animation.wipe(${
        effect.shape === "circle"
          ? `{ shape: "circle" }`
          : `{ from: "${effect.from}" }`
      }): ` +
        (effect.shape === "circle"
          ? `a circular reveal is built for circles (it grows the radius)`
          : `a side wipe is built for rects (it clips the box)`) +
        `, and this mark is a "${nodeType}". A general clip needs a clip ` +
        `item in the display list, which this prototype does not have.`
    );
  }
}
