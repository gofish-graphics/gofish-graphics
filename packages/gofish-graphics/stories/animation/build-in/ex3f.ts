// 3f. Name the effect once and reuse it. Nothing new: it is a JS value.
import {
  animation,
  chart,
  rect,
  spread,
  time,
  type BuildClockOptions,
} from "../../../src/lib";
import { alphabet } from "./data";

const growIn = animation.grow({ duration: 600, ease: "cubicOut" });

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(alphabet)
    .flow(
      spread({ by: "letter", dir: "x" }).transition({
        enter: time.stagger({ lag: 60 }),
      })
    )
    .mark(rect({ h: "frequency" }).transition({ enter: growIn }))
    .render(container, { w: 480, h: 220, axes: true, ...clock });
