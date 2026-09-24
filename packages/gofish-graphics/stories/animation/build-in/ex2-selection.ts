// 2. The target, selection form.
import {
  animation,
  chart,
  rect,
  selectAll,
  spread,
  time,
  type BuildClockOptions,
} from "../../../src/lib";
import { alphabet } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(alphabet)
    .flow(spread({ by: "letter", dir: "x" }))
    .mark(rect({ h: "frequency" }).name("bars"))
    .layer(
      chart(selectAll("bars"))
        .flow(time.stagger({ by: "letter", lag: 60 }))
        .mark(time.transition({ enter: animation.grow({ duration: 600 }) }))
    )
    .render(container, { w: 480, h: 220, axes: true, ...clock });
