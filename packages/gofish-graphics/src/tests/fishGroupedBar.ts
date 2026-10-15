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
import { stackX } from "../ast/graphicalOperators/stackX";
const fishColors = {
  Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5],
};

export const testFishGroupedBar = () =>
  stackX(
    { spacing: 12 },
    _(seafood)
      .groupBy("lake")
      .map((d, key) =>
        stackX(
          { key: key as string, spacing: 1 },
          d.map((d) =>
            rect({ w: 8, h: value(d.count), fill: value(d.species) })
          )
        )
      )
      .value()
  );
