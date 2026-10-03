// Nested Waffle Chart
// Titanic survival by passenger class shown as nested waffle grids, where colored dots fill each block in proportion to the count it represents.

import { color6, ellipse, gray, spreadX, spreadY } from "gofish-graphics";
import _ from "lodash";
import { titanic } from "./dataset";
const classColor = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};
const container = document.getElementById("app");
spreadY(
  { dir: "y", spacing: 8, alignment: "middle", sharedScale: true },
  _(titanic)
    .groupBy("class")
    .map((cls) =>
      spreadX(
        { spacing: 4, alignment: "end" },
        _(cls)
          .groupBy("sex")
          .map((sex) =>
            spreadY(
              { spacing: 0.5, alignment: "start" },
              _(sex) // Was missing this lodash chain before .reverse()
                .reverse()
                .flatMap((d) => Array(d.count).fill(d))
                .chunk(
                  Math.ceil(
                    (_(sex).sumBy("count") / _(cls).sumBy("count")) * 32,
                  ),
                )
                .reverse()
                .map((d) =>
                  spreadX(
                    { spacing: 0.5, alignment: "start" },
                    d.map((d) =>
                      ellipse({
                        w: 4,
                        h: 4,
                        fill:
                          d.survived === "No"
                            ? gray
                            : /* value(d.class) */ classColor[d.class],
                      }),
                    ),
                  ),
                )
                .value(),
            ),
          )
          .value(),
      ),
    )
    .value(),
).render(container, {
  axes: true,
});
