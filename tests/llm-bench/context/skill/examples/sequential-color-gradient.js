// Sequential Color Gradient
// Ascending values as a bar chart whose fill interpolates along a sequential blues gradient.

import { chart, gradient, rect, spread } from "gofish-graphics";
const scores = [
  { label: "A", value: 4 },
  { label: "B", value: 12 },
  { label: "C", value: 28 },
  { label: "D", value: 47 },
  { label: "E", value: 63 },
  { label: "F", value: 81 },
  { label: "G", value: 90 },
  { label: "H", value: 100 },
];
const container = document.getElementById("app");
chart(scores, { color: gradient("blues"), axes: true })
  .flow(spread({ by: "label", dir: "x" }))
  .mark(rect({ h: "value", fill: "value" }))
  .render(container, { w: 400, h: 400 });
