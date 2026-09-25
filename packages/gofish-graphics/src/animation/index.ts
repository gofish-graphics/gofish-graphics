/**
 * The `animation` namespace: WHAT changes as a mark enters (or moves), named
 * by what it does. WHEN is the `time` namespace (`time.stagger`,
 * `time.parallel`, `time.sequence`, `time.transition`).
 *
 *   rect({ h: "frequency" }).transition({ enter: animation.grow({ duration: 600 }) })
 *
 * PROTOTYPE (draft PR #901): JS-only, like the rest of the animation surface.
 */
import { time, type TransitionOptions } from "../ast/marks/time";
import {
  appear,
  fadeIn,
  fadeOut,
  grow,
  resolveEase,
  shrink,
  wipe,
  type Ease,
  type TweenEffect,
} from "./effects";

export type TweenOptions = {
  /** How the mark's run is read between keyframes, as for
   *  `time.transition({ curve })`. */
  curve?: TransitionOptions["curve"];
  /** A time warp inside each keyframe interval. Default none, as for
   *  `time.transition()`. */
  ease?: Ease;
};

/** How a mark moves between two keyframes of a `time.sequence`: the update
 *  phase. `rect(...).transition({ update: animation.tween({ curve: "linear" })
 *  })` is `.layer(time.transition({ curve: "linear" }))`. */
const tween = (opts: TweenOptions = {}): TweenEffect => {
  const ease = opts.ease === undefined ? undefined : resolveEase(opts.ease);
  return {
    __tween: true,
    layer: () => time.transition({ curve: opts.curve, ease }),
  };
};

export const animation = {
  grow,
  shrink,
  fadeIn,
  fadeOut,
  appear,
  wipe,
  tween,
};

export type {
  Effect,
  EffectOptions,
  WipeOptions,
  WipeSide,
  Ease,
  TweenEffect,
} from "./effects";
export type {
  MarkTransition,
  OperatorTransition,
  TimeArrangement,
} from "./transition";
export type { StaggerOptions } from "./timeArrangements";
export type { BuildClockOptions } from "./install";
