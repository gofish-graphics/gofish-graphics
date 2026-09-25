// Canis Fig. 1b. One series after another; inside each, bars 100 ms apart. REGROUPS, so a selection.
import {
  animation,
  chart,
  rect,
  selectAll,
  spread,
  stack,
  time,
  type BuildClockOptions,
} from "../../../src/lib";
import { sales } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(sales)
    .flow(
      spread({ by: "quarter", dir: "x" }),
      stack({ by: "product", dir: "y" })
    )
    .mark(rect({ h: "revenue", fill: "product" }).name("bars"))
    .layer(
      chart(selectAll("bars"))
        .flow(
          time.stagger({ by: "product", spacing: 0 }), // groupBy class, start after previous
          time.stagger({ by: "quarter", lag: 100 }) // groupBy id, delay 100
        )
        .mark(time.transition({ enter: animation.wipe({ from: "bottom" }) }))
    )
    .render(container, { w: 400, h: 240, axes: true, ...clock });
