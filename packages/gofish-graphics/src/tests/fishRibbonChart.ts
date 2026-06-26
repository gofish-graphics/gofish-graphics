/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { rect } from "../ast/shapes/rect";
import { stack } from "../ast/graphicalOperators/stack";
import { color, color6 } from "../color";
import { seafood } from "../data/catch";
import _ from "lodash";
import { layer } from "../ast/graphicalOperators/layer";
import { ref } from "../ast/shapes/ref";
import { stackX } from "../ast/graphicalOperators/stackX";
import { stackY } from "../ast/graphicalOperators/stackY";
import { area } from "../lib";
import { frame } from "../ast/graphicalOperators/frame";
const fishColors = {
  Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5],
};

export const testFishRibbonChart = () =>
  frame([
    stackX(
      { spacing: 64, sharedScale: true },
      _(seafood)
        .groupBy("lake")
        .map((d) =>
          stackY(
            { spacing: 0 },
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
        area(
          { dir: "x", opacity: 0.8, mixBlendMode: "multiply" },
          items.map((d) => ref(`${d.lake}-${d.species}`))
        )
      )
      .value(),
  ]);
