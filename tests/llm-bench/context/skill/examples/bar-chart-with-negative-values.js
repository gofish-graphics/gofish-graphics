// Bar Chart with Negative Values
// A bar chart whose values span positive and negative, with bars extending above and below the zero baseline.

import { chart, rect, spread } from "gofish-graphics";
const container = document.getElementById("app");
const testData = [
  { category: "A", value: -30 },
  { category: "B", value: 80 },
  { category: "C", value: 45 },
  { category: "D", value: 60 },
  { category: "E", value: 20 },
];
chart(testData, { axes: true })
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }))
  .render(container, {
    w: 400,
    h: 400,
  });
