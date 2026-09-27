// Activity Heatmap
// A day-by-hour grid of activity values where each cell is shaded along a yellow-to-red intensity gradient.

import { chart, gradient, rect, table } from "gofish-graphics";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const hours = [
  "9am",
  "10am",
  "11am",
  "12pm",
  "1pm",
  "2pm",
  "3pm",
  "4pm",
  "5pm",
];
const rawValues = [
  10, 45, 72, 38, 90, 55, 20, 66, 30, 25, 60, 85, 42, 77, 33, 58, 14, 80, 50,
  22, 95, 68, 11, 74, 39, 47, 62, 18, 83, 41, 57, 29, 93, 64, 76, 15, 70, 35,
  52, 88, 23, 46, 81, 67, 44,
];
const heatmapData = days.flatMap((day, di) =>
  hours.map((hour, hi) => ({
    day,
    hour,
    value: rawValues[di * hours.length + hi],
  })),
);
const container = document.getElementById("app");
chart(heatmapData, {
  color: gradient(["#ffffcc", "#fd8d3c", "#bd0026"]),
  axes: true,
})
  .flow(table({ by: { x: "hour", y: "day" }, spacing: 4 }))
  .mark(rect({ fill: "value" }))
  .render(container, {
    w: 600,
    h: 400,
  });
