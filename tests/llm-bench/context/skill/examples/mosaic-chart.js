// Mosaic Chart
// A mosaic plot of car counts by region of origin and cylinder count, where column widths show each region's share and stacked segments show the cylinder distribution within it.

import { chart, field, rect, stack } from "gofish-graphics";
const container = document.getElementById("app");
const data = [
  { origin: "Europe", cylinders: "4", count: 66 },
  { origin: "Europe", cylinders: "5", count: 3 },
  { origin: "Europe", cylinders: "6", count: 4 },
  { origin: "Japan", cylinders: "3", count: 4 },
  { origin: "Japan", cylinders: "4", count: 69 },
  { origin: "Japan", cylinders: "6", count: 6 },
  { origin: "USA", cylinders: "4", count: 72 },
  { origin: "USA", cylinders: "6", count: 74 },
  { origin: "USA", cylinders: "8", count: 108 },
];
chart(data, { axes: true })
  .flow(
    // Column widths ∝ each region's total (marginal): `size: "count"`
    // sizes each column by its raw Σcount. Stacked segments fill the
    // column, split by cylinder share (conditional): `size:
    // field("count").normalize()` replaces both the segment's raw count
    // AND its w/h — the wrapper's data-driven size claim fills the
    // column height in proportion to each cylinder group's share. No
    // preprocessing.
    stack({ by: "origin", dir: "x", size: "count" }),
    stack({ by: "cylinders", dir: "y", size: field("count").normalize() }),
  )
  .mark(rect({ fill: "origin", stroke: "white", strokeWidth: 2 }))
  .render(container, {
    w: 400,
    h: 400,
  });
