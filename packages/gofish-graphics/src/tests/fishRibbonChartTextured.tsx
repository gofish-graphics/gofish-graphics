/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
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
  /* Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5], */
  Bass: "url(#diamondFill)",
  Trout: "url(#diagonalLeftFill)",
  Catfish: "url(#denseDottedFill)",
  Perch: "url(#crossFill)",
  Salmon: "url(#diagonalRightFill)",
};

export const testFishRibbonChartTextured = () =>
  frame([
    stackX(
      { spacing: 128, sharedScale: true },
      _(seafood)
        .groupBy("lake")
        .map((d) =>
          stackY(
            { spacing: 2 },
            _(d)
              .orderBy("count", "desc")
              .map((d) =>
                rect({
                  name: `${d.lake}-${d.species}`,
                  w: 16,
                  h: value(d.count),
                  // fill: value(d.species),
                  fill: fishColors[d.species as keyof typeof fishColors],
                  stroke: "black",
                  strokeWidth: 3,
                })
              )
              .value()
          )
        )
        .value()
    ),
    ..._(seafood)
      .groupBy("species")
      .map((items) =>
        area(
          { dir: "x", opacity: 0.8, stroke: "black", strokeWidth: 3, mixBlendMode: "multiply" },
          items.map((d) => ref(`${d.lake}-${d.species}`))
        )
      )
      .value(),
  ]);
