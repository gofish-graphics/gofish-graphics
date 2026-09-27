// Connected Scatter Plot
// A connected scatter plot tracing gas price against miles driven over successive years, with a line threading the points in chronological order to reveal the path through time.

import { chart, circle, line, scatter } from "gofish-graphics";
import { drivingShifts } from "./dataset";
const container = document.getElementById("app");
chart(drivingShifts, { axes: true })
  .flow(scatter({ by: "year", x: "miles", y: "gas" }))
  .mark(circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 }))
  .layer(line({ stroke: "black", strokeWidth: 2 }))
  .render(container, {
    w: 400,
    h: 400,
  });
