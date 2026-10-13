// E1d. Heer & Robertson's two-stage transition: x first, then y. The stage
// between is an ordinary keyframe: the grouped layout in x, with each bar
// still at its stacked height in y (`below`, the counts under it).
import {
  Animation,
  chart,
  field,
  rect,
  spread,
  stack,
  time,
} from "../../../../src/lib";
import { seafood } from "../../../../src/data/catch";
import type { SequenceClock } from "./clock";

// The stacked offset of each bar: the counts of the species below it.
const withBelow = seafood.map((row, i) => ({
  ...row,
  below: seafood
    .slice(0, i)
    .filter((r) => r.lake === row.lake)
    .reduce((sum, r) => sum + r.count, 0),
}));

const stacked = chart(withBelow)
  .flow(spread({ by: "lake", dir: "x" }), stack({ by: "species", dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));

const xFirst = chart(withBelow)
  .flow(
    spread({ by: "lake", dir: "x" }),
    spread({ by: "species", dir: "x", spacing: 0 })
  )
  .mark(rect({ y: field("below", "count"), h: "count", fill: "species" }));

const grouped = chart(withBelow)
  .flow(
    spread({ by: "lake", dir: "x" }),
    spread({ by: "species", dir: "x", spacing: 0 })
  )
  .mark(rect({ h: "count", fill: "species" }));

export default (container: HTMLElement, clock?: SequenceClock) =>
  time
    .sequence({ duration: 6000, cyclic: true, ...clock }, [
      stacked,
      xFirst,
      grouped,
      xFirst,
    ])
    .transition({ update: Animation.tween({ ease: "cubicInOut" }) })
    .render(container, { w: 480, h: 280 });
