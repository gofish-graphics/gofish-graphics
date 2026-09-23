import { timer } from "../../src/lib";

/** A paused clock parked at `at`: the deterministic playhead a still frame of
 *  an animation is drawn at, in place of a clock that would be playing.
 *
 *  It does not loop. A paused clock never advances, so looping would matter
 *  only at the end of the domain, where a looping clock folds back to the
 *  start: parked at `domain[1]` it would read back as `domain[0]`. */
export const pausedClock = (
  domain: [number, number],
  duration: number,
  at: number
) => {
  const clock = timer({ domain, duration, playing: false, loop: false });
  clock.set(at);
  return clock;
};
