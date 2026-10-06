// Simple Bar Chart
// A simple vertical bar chart with one bar per category, each bar's height encoding its value.

import { chart, rect, spread } from "gofish-graphics";
const values = [
  { a: "A", b: 28 },
  { a: "B", b: 55 },
  { a: "C", b: 43 },
  { a: "D", b: 91 },
  { a: "E", b: 81 },
  { a: "F", b: 53 },
  { a: "G", b: 19 },
  { a: "H", b: 87 },
  { a: "I", b: 52 },
];
const container = document.getElementById("app");
chart(values, { axes: true })
  .flow(spread({ by: "a", dir: "x" }))
  .mark(rect({ h: "b" }))
  // Intentionally omit width to cover the rect default-width fallback path.
  .render(container, { h: 300 });
