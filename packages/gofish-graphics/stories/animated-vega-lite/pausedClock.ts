import { timer } from "../../src/lib";

/** A paused clock parked at `at`: the deterministic playhead a still frame of
 *  an animation is drawn at, in place of a clock that would be playing. */
export const pausedClock = (
  domain: [number, number],
  duration: number,
  at: number
) => {
  const clock = timer({ domain, duration, playing: false });
  clock.set(at);
  return clock;
};
