/* import { layout } from "../components/layout";
import { rect } from "../components/rect";
import { stack } from "../components/stack";
import { d as $d } from "../components/data"; */

import { value } from "../ast/data";
import { rect } from "../ast/shapes/rect";
import { color, color6 } from "../color";
import { seafood } from "../data/catch";
import _ from "lodash";
import { stackY } from "../ast/graphicalOperators/stackY";
import { map } from "../ast/iterators/map";
import { spreadX } from "../ast/graphicalOperators/spreadX";
const fishColors = {
  Bass: color.blue[5],
  Trout: color.red[5],
  Catfish: color.green[5],
  Perch: color.yellow[5],
  Salmon: color.purple[5],
};

export const testFishStackedBar = () =>
  spreadX(
    { spacing: 0},
    map(_(seafood).groupBy("lake"), (d, key) =>
      stackY(
        { key: key as string},
        map(d, (d) =>
          rect({ w: 32, h: value(d.count), fill: value(d.species) })
        )
      )
    )
  );
