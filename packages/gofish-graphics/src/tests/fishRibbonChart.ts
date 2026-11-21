/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { rect } from "../ast/shapes/rect";
import { color, color6 } from "../color";
import { seafood } from "../data/catch";
import _ from "lodash";
import { layer } from "../ast/graphicalOperators/layer";
import { ref } from "../ast/shapes/ref";
import { stackY } from "../ast/graphicalOperators/stackY";
import { ribbon, spreadX } from "../lib";
const fishColors = {
  Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5],
};

export const testFishRibbonChart = () =>
  layer([
    spreadX(
      { spacing: 0},
      _(seafood)
        .groupBy("lake")
        .map((d) =>
          stackY(
            {},
            _(d)
              .orderBy("count", "asc")
              .map((d) =>
                rect({
                  name: `${d.lake}-${d.species}`,
                  w: 16,
                  h: value(d.count),
                  fill: value(d.species),
                })
              )
              .value()
          )
        )
        .value()
    ),
    _(seafood)
      .groupBy("species")
      .map((items) =>
        ribbon(
          { dir: "x", opacity: 0.8, blendMode: "multiply" },
          items.map((d) => ref(`${d.lake}-${d.species}`))
        )
      )
      .value(),
  ]);
