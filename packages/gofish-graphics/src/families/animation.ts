/**
 * The `Animation` family: WHAT changes as a mark enters, leaves, or moves,
 * named by what it does. Its members are the values of `.transition()`'s
 * `enter`, `exit` and `update` options. WHEN is the `time` namespace
 * (`time.stagger`, `time.parallel`, `time.sequence`, `time.transition`).
 *
 *   rect({ h: "frequency" }).transition({ enter: Animation.grow({ duration: 600 }) })
 *
 * `lib.ts` binds this module as `Animation`, and `gofish-graphics/animation`
 * exports the same module. Like every strategy family, a value is a plain
 * object, `{ kind, ...options }`, and that object is also its wire form (the
 * `Animation` family in gofish-ir's `STRATEGIES`); one with a function `ease`
 * is JS only. No member has a required option, so each is a value as it is,
 * and calling it sets options (`Animation.grow` is `Animation.grow()`). The
 * readers give a value its behavior: `effectOf` (`animation/effects.ts`) for
 * an effect, and for a tween the `time.transition` tier the chart builder
 * draws (`tweenTier` in `ast/marks/time.ts`).
 */
import type { TransitionOptions } from "../ast/marks/time";
import { resolveMethod } from "../interpolate";
import { bareKind, withKindValues } from "../ast/strategyKind";
import {
  checkEffectOptions,
  resolveEase,
  type Ease,
  type EffectKind,
  type EffectOptions,
  type EffectValue,
  type TweenValue,
  type WipeOptions,
} from "../animation/effects";

export type { EffectOptions, WipeOptions } from "../animation/effects";

/** An animation value: `enter` and `exit` take the effects (`grow()`,
 *  `fadeIn()`, `wipe()`, ...), and `update` takes `tween()`. */
export type Animation = EffectValue | TweenValue;

/** The options as written, without the ones left undefined, so a call with
 *  no options is the bare kind, key for key. */
const defined = <O extends object>(opts: O): O =>
  Object.fromEntries(
    Object.entries(opts).filter(([, v]) => v !== undefined)
  ) as O;

const effectKind = <K extends EffectKind>(kind: K) =>
  bareKind(
    `Animation.${kind}`,
    (opts: WipeOptions = {}): EffectValue & { kind: K } => {
      checkEffectOptions(kind, opts);
      return { kind, ...defined(opts) };
    }
  );

/** Grow from the mark's baseline to its laid-out size (from its center when
 *  it has no data size). */
export const grow = effectKind("grow") as unknown as ((
  opts?: EffectOptions
) => EffectValue) &
  EffectValue;
/** `grow` reversed: from the laid-out size down to the baseline. */
export const shrink = effectKind("shrink") as unknown as typeof grow;
/** Opacity from 0 to the mark's own. */
export const fadeIn = effectKind("fadeIn") as unknown as typeof grow;
/** `fadeIn` reversed: opacity from the mark's own to 0. */
export const fadeOut = effectKind("fadeOut") as unknown as typeof grow;
/** No motion: hidden until the mark's start, then shown at once (Keynote and
 *  PowerPoint "Appear"). It holds for its duration, which only matters to
 *  what waits for it. */
export const appear = effectKind("appear") as unknown as typeof grow;
/** Reveal the mark from one side (a clip), or from its center outward with
 *  `shape: "circle"`. */
export const wipe = effectKind("wipe") as unknown as ((
  opts?: WipeOptions
) => EffectValue) &
  EffectValue;

export type TweenOptions = {
  /** How the mark's run is read between keyframes, as for
   *  `time.transition({ curve })`. */
  curve?: TransitionOptions["curve"];
  /** A time warp inside each keyframe interval. Default none, as for
   *  `time.transition()`. */
  ease?: Ease;
};

/** How a mark moves between two keyframes of a `time.sequence`: the update
 *  phase. `rect(...).transition({ update: Animation.tween({ curve:
 *  Curve.linear() }) })` is `.layer(time.transition({ curve: Curve.linear()
 *  }))`. */
export const tween = bareKind(
  "Animation.tween",
  (opts: TweenOptions = {}): TweenValue => {
    // An unknown curve or ease fails here, where it was written.
    resolveMethod(opts.curve, "Animation.tween({ curve })");
    if (opts.ease !== undefined) resolveEase(opts.ease);
    return {
      kind: "tween",
      ...defined({ curve: withKindValues(opts.curve), ease: opts.ease }),
    };
  }
);
