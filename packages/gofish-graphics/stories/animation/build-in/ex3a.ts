// 3a. Tallest bar first: the stagger takes its own `by`.
import {
  animation,
  chart,
  field,
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
        enter: time.stagger({
          by: field("letter").sort("frequency", "desc"),
          lag: 60,
        }),
      })
    )
    .mark(
      rect({ h: "frequency" }).transition({
        enter: animation.grow({ duration: 600 }),
      })
    )
    .render(container, { w: 480, h: 220, axes: true, ...clock });
