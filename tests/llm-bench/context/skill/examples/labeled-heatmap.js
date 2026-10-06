// Labeled Heatmap
// A day-by-hour heatmap shaded along a blue gradient with each cell's value labeled in auto-contrasting text.

import { chart, gradient, rect, table } from "gofish-graphics";
const heatData = ["Mon", "Tue", "Wed", "Thu", "Fri"].flatMap((day, di) =>
  ["9am", "12pm", "3pm"].map((hour, hi) => ({
    day,
    hour,
    value: [42, 78, 55, 91, 33, 67, 24, 89, 61, 15, 74, 48, 36, 83, 70][
      di * 3 + hi
    ],
  })),
);
const container = document.getElementById("app");
chart(heatData, { color: gradient(["#e0f3ff", "#08519c"]), axes: true })
  .flow(table({ by: { x: "hour", y: "day" }, spacing: 4 }))
  .mark(
    rect({ fill: "value" }).label("value", {
      position: "center",
      fontSize: 11,
    }),
  )
  .render(container, { w: 420, h: 280 });
