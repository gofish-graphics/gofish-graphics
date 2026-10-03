import { chart, spread, rect, clock, palette } from "gofish-graphics";

// The legend names the countries. (A `.label()` on the bars would not help:
// GoFish's text marks do not go through the polar transform, so the labels
// land in a column above the center instead of past each bar's end.)
export default function render(container, data) {
  return chart(data, {
    coord: clock({ innerRadius: 0.3 }),
    color: palette("tableau10"),
  })
    .flow(spread({ by: "country", dir: "x", spacing: 0.04 }))
    .mark(rect({ h: "exports", fill: "country" }))
    .render(container, { w: 440, h: 440 });
}
