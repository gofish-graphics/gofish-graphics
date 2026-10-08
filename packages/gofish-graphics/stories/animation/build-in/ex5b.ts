// 5b. Whole stacks left to right, and inside each stack the bottom segment first.
import {
  chart,
  rect,
  spread,
  stack,
  time,
  type BuildClockOptions,
  Animation,
} from "../../../src/lib";
import { seattle } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(seattle)
    .flow(
      spread({ by: "month", dir: "x" }).transition({
        enter: time.stagger({ lag: 80 }),
      }),
      stack({ by: "weather", dir: "y" }).transition({
        enter: time.stagger({ spacing: 0 }),
      })
    )
    .mark(
      rect({ h: "count", fill: "weather" }).transition({
        enter: Animation.grow({ duration: 200 }),
      })
    )
    .render(container, { w: 480, h: 240, axes: true, ...clock });
