// 3c. Fix the shape instead of the lag: dwell 0.3.
import {
  chart,
  rect,
  spread,
  time,
  type BuildClockOptions,
  Animation,
} from "../../../src/lib";
import { alphabet } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(alphabet)
    .flow(
      spread({ by: "letter", dir: "x" }).transition({
        enter: time.stagger({ dwell: 0.3 }),
      })
    )
    .mark(
      rect({ h: "frequency" }).transition({
        enter: Animation.grow({ duration: 600 }),
      })
    )
    .render(container, { w: 480, h: 220, axes: true, ...clock });
