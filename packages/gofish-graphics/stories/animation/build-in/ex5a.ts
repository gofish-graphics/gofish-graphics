// 5a. Whole stacks, left to right. Segments grow in place from their own stack start.
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
  chart(seattle, { w: 480, h: 240 })
    .flow(
      spread({ by: "month", dir: "x" }).transition({
        enter: time.stagger({ lag: 80 }),
      }),
      stack({ by: "weather", dir: "y" })
    )
    .mark(
      rect({ h: "count", fill: "weather" }).transition({
        enter: Animation.grow({ duration: 500 }),
      })
    )
    .render(container, { ...clock });
