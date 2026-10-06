// Normalized Stacked Bar with Labels
// US population by age group split into Male and Female shares, normalized so each horizontal bar spans 100% with raw counts labeled inside.

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
    {
      color: palette({ Female: "#675193", Male: "#ca8861" }),
      // Keep the continuous proportion x-axis at the bottom (y-end).
      axes: { x: { side: "end", title: "proportion" }, y: true },
    },
  )
    .flow(
      // Decode the sex field to a readable string
      derive((d) =>
        d.map((row) => ({ ...row, sex: row.sex === 1 ? "Male" : "Female" })),
      ),
      // One row per age group; y-down reads top→bottom, so age 0 lands at the
      // top (matching the Vega-Lite reference).
      spread({ by: "age", dir: "y", spacing: 2 }),
      // Female left, Male right; normalize within each age group so bars span 0→1
      stack({
        by: field("sex").sort(),
        dir: "x",
        size: field("people").normalize(),
      }),
    )
    .mark(
      rect({ fill: "sex" }).label(
        (d) => {
          const row = Array.isArray(d) ? d[0] : d;
          return row.people;
        },
        { position: "center", color: "white" },
      ),
    )
    .render(container, { w: 350, h: 400 });
})();
