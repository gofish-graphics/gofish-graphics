// 4b. One group at a time, and the bars inside each group staggered too.
import {
  chart,
  rect,
  spread,
  time,
  type BuildClockOptions,
  Animation,
} from "../../../src/lib";
import { weather } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(weather)
    .flow(
      spread({ by: "month", dir: "x" }).transition({
        enter: time.stagger({ lag: 300 }),
      }),
      spread({ by: "city", dir: "x", spacing: 0 }).transition({
        enter: time.stagger({ lag: 50 }),
      })
    )
    .mark(
      rect({ h: "precipitation", fill: "city" }).transition({
        enter: Animation.grow({ duration: 400 }),
      })
    )
    .render(container, { w: 560, h: 220, axes: true, ...clock });
