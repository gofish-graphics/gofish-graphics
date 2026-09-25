import { coord, map, groupBy, polar_DEPRECATED, rect, stack, stackX, v } from "../lib";
import { nightingale } from "../data/nightingale";

export const testRoseChart = () =>
  coord({ transform: polar_DEPRECATED() }, [
    stack(
      { y: -Math.PI / 2, dir: 1, spacing: 0, alignment: "start" },
      map(groupBy(nightingale, "Month"), (d, i) =>
        stackX(
          { spacing: 0 },
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
