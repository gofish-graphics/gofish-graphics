/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { gofish } from "../ast/gofish";
import { rect } from "../ast/shapes/rect";
import { color, color6 } from "../color";
import { seafood } from "../data/catch";
import _ from "lodash";
import { layer } from "../ast/graphicalOperators/layer";
import { ref } from "../ast/shapes/ref";
import { coord } from "../ast/coordinateTransforms/coord";
import { polar_DEPRECATED } from "../ast/coordinateTransforms/polar_DEPRECATED";
import { clock } from "../ast/coordinateTransforms/clock";
import { stackY } from "../ast/graphicalOperators/stackY";
import { ribbon, spreadX } from "../lib";
// import { fishData } from "../data/fish";

const colorScale = {
  Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5],
};

/* TODO: I need to redo the coordinate system so that it start from the bottom left corner... */
export const testFishPolarRibbonChart = () =>
  layer({ coord: clock() }, [
    spreadX(
      {
        y: 50,
        spacing: 0,
        alignment: "start",
      },
      Object.entries(_.groupBy(seafood, "lake")).map(([lake, items]) =>
        stackY(
          {},
          _(items)
            /* TODO: changing this to asc gives the correct order but the wrong colors */
            .orderBy("count", "asc")
            .map((d) =>
              rect({
                name: `${d.lake}-${d.species}`,
                w: 0.1,
                h: value(d.count),
                fill: value(d.species),
              })
            )
            .value()
        )
      )
    ),
    ..._(seafood)
      .groupBy("species")
      .map((items, species) =>
        ribbon(
          { dir: "x", opacity: 0.8, blendMode: "multiply" },
          items.map((d) => ref(`${d.lake}-${d.species}`))
        )
      )
      .value(),
  ]);
