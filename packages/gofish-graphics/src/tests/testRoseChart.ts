import { map, groupBy, rect, v, spread, spreadX } from "../lib";
import { coord } from "../ast/coordinateTransforms/coord";
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
import { nightingale } from "../data/nightingale";

export const testRoseChart = () =>
  coord({ transform: polar_DEPRECATED() }, [
    spread(
      { y: -Math.PI / 2, dir: 1, spacing: 0, alignment: "start" },
      map(groupBy(nightingale, "Month"), (d, i) =>
        spreadX(
          { spacing: 0},
          map(d, (d) =>
            rect({
              w: Math.sqrt(d.Death) * 3,
              h: /* value(d.b, "value") */ (Math.PI * 2) / 12,
              emY: true,
              // fill: color6[i % 6],
              fill: v(d.Type),
              stroke: "white",
            })
          )
        )
      )
    ),
  ]);
