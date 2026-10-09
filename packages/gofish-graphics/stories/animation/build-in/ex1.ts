// 1. All bars grow at once (chained).
import {
  chart,
  rect,
  spread,
  type BuildClockOptions,
  Animation,
} from "../../../src/lib";
import { alphabet } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(alphabet)
    .flow(spread({ by: "letter", dir: "x" }))
    .mark(
      rect({ h: "frequency" }).transition({
        enter: Animation.grow({ duration: 600 }),
      })
    )
    .render(container, { w: 480, h: 220, axes: true, ...clock });
