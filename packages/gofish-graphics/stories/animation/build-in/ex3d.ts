// 3d. Pop in one at a time, no motion (Keynote "Appear").
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
        enter: time.stagger({ lag: 120 }),
      })
    )
    .mark(rect({ h: "frequency" }).transition({ enter: Animation.appear() }))
    .render(container, { w: 480, h: 220, axes: true, ...clock });
