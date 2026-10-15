/**
 * Helpers shared by the animation tests that render through the built library
 * (`connectedScatterplot.test.ts`, `gapminderTower.test.ts`). The headless DOM
 * is set up first, for the reason `interactionDomSetup.ts` gives.
 */
import "./interactionDomSetup";
// @ts-ignore -- dist may not exist at typecheck time; the test scripts build first.
import * as GoFish from "../../dist/index.js";

const { timer } = GoFish as any;

/** A paused clock parked at `at`: the deterministic playhead a still frame of
 *  an animation is drawn at. It does not loop, so parked at the end of its
 *  domain it reads back as the end rather than folding to the start. */
export function pausedClock(
  domain: [number, number],
  duration: number,
  at: number
) {
  const clock = timer({ domain, duration, playing: false, loop: false });
  clock.set(at);
  return clock;
}

/** Every item of a display list, flattened, in document order. */
export function items(doc: any): any[] {
  const out: any[] = [];
  const walk = (n: any): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n === null || typeof n !== "object") return;
    if (n.kind !== undefined) out.push(n);
    if (n.items) walk(n.items);
    if (n.children) walk(n.children);
  };
  walk(doc.items ?? doc);
  return out;
}
