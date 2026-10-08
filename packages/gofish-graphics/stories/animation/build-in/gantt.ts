// CAST+ Gantt. Tasks wipe in from the left one after another, and each wipe
// lasts in proportion to the task's length.
import {
  chart,
  field,
  rect,
  spread,
  time,
  type BuildClockOptions,
  Animation,
} from "../../../src/lib";
import { tasks } from "./data";

export default (container: HTMLElement, clock?: BuildClockOptions) =>
  chart(tasks)
    .flow(
      spread({ by: field("task").sort("start"), dir: "y" }).transition({
        enter: time.stagger({ spacing: 0 }),
      })
    )
    .mark(
      rect({ x: "start", w: "days" }).transition({
        enter: Animation.wipe({ from: "left", duration: "days" }),
      })
    )
    .render(container, { w: 480, h: 220, axes: true, ...clock });
