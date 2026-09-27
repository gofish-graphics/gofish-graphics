// Aggregate Bar Chart
// A horizontal bar chart of the US population by age group in the year 2000, with each bar's length encoding the total number of people.

import { chart, rect, spread } from "gofish-graphics";
import data from "vega-datasets";
(async () => {
  const loaded = { population: await data["population.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  const year2000 = context.loaded.population.filter((d) => d.year === 2000);
  chart(year2000, { axes: true })
    .flow(spread({ by: "age", dir: "y", reverse: true }))
    .mark(rect({ w: "people" }))
    .render(container, { w: 500, h: 300 });
})();
