// The bar chart race, chained: the mark says how it moves between years.
// Under a time.sequence this is `.layer(time.transition({ curve: "linear" }))`.
import { animation, chart, field, rect, spread, time } from "../../../src/lib";
import { brands } from "./data";

export default (
  container: HTMLElement,
  clock?: { playing?: boolean; at?: number }
) =>
  chart(brands, { legend: false })
    .flow(
      time.sequence({ by: "year", duration: 20000, loop: false, ...clock }),
      spread({
        by: field("name").sort("value", "desc"),
        dir: "y",
        sharedScale: true,
        spacing: 2,
      })
    )
    .mark(
      rect({ w: "value", fill: "category" })
        .label("name", { position: "outset-right" })
        .transition({
          enter: animation.fadeIn(),
          update: animation.tween({ curve: "linear" }),
          exit: animation.fadeOut(),
        })
    )
    .render(container, { w: 600, h: 600, axes: { x: true, y: false } });
