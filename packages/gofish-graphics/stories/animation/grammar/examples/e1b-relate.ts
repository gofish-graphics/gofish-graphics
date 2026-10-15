// E1b. Stacked <-> grouped bars, as a timeline of scenes placed in time by
// .relate() clauses. Each chart is on screen for its hold, and a transition
// fills the gap after it. The third scene is the stacked chart again, with
// no hold, so a looping clock wraps onto an identical frame.
import { chart, rect, spread, stack, time, timeline } from "../../../../src/lib";
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

export default (container: HTMLElement, clock?: TimelineClock) =>
  timeline([
    stacked().name("stacked").hold(1800),
    grouped().name("grouped").hold(1800),
    stacked().name("back"),
  ])
    .relate(({ stacked, grouped, back }) => [
      time.after(stacked, grouped, { gap: 1000 }),
      time.transition(stacked, grouped, { ease: "cubicInOut" }),
      time.after(grouped, back, { gap: 1000 }),
      time.transition(grouped, back, { ease: "cubicInOut" }),
    ])
    .render(container, { w: 480, h: 280, loop: true, ...clock } as any);
