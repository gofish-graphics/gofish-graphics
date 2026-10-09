// 3b. From the middle outward.
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
        enter: time.stagger({ lag: 60, from: "center" }),
      })
    )
    .mark(
      rect({ h: "frequency" }).transition({
        enter: Animation.grow({ duration: 600 }),
      })
    )
    .render(container, { w: 480, h: 220, axes: true, ...clock });
