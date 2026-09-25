// 4c. One city at a time across all months. REGROUPS, so it is a selection.
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
        .flow(time.stagger({ by: "city", spacing: 0 }))
        .mark(time.transition({ enter: animation.grow({ duration: 400 }) }))
    )
    .render(container, { w: 560, h: 220, axes: true, ...clock });
