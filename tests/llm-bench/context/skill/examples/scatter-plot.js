// Scatter Plot
// A scatter plot of car horsepower against fuel efficiency in miles per gallon, revealing the downward trend between the two.

import { chart, circle, log, scatter } from "gofish-graphics";
import data from "vega-datasets";
(async () => {
  const loaded = { cars: await data["cars.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  const cars = context.loaded.cars.filter(
    (d) => d.Horsepower !== null && d.Miles_per_Gallon !== null,
  );
  chart(cars, { axes: true })
    .flow(
      log("cars before scatter"),
      scatter({
        by: "Name",
        x: "Horsepower",
        y: "Miles_per_Gallon",
        debug: true,
      }),
    )
    .mark(
      circle({
        r: 4,
        fill: "rgba(31, 119, 180, 0.4)", // semi‑transparent blue
        stroke: "#1f77b4",
        strokeWidth: 1,
      }),
    )
    .render(container, { w: 300, h: 300 });
})();
