import _ from "lodash";
import { gofish } from "../ast/gofish";
import { value } from "../ast/data";
import { spread } from "../ast/graphicalOperators/spread";
import { rect } from "../ast/shapes/rect";
import {
  black,
  color,
  color6,
  color6_old,
  tailwindColors,
  tailwindColorsVivid,
  gray,
} from "../color";
import { titanic } from "../data/titanic";
import { mix } from "spectral.js";
import { seafood } from "../data/catch";
import { ellipse } from "../ast/shapes/ellipse";
import { enclose } from "../ast/graphicalOperators/enclose";
import { stackX, stackY } from "../lib";

const data = [
  { origin: "Europe", cylinders: "4", count: 66 },
  { origin: "Europe", cylinders: "5", count: 3 },
  { origin: "Europe", cylinders: "6", count: 4 },
  { origin: "Japan", cylinders: "3", count: 4 },
  { origin: "Japan", cylinders: "4", count: 69 },
  { origin: "Japan", cylinders: "6", count: 6 },
  { origin: "USA", cylinders: "4", count: 72 },
  { origin: "USA", cylinders: "6", count: 74 },
  { origin: "USA", cylinders: "8", count: 108 },
];

const classColor = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};

export const testNestedWaffle = () =>
  stackY(
    { spacing: 8, alignment: "middle", sharedScale: true },
    _(titanic)
      .groupBy("class")
      .map((cls) =>
        stackX(
          { spacing: 4 },
          _(cls)
            .groupBy("sex")
            .map((sex) =>
              enclose({}, [
                stackY(
                  { spacing: 0.5, alignment: "end" },
                  _(sex) // Was missing this lodash chain before .reverse()
                    .reverse()
                    .flatMap((d) => Array(d.count).fill(d))
                    .chunk(
                      Math.ceil(
                        (_(sex).sumBy("count") / _(cls).sumBy("count")) * 32
                      )
                    )
                    .reverse()
                    .map((d) =>
                      spread({ dir: "x", spacing: 0.5, alignment: "end" },
                        d.map((d) =>
                          ellipse({
                            w: 4,
                            h: 4,
                            fill:
                              d.survived === "No"
                                ? gray
                                : /* value(d.class) */ classColor[
                                    d.class as keyof typeof classColor
                                  ],
                          })
                        )
                      )
                    )
                    .value()
                ),
              ])
            )
            .value()
        )
      )
      .value()
  );
