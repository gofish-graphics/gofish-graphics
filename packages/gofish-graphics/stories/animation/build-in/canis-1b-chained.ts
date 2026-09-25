// Canis Fig. 1b's bars timed the way the chart is nested: whole stacks, bottom segment first.
import {
  animation,
  chart,
  rect,
  spread,
  stack,
  time,
  type BuildClockOptions,
} from "../../../src/lib";
import { sales } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(sales)
    .flow(
      spread({ by: "quarter", dir: "x" }).transition({
        enter: time.stagger({ lag: 100 }),
      }),
      stack({ by: "product", dir: "y" }).transition({
        enter: time.stagger({ spacing: 0 }),
      })
    )
    .mark(
      rect({ h: "revenue", fill: "product" }).transition({
        enter: animation.wipe({ from: "bottom" }),
      })
    )
    .render(container, { w: 400, h: 240, axes: true, ...clock });
