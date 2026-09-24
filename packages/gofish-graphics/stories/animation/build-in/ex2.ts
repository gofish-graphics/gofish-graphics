// 2. THE TARGET. Bars grow one after another, left to right, overlapping.
import {
  animation,
  chart,
  rect,
  spread,
  time,
  type BuildClockOptions,
} from "../../../src/lib";
import { alphabet } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(alphabet)
    .flow(
      spread({ by: "letter", dir: "x" }).transition({
        enter: time.stagger({ lag: 60 }),
      })
    )
    .mark(
      rect({ h: "frequency" }).transition({
        enter: animation.grow({ duration: 600 }),
      })
    )
    .render(container, { w: 480, h: 220, axes: true, ...clock });
