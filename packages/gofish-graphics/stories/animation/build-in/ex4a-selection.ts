// 4a, selection form: the same build, timed over the selected bars.
import {
  animation,
  chart,
  rect,
  selectAll,
  spread,
  time,
  type BuildClockOptions,
} from "../../../src/lib";
import { weather } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(weather)
    .flow(
      spread({ by: "month", dir: "x" }),
      spread({ by: "city", dir: "x", spacing: 0 })
    )
    .mark(rect({ h: "precipitation", fill: "city" }).name("bars"))
    .layer(
      chart(selectAll("bars"))
        .flow(time.stagger({ by: "month", lag: 300 }))
        .mark(time.transition({ enter: animation.grow({ duration: 400 }) }))
    )
    .render(container, { w: 560, h: 220, axes: true, ...clock });
