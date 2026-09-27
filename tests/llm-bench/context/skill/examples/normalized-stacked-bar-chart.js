// Normalized Stacked Bar Chart
// A normalized stacked bar chart showing the male and female proportion of the US population within each age group, with every bar scaled to a full height of one.

import {
  chart,
  derive,
  field,
  palette,
  rect,
  spread,
  stack,
} from "gofish-graphics";
import data from "vega-datasets";
(async () => {
  const loaded = { population: await data["population.json"]() };
  const context = { loaded };
  const container = document.getElementById("app");
  chart(
    context.loaded.population.filter((row) => row.year === 2000),
    { axes: true, color: palette({ Female: "#675193", Male: "#ca8861" }) },
  )
    .flow(
      derive((d) =>
        d.map((row) => ({ ...row, sex: row.sex === 1 ? "Male" : "Female" })),
      ),
      spread({ by: "age", dir: "x" }),
      stack({ by: "sex", dir: "y", size: field("people").normalize() }),
    )
    .mark(rect({ fill: "sex" }))
    .render(container, { w: 500, h: 300 });
})();
