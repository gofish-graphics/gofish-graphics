// E3. A sequence with a fixed total, fitted the way a spread with a fixed
// `w` fits its children. The scenes' durations are DATA amounts (weights 1
// and 2), so they are the part that flexes; the gaps (1200 ms each) are
// spacing and stay fixed. 6000 = σ · (1 + 2) + 2 · 1200, so σ = 1200 ms per
// unit: the stacked chart is on screen for 1200 ms and the grouped one for
// 2400 ms.
import {
  Animation,
  chart,
  datum,
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
    .sequence({ duration: 6000, gap: 1200, cyclic: true, ...clock }, [
      stacked.duration(datum(1)),
      grouped.duration(datum(2)),
    ])
    .transition({ update: Animation.tween({ ease: "cubicInOut" }) })
    .render(container, { w: 480, h: 280 });
