// Marginal Histogram (Jointplot)
// A scatter plot of penguin beak length against beak depth framed by marginal histograms of each variable along the top and right edges.

import {
  Constraint,
  bin,
  chart,
  circle,
  derive,
  layer,
  rect,
  scatter,
} from "gofish-graphics";
import { penguins } from "./dataset";
const container = document.getElementById("app");
// Our penguins export uses "Beak ..." rather than seaborn's "bill ..." field names.
const data = penguins
  .filter((d) => d["Beak Length (mm)"] != null && d["Beak Depth (mm)"] != null)
  .map((d, i) => ({ ...d, id: i }));
(async () => {
  const sc = await chart(data)
    .flow(scatter({ by: "id", x: "Beak Length (mm)", y: "Beak Depth (mm)" }))
    .mark(circle({ r: 3, fill: "steelblue", fillOpacity: 0.6 }))
    .resolve();
  sc.name("scatter");
  const topHist = await chart(data, { h: 80 })
    .flow(
      derive(bin("Beak Length (mm)")),
      scatter({ xMin: "start", xMax: "end" }),
    )
    .mark(rect({ h: "count", fill: "steelblue" }))
    .resolve();
  topHist.name("topHist");
  const rightHist = await chart(data, { w: 80 })
    .flow(
      derive(bin("Beak Depth (mm)")),
      scatter({ yMin: "start", yMax: "end" }),
    )
    .mark(rect({ w: "count", fill: "steelblue" }))
    .resolve();
  rightHist.name("rightHist");
  const GAP = 10;
  await layer([sc, topHist, rightHist])
    .relate(({ scatter, topHist, rightHist }) => [
      Constraint.position({ x: 0, y: 0, anchor: "baseline" }, [scatter]),
      Constraint.align({ x: "baseline" }, [scatter, topHist]),
      Constraint.align({ y: "baseline" }, [scatter, rightHist]),
      Constraint.position({ y: 400 + GAP, anchor: "start" }, [topHist]),
      Constraint.position({ x: 400 + GAP, anchor: "start" }, [rightHist]),
    ])
    .render(container, {
      w: 400,
      h: 400,
      axes: {
        x: { title: "Beak Length (mm)" },
        y: { title: "Beak Depth (mm)" },
      },
    });
})();
