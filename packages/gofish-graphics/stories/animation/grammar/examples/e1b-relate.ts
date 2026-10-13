// E1b. Stacked <-> grouped bars, as a layer whose children are placed in
// time by .relate() clauses. Each chart holds, then morphs into the next.
// The third child is the stacked chart again, so a looping clock wraps onto
// an identical frame.
import {
  Animation,
  chart,
  layer,
  rect,
  spread,
  stack,
  time,
} from "../../../../src/lib";
import { seafood } from "../../../../src/data/catch";
import type { TimelineClock } from "./clock";

const stacked = () =>
  chart(seafood)
    .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
    .mark(rect({ h: "count", fill: "species" }));

const grouped = () =>
  chart(seafood)
    .flow(
      spread({ by: "lake", dir: "x" }),
      spread({ by: "species", dir: "x", spacing: 0 })
    )
    .mark(rect({ h: "count", fill: "species" }));

void Animation;

export default (container: HTMLElement, clock?: TimelineClock) =>
  layer([
    stacked().name("stacked"),
    grouped().name("grouped"),
    stacked().name("back"),
  ])
    .relate(({ stacked, grouped, back }) => [
      time.after(stacked, grouped, { gap: 1800 }),
      time.transition(stacked, grouped, { duration: 1000, ease: "cubicInOut" }),
      time.after(grouped, back, { gap: 1800 }),
      time.transition(grouped, back, { duration: 1000, ease: "cubicInOut" }),
    ])
    .render(container, { w: 480, h: 280, loop: true, ...clock } as any);
