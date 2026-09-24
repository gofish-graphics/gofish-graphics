// 5a. Whole stacks, left to right. Segments grow in place from their own stack start.
import {
  animation,
  chart,
  rect,
  spread,
  stack,
  time,
  type BuildClockOptions,
} from "../../../src/lib";
import { seattle } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(seattle)
    .flow(
      spread({ by: "month", dir: "x" }).transition({
        enter: time.stagger({ lag: 80 }),
      }),
      stack({ by: "weather", dir: "y" })
    )
    .mark(
      rect({ h: "count", fill: "weather" }).transition({
        enter: animation.grow({ duration: 500 }),
      })
    )
    .render(container, { w: 480, h: 240, axes: true, ...clock });
