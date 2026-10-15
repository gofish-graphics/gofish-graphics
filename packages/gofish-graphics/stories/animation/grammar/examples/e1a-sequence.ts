// E1a. Stacked <-> grouped bars, as a sequence of two charts.
// Each child is a keyframe; the tween moves every bar matched by its data
// key (lake/species) from one chart to the other. `cyclic` lets the last
// child move on into the first, so the loop has no seam. Each chart rests
// for its `hold` (800 ms of its 2000 ms share) before it moves on.
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
    .sequence({ duration: 4000, cyclic: true, hold: 800, ...clock }, [
      stacked,
      grouped,
    ])
    .transition({ update: Animation.tween({ ease: "cubicInOut" }) })
    .render(container, { w: 480, h: 280 });
