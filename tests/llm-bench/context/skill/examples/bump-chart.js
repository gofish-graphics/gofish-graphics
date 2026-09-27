// Bump Chart
// A bump chart tracing the popularity ranking of new-car colors from 2000 to 2015, with one colored line per color rising and falling through the yearly rank positions.

import { ellipse, frame, line, map, spread, v } from "gofish-graphics";
import { groupBy } from "lodash";
import _ from "lodash";
import { newCarColors } from "./dataset";
const container = document.getElementById("app");
frame({}, [
  map(groupBy(newCarColors, "Year"), (d, key) =>
    spread(
      {
        dir: "y",
        x: (key - 2000) * 30,
        spacing: 16,
        alignment: "start",
      },
      map(_.sortBy(d, "Rank"), (d) =>
        ellipse({ w: 8, h: 8, fill: v(d.Color) }).name(`${d.Color}-${d.Year}`),
      ),
    ),
  ),
])
  .relate((names) =>
    map(groupBy(newCarColors, "Color"), (d) =>
      line(
        // Default curve: the connection (y) axis is the ordinal rank stack,
        // so it resolves to straight segments between each year's rank.
        { dir: "y", strokeWidth: 2 },
        map(d, (d) => names[`${d.Color}-${d.Year}`]),
      ),
    ),
  )
  .render(container, {});
