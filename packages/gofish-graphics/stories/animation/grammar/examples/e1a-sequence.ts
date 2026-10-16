// E1a. Stacked <-> grouped bars, as a sequence of two charts.
// Each child is a scene, on screen for its .duration(); a transition fills
// each 1200 ms gap and moves every bar, matched by the row it draws, from
// one chart to the other. `cyclic` lets the last scene move on into the
// first, so the loop (800 + 1200 + 800 + 1200 = 4000 ms) has no seam.
import {
  Animation,
  chart,
  rect,
  spread,
  stack,
  time,
} from "../../../../src/lib";
import { seafood } from "../../../../src/data/catch";
import type { SequenceClock } from "./clock";

const stacked = chart(seafood)
  .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));

const grouped = chart(seafood)
  .flow(
    spread({ by: "lake", dir: "x" }),
    spread({ by: "species", dir: "x", spacing: 0 })
  )
  .mark(rect({ h: "count", fill: "species" }));

export default (container: HTMLElement, clock?: SequenceClock) =>
  time
    .sequence({ gap: 1200, cyclic: true, ...clock }, [
      stacked.duration(800),
      grouped.duration(800),
    ])
    .transition({ update: Animation.tween({ ease: "cubicInOut" }) })
    .render(container, { w: 480, h: 280 });
