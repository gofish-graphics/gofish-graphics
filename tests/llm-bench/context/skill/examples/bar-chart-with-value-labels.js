// Bar Chart with Value Labels
// A bar chart of total fish catch per lake with each bar's total annotated above it.

import { chart, group, rect, spread, sumBy, text } from "gofish-graphics";
import { seafood } from "./dataset";
const container = document.getElementById("app");
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x" }))
  .mark(rect({ h: "count" }))
  // `.layer()`'s empty scope yields one ref per lake; each ref's datum is
  // that lake's array of species records (an aggregate). `by: "lake"`
  // resolves because every row in a lake agrees on `lake` (homogeneity
  // collapse), giving one frame per lake; sum the aggregate's rows for the
  // per-lake total label.
  .layer(
    chart()
      .flow(group({ by: "lake" }))
      .mark((d) => {
        return spread({ dir: "y", alignment: "middle", spacing: 10 }, [
          d[0],
          text({ text: String(sumBy(d[0].datum, "count")) }),
        ]);
      }),
  )
  .render(container, {
    w: 400,
    h: 400,
  });
