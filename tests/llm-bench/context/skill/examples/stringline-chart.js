// Stringline Chart
// A Marey train schedule plotting Caltrain stations against time, with each colored diagonal line tracing a single northbound or southbound run.

import { ellipse, layer, line, map, rect, spreadY, v } from "gofish-graphics";
import { groupBy } from "lodash";
import _ from "lodash";
import { caltrain, caltrainStopOrder } from "./dataset";
const container = document.getElementById("app");
const caltrainProcessed = caltrain.filter((d) => d.Type !== "Bullet");
layer({}, [
  spreadY(
    {
      spacing: 8,
      alignment: "start",
    },
    map(
      groupBy(
        _.orderBy(
          caltrainProcessed,
          (d) => caltrainStopOrder.indexOf(d.Station),
          "desc",
        ),
        "Station",
      ),
      (d, key) =>
        layer({ key }, [
          rect({ w: 0, h: 0 }),
          map(d, (d) =>
            ellipse({
              x: d.Time / 3,
              w: 4,
              h: 4,
              fill: v(d.Direction),
            }).name(`${d.Train}-${d.Station}-${d.Time}`),
          ),
        ]),
    ),
  ),
])
  .relate((names) =>
    map(groupBy(caltrainProcessed, "Train"), (d) =>
      line(
        // Default curve: the connection (y) axis is the ordinal station
        // stack, so it resolves to a straight polyline between stops.
        { dir: "y", strokeWidth: 1 },
        map(d, (d) => names[`${d.Train}-${d.Station}-${d.Time}`]),
      ),
    ),
  )
  .render(container, {
    axes: true,
  });
