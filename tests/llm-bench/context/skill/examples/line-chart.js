// Line Chart
// A line chart tracing the average US price of gasoline year by year from 1956 to 2010, with the line ascending in chronological order to show how prices rose and fell over time.

import { chart, line, scatter } from "gofish-graphics";
import { drivingShifts } from "./dataset";
const container = document.getElementById("app");
chart(drivingShifts, { axes: true })
  .flow(scatter({ by: "year", x: "year", y: "gas" }))
  .mark(line({ stroke: "steelblue", strokeWidth: 2 }))
  .render(container, {
    w: 500,
    h: 400,
  });
