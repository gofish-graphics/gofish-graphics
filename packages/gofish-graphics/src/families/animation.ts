/**
 * The `Animation` family: WHAT changes as a mark enters, leaves, or moves,
 * named by what it does. Its members are the values of `.transition()`'s
 * `enter`, `exit` and `update` options. WHEN is the `time` namespace
 * (`time.stagger`, `time.parallel`, `time.sequence`, `time.transition`).
 *
 *   rect({ h: "frequency" }).transition({ enter: Animation.grow({ duration: 600 }) })
 *
 * `lib.ts` binds this module as `Animation`, and `gofish-graphics/animation`
 * exports the same module. JS-only, like the rest of the animation surface.
 * The effects themselves are in `animation/effects.ts`.
 */
import { time, type TransitionOptions } from "../ast/marks/time";
import { resolveMethod } from "../interpolate";
import {
  resolveEase,
  type Ease,
  type Effect,
  type TweenEffect,
} from "../animation/effects";

export {
  appear,
  fadeIn,
  fadeOut,
  grow,
  shrink,
  wipe,
} from "../animation/effects";
export type { EffectOptions, WipeOptions } from "../animation/effects";

/** An animation value: `enter` and `exit` take the effects (`grow()`,
 *  `fadeIn()`, `wipe()`, ...), and `update` takes `tween()`. */
export type Animation = Effect | TweenEffect;

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
export const tween = (opts: TweenOptions = {}): TweenEffect => {
  const ease = opts.ease === undefined ? undefined : resolveEase(opts.ease);
  // An unknown curve fails here, where it was written, and the resolved one
  // is what tells two tweens apart (`sameTween`).
  const curve = resolveMethod(opts.curve, "Animation.tween({ curve })");
  const effect: TweenEffect = {
    __tween: true,
    curve,
    ease,
    layer: () => time.transition({ curve: opts.curve, ease, moves: effect }),
  };
  return effect;
};
