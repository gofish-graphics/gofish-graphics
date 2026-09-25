// CAST Fig. 3. Dots appear one at a time, 100 ms apart, in order of a value.
import {
  animation,
  chart,
  circle,
  field,
  scatter,
  time,
  type BuildClockOptions,
} from "../../../src/lib";
import { chinstraps } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(chinstraps)
    .flow(
      scatter({ x: "beakLength", y: "beakDepth" }).transition({
        enter: time.stagger({ by: field("mass").sort(), lag: 100 }),
      })
    )
    .mark(
      circle({ r: 4, fill: "sex" }).transition({
        enter: animation.wipe({ shape: "circle", duration: 500 }),
      })
    )
    .render(container, { w: 420, h: 260, axes: true, ...clock });
