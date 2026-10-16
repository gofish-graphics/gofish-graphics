// E1c. Stacked <-> grouped with a per-lake delay (Bostock): the lake spread's
// own `.transition({ update: time.stagger(...) })` staggers the moves inside
// each step, the way it staggers the bar chart race's re-sort.
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

const lakes = () =>
  spread({ by: "lake", dir: "x" }).transition({
    update: time.stagger({ lag: 150 }),
  });

const stacked = chart(seafood)
  .flow(lakes(), stack({ by: "species", dir: "y" }))
  .mark(rect({ h: "count", fill: "species" }));

const grouped = chart(seafood)
  .flow(lakes(), spread({ by: "species", dir: "x", spacing: 0 }))
  .mark(rect({ h: "count", fill: "species" }));

export default (container: HTMLElement, clock?: SequenceClock) =>
  time
    .sequence({ gap: 2000, cyclic: true, ...clock }, [stacked, grouped])
    .transition({ update: Animation.tween({ ease: "cubicInOut" }) })
    .render(container, { w: 480, h: 280 });
