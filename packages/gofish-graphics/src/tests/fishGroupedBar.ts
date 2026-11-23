/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { rect } from "../ast/shapes/rect";
import { color, color6 } from "../color";
import { seafood } from "../data/catch";
import _ from "lodash";
import { spreadX } from "../ast/graphicalOperators/spreadX";
const fishColors = {
  Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5],
};

export const testFishGroupedBar = () =>
  spreadX(
    { spacing: 0},
    _(seafood)
      .groupBy("lake")
      .map((d, key) =>
        spreadX(
          { key: key as string, spacing: 0},
          d.map((d) =>
            rect({ w: 8, h: value(d.count), fill: value(d.species) })
          )
        )
      )
      .value()
  );
