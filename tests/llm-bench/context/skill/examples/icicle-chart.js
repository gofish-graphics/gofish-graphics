// Icicle Chart
// Titanic passengers broken down by class and then survival as an icicle diagram, with nested rectangles in successive columns sized to encode each group's count.

import { color6, gray, neutral, rect, stackX, stackY } from "gofish-graphics";
import _ from "lodash";
import { titanic } from "./dataset";
const classColor = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};
const container = document.getElementById("app");
stackX({ alignment: "middle" }, [
  rect({
    w: 40,
    h: _(titanic).sumBy("count") / 10,
    fill: neutral,
  }),
  stackY(
    { alignment: "middle" },
    _(titanic)
      .groupBy("class")
      .map((items, cls) =>
        stackX(
          {
            h: _(items).sumBy("count") / 10,
            alignment: "start",
          },
          [
            rect({ w: 40, fill: classColor[cls] }),
            stackY(
              { alignment: "middle" },
              _(items)
                .groupBy("sex")
                .map((items, sex) =>
                  stackX({ alignment: "middle" }, [
                    rect({
                      w: 0,
                      h: _(items).sumBy("count") / 10,
                      fill: sex === "Female" ? color6[4] : color6[5],
                    }),
                    stackY(
                      {
                        w: 40,
                        alignment: "middle",
                      },
                      _(items)
                        .groupBy("survived")
                        .map((survivedItems, survived) => {
                          return rect({
                            h: _(survivedItems).sumBy("count") / 10,
                            fill:
                              sex === "Female"
                                ? survived === "No"
                                  ? gray
                                  : color6[4]
                                : survived === "No"
                                  ? gray
                                  : color6[5],
                          });
                        })
                        .value(),
                    ),
                  ]),
                )
                .value(),
            ),
          ],
        ),
      )
      .value(),
  ),
]).render(container, {
  axes: true,
});
